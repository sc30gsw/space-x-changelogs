import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient } from "@libsql/client";
import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql/web";
import { migrate } from "drizzle-orm/libsql/migrator";
import {
  databaseSchema,
  entries,
  memos,
  sources,
  tracks,
  type AppDatabase,
  type Entry,
  type EntryWithMemos,
  type MemoWithEntry,
  type SourceWithTrack,
  type TrackWithSources,
} from "../src/lib/db/schema.ts";
import {
  commitCatchUp,
  commitIngest as ingestEntry,
  commitMemo as saveMemo,
  commitRemoveEntries as removeEntries,
} from "../src/lib/db/write.ts";
import { botToolSpecs, runBotTool, type BotDoors } from "../src/features/bots/utils/bot-tools.ts";
import { entryKinds } from "../src/utils/kinds.ts";

const scratchRoot = mkdtempSync(join(tmpdir(), "entry-lifecycle-"));
let databaseSerial = 0;
let clock = 0;

const urls = [
  "https://example.test/a",
  "https://example.test/b",
  "https://example.test/c",
  "https://example.test/d",
] as const;

const tracksSeed = [
  { id: "track-cursor", name: "Cursor", slug: "cursor" },
  { id: "track-grok-bot", name: "Grok Bot", slug: "grok-bot" },
] as const;

type OperationKind = "submit" | "caughtUp" | "memo" | "delete";

type Recorded = {
  id: string;
  url: string;
  caughtUp: boolean;
  title: string;
  trackId: string;
  kind: Entry["kind"];
  publishedAt: string;
  summary: string;
  body: string;
  createdAt: string;
  updatedAt: string;
  memoIds: string[];
};

const fail = (message: string): never => {
  throw new Error(message);
};

const defined = <T>(value: T | undefined, message: string): T => {
  if (value === undefined) {
    return fail(message);
  }
  return value;
};

const mulberry32 = (seed: number) => () => {
  let next = (seed + 0x6d2b79f5) | 0;
  seed = next;
  let state = Math.imul(next ^ (next >>> 15), 1 | next);
  state = (state + Math.imul(state ^ (state >>> 7), 61 | state)) ^ state;
  return ((state ^ (state >>> 14)) >>> 0) / 4294967296;
};

const nextNow = (): string => {
  clock += 1;
  return new Date(Date.UTC(2026, 10, 2, 0, 0, clock)).toISOString();
};

const kindAt = (index: number): Entry["kind"] =>
  defined(entryKinds[Math.abs(index) % entryKinds.length], "missing Entry kind");

const openDb = async (): Promise<AppDatabase> => {
  databaseSerial += 1;
  const client = createClient({
    url: `file:${join(scratchRoot, `${databaseSerial}.db`)}`,
    concurrency: 8,
    timeout: 0,
  });
  const db = drizzle({ client, schema: databaseSchema });
  await migrate(db, { migrationsFolder: "drizzle" });
  await db.run(sql`PRAGMA journal_mode = WAL`);
  await db.run(sql`PRAGMA foreign_keys = ON`);
  await db.insert(tracks).values([...tracksSeed]);
  return db;
};

const readEntry = async (db: AppDatabase, id: string): Promise<Entry | undefined> => {
  const rows = await db.select().from(entries).where(eq(entries.id, id)).limit(1);
  return rows[0];
};

const snapshot = async (db: AppDatabase): Promise<Recorded[]> => {
  const entryRows = await db.select().from(entries);
  const memoRows = await db.select().from(memos);
  return entryRows.map((row) => ({
    id: row.id,
    url: row.url,
    caughtUp: row.caughtUp,
    title: row.title,
    trackId: row.trackId,
    kind: row.kind,
    publishedAt: row.publishedAt,
    summary: row.summary,
    body: row.body,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    memoIds: memoRows
      .filter((memo) => memo.entryId === row.id)
      .map((memo) => memo.id)
      .toSorted(),
  }));
};

const sameMemos = (actual: string[], expected: string[]): boolean =>
  actual.length === expected.length && actual.every((id, index) => id === expected[index]);

const matches = (actual: Recorded[], expected: Recorded[]): void => {
  const seen = actual.map((row) => row.url);
  if (new Set(seen).size !== seen.length) {
    fail(`duplicate 原文 URL: ${seen.join(", ")}`);
  }
  if (actual.length !== expected.length) {
    fail(`expected ${expected.length} entries, found ${actual.length}`);
  }
  for (const row of expected) {
    const found = defined(
      actual.find((item) => item.url === row.url),
      `missing entry for ${row.url}`,
    );
    if (found.id !== row.id) {
      fail(`原文 URL ${row.url} changed Entry id from ${row.id} to ${found.id}`);
    }
    if (found.caughtUp !== row.caughtUp) {
      fail(`原文 URL ${row.url} Caught up is ${found.caughtUp}, expected ${row.caughtUp}`);
    }
    if (found.title !== row.title) {
      fail(`原文 URL ${row.url} title is ${found.title}, expected ${row.title}`);
    }
    if (found.trackId !== row.trackId || found.kind !== row.kind) {
      fail(`原文 URL ${row.url} changed Track or kind`);
    }
    if (
      found.publishedAt !== row.publishedAt ||
      found.summary !== row.summary ||
      found.body !== row.body
    ) {
      fail(`原文 URL ${row.url} changed published text`);
    }
    if (found.createdAt !== row.createdAt) {
      fail(`原文 URL ${row.url} changed createdAt`);
    }
    if (!sameMemos(found.memoIds, row.memoIds)) {
      fail(`原文 URL ${row.url} lost Memo rows`);
    }
  }
};

const applyContent = (
  row: Recorded,
  input: {
    title: string;
    trackId: string;
    kind: Entry["kind"];
    publishedAt: string;
    summary: string;
    body: string;
    now: string;
  },
): void => {
  row.title = input.title;
  row.trackId = input.trackId;
  row.kind = input.kind;
  row.publishedAt = input.publishedAt;
  row.summary = input.summary;
  row.body = input.body;
  row.updatedAt = input.now;
};

const applySubmit = (
  recorded: Recorded[],
  input: {
    id?: string;
    url: string;
    title: string;
    trackId: string;
    kind: Entry["kind"];
    publishedAt: string;
    summary: string;
    body: string;
    now: string;
  },
  returned: Entry,
): void => {
  const byUrl = recorded.find((row) => row.url === input.url);
  if (byUrl !== undefined) {
    if (returned.id !== byUrl.id || returned.caughtUp !== byUrl.caughtUp) {
      fail(`overwrite of ${input.url} moved id or Caught up`);
    }
    applyContent(byUrl, input);
    return;
  }

  const byId = input.id === undefined ? undefined : recorded.find((row) => row.id === input.id);
  if (byId !== undefined) {
    if (returned.id !== byId.id || returned.caughtUp !== byId.caughtUp) {
      fail(`edit of ${byId.url} moved id or Caught up`);
    }
    byId.url = input.url;
    applyContent(byId, input);
    return;
  }

  if (returned.caughtUp !== false) {
    fail(`new Entry ${input.url} was not Unread`);
  }
  recorded.push({
    id: returned.id,
    url: returned.url,
    caughtUp: false,
    title: input.title,
    trackId: input.trackId,
    kind: input.kind,
    publishedAt: input.publishedAt,
    summary: input.summary,
    body: input.body,
    createdAt: input.now,
    updatedAt: input.now,
    memoIds: [],
  });
};

const submit = async (
  db: AppDatabase,
  recorded: Recorded[],
  input: {
    id?: string;
    url: string;
    title: string;
    trackId?: string;
    kind?: Entry["kind"];
    now?: string;
  },
): Promise<Entry> => {
  const payload = {
    id: input.id,
    trackId: input.trackId ?? "track-cursor",
    kind: input.kind ?? "Release",
    title: input.title,
    url: input.url,
    publishedAt: "2026-11-02T00:00:00.000Z",
    summary: "要約です。",
    body: "本文",
    now: input.now ?? nextNow(),
  };
  const returned = await ingestEntry(db, payload);
  applySubmit(recorded, payload, returned);
  matches(await snapshot(db), recorded);
  return returned;
};

const assertCaughtUpWrite = (before: Entry, after: Entry, caughtUp: boolean, now: string): void => {
  if (after.caughtUp !== caughtUp) {
    fail(`setCaughtUp of ${before.id} left Caught up ${String(after.caughtUp)}`);
  }
  if (after.updatedAt !== now) {
    fail(`setCaughtUp of ${before.id} left updatedAt ${after.updatedAt}`);
  }
  if (after.id !== before.id) {
    fail(`setCaughtUp of ${before.id} changed id`);
  }
  if (after.trackId !== before.trackId) {
    fail(`setCaughtUp of ${before.id} changed trackId`);
  }
  if (after.kind !== before.kind) {
    fail(`setCaughtUp of ${before.id} changed kind`);
  }
  if (after.title !== before.title) {
    fail(`setCaughtUp of ${before.id} changed title`);
  }
  if (after.url !== before.url) {
    fail(`setCaughtUp of ${before.id} changed url`);
  }
  if (after.publishedAt !== before.publishedAt) {
    fail(`setCaughtUp of ${before.id} changed publishedAt`);
  }
  if (after.summary !== before.summary) {
    fail(`setCaughtUp of ${before.id} changed summary`);
  }
  if (after.body !== before.body) {
    fail(`setCaughtUp of ${before.id} changed body`);
  }
  if (after.createdAt !== before.createdAt) {
    fail(`setCaughtUp of ${before.id} changed createdAt`);
  }
};

const catchUp = async (
  db: AppDatabase,
  recorded: Recorded[],
  id: string,
  caughtUp: boolean,
  now: string,
): Promise<void> => {
  const before = defined(await readEntry(db, id), `Entry ${id} was missing before Caught up`);
  await commitCatchUp(db, [{ id, caughtUp }], now);
  const after = defined(await readEntry(db, id), `Entry ${id} was missing after Caught up`);
  assertCaughtUpWrite(before, after, caughtUp, now);
  const target = defined(
    recorded.find((row) => row.id === id),
    `model lost Entry ${id}`,
  );
  target.caughtUp = caughtUp;
  target.updatedAt = now;
  matches(await snapshot(db), recorded);
};

const addMemo = async (
  db: AppDatabase,
  recorded: Recorded[],
  id: string,
  entryId: string,
  body: string,
  now: string,
): Promise<void> => {
  await saveMemo(db, { id, entryId, body, now });
  const target = defined(
    recorded.find((row) => row.id === entryId),
    `model lost Entry ${entryId}`,
  );
  target.memoIds = [...target.memoIds, id].toSorted();
  matches(await snapshot(db), recorded);
};

const assertDelete = async (db: AppDatabase, ids: readonly string[]): Promise<void> => {
  const beforeEntries = await db.select().from(entries);
  const beforeMemos = await db.select().from(memos);
  await removeEntries(db, ids);
  const afterEntries = await db.select().from(entries);
  const afterMemos = await db.select().from(memos);
  for (const id of ids) {
    if (afterEntries.some((row) => row.id === id)) {
      fail(`deleted Entry ${id} is still present`);
    }
    const leftover = afterMemos.find((memo) => memo.entryId === id);
    if (leftover !== undefined) {
      fail(`deleted Entry ${id} left Memo ${leftover.id}`);
    }
  }
  for (const row of beforeEntries) {
    if (ids.includes(row.id)) {
      continue;
    }
    if (!afterEntries.some((entry) => entry.id === row.id)) {
      fail(`delete removed an Entry that was kept`);
    }
  }
  for (const memo of beforeMemos) {
    if (ids.includes(memo.entryId)) {
      continue;
    }
    if (!afterMemos.some((row) => row.id === memo.id)) {
      fail(`delete removed Memo of an Entry that was kept`);
    }
  }
};

const removeFromModel = (recorded: Recorded[], ids: readonly string[]): Recorded[] =>
  recorded.filter((row) => !ids.includes(row.id));

const operationKind = (roll: number): OperationKind => {
  if (roll < 0.5) {
    return "submit";
  }
  if (roll < 0.72) {
    return "caughtUp";
  }
  if (roll < 0.88) {
    return "memo";
  }
  return "delete";
};

const assertRelations = async (db: AppDatabase, entryId: string): Promise<void> => {
  const entry = defined(
    await db.query.entries.findFirst({
      where: eq(entries.id, entryId),
      with: { track: true, memos: true },
    }),
    `Entry ${entryId} relation was missing`,
  );
  const linked: EntryWithMemos = entry;
  if (linked.track.id !== "track-cursor") {
    fail(`Entry ${entryId} relation pointed at ${linked.track.id}`);
  }
  const memo = defined(linked.memos[0], `Entry ${entryId} relation had no Memo`);
  const memoRow = defined(
    await db.query.memos.findFirst({
      where: eq(memos.id, memo.id),
      with: { entry: true },
    }),
    `Memo ${memo.id} relation was missing`,
  );
  const memoLink: MemoWithEntry = memoRow;
  if (memoLink.entry === null || memoLink.entry.id !== entryId) {
    fail(`Memo ${memo.id} pointed at the wrong Entry`);
  }

  const track = defined(
    await db.query.tracks.findFirst({
      where: eq(tracks.id, "track-cursor"),
      with: { sources: true },
    }),
    "Track relation was missing",
  );
  const trackLink: TrackWithSources = track;
  if (!trackLink.sources.some((source) => source.id === "source-cursor-notes")) {
    fail("Track relation dropped Source 公開ノート");
  }
  const source = defined(
    await db.query.sources.findFirst({
      where: eq(sources.id, "source-cursor-notes"),
      with: { track: true },
    }),
    "Source relation was missing",
  );
  const sourceLink: SourceWithTrack = source;
  if (sourceLink.track === null || sourceLink.track.slug !== "cursor") {
    fail("Source relation pointed at the wrong Track");
  }
};

const runCascade = async (): Promise<void> => {
  const db = await openDb();
  await db.insert(sources).values({
    id: "source-cursor-notes",
    trackId: "track-cursor",
    label: "公開ノート",
    url: "https://example.test/source",
    position: 0,
  });
  const recorded: Recorded[] = [];
  const kept = await submit(db, recorded, {
    url: "https://example.test/keep",
    title: "残す原文",
    now: "2026-11-02T00:00:01.000Z",
  });
  const unread = await readEntry(db, kept.id);
  const unreadAgain = await readEntry(db, kept.id);
  if (
    unread === undefined ||
    unreadAgain === undefined ||
    unread.caughtUp !== false ||
    unreadAgain.updatedAt !== unread.updatedAt ||
    unreadAgain.caughtUp !== unread.caughtUp
  ) {
    fail("reading an Entry changed Caught up");
  }

  const target = await submit(db, recorded, {
    url: "https://example.test/a",
    title: "最初の原文",
    now: "2026-11-02T00:00:02.000Z",
  });
  await catchUp(db, recorded, target.id, true, "2026-11-02T00:00:03.000Z");
  await addMemo(
    db,
    recorded,
    "memo-target",
    target.id,
    "<p>上書きしても残る学び</p>",
    "2026-11-02T00:00:04.000Z",
  );
  await assertRelations(db, target.id);
  await submit(db, recorded, {
    url: target.url,
    title: "上書きした原文",
    now: "2026-11-02T00:00:05.000Z",
  });
  await addMemo(
    db,
    recorded,
    "memo-kept",
    kept.id,
    "<p>一緒には消えない</p>",
    "2026-11-02T00:00:06.000Z",
  );

  const raced = await Promise.all([
    ingestEntry(db, {
      trackId: "track-cursor",
      kind: "X Post",
      title: "再同時 A",
      url: target.url,
      publishedAt: "2026-11-02T00:00:00.000Z",
      summary: "更新。",
      body: "A",
      now: "2026-11-02T00:00:07.000Z",
    }),
    ingestEntry(db, {
      trackId: "track-cursor",
      kind: "Pull Request",
      title: "再同時 B",
      url: target.url,
      publishedAt: "2026-11-02T00:00:00.000Z",
      summary: "更新。",
      body: "B",
      now: "2026-11-02T00:00:07.000Z",
    }),
  ]);
  if (raced[0]?.id !== target.id || raced[1]?.id !== target.id) {
    fail("concurrent overwrite created a second Entry");
  }
  if (raced[0]?.caughtUp !== true || raced[1]?.caughtUp !== true) {
    fail("concurrent overwrite cleared Caught up");
  }
  const afterRace = await snapshot(db);
  const racedRow = defined(
    afterRace.find((row) => row.url === target.url),
    "concurrent overwrite lost the Entry",
  );
  if (!racedRow.memoIds.includes("memo-target")) {
    fail("concurrent overwrite dropped Memo");
  }
  if (afterRace.filter((row) => row.url === target.url).length !== 1) {
    fail("concurrent overwrite duplicated the Entry");
  }
  const modelTarget = defined(
    recorded.find((row) => row.id === target.id),
    "model lost the overwritten Entry",
  );
  const winner = defined(
    raced.find((row) => row.title === racedRow.title),
    "concurrent overwrite returned a title the row does not have",
  );
  modelTarget.title = winner.title;
  modelTarget.kind = winner.kind;
  modelTarget.summary = winner.summary;
  modelTarget.body = winner.body;
  modelTarget.publishedAt = winner.publishedAt;
  modelTarget.updatedAt = winner.updatedAt;
  modelTarget.caughtUp = true;
  matches(afterRace, recorded);

  await assertDelete(db, [target.id]);
  const remaining = removeFromModel(recorded, [target.id]);
  matches(await snapshot(db), remaining);
  await removeEntries(db, []);
  matches(await snapshot(db), remaining);
};

const runGenerated = async (): Promise<void> => {
  const random = mulberry32(20261102);
  const pick = <T>(items: readonly T[]): T =>
    defined(items[Math.floor(random() * items.length)], "empty pick");
  for (let trial = 0; trial < 24; trial += 1) {
    const db = await openDb();
    let recorded: Recorded[] = [];
    for (let step = 0; step < 12; step += 1) {
      const kind = recorded.length === 0 ? "submit" : operationKind(random());
      switch (kind) {
        case "submit": {
          const existing = recorded.length > 0 && random() < 0.7 ? pick(recorded) : undefined;
          const free = urls.find((item) => recorded.every((row) => row.url !== item));
          const rename = existing !== undefined && free !== undefined && random() < 0.15;
          const url = rename && free !== undefined ? free : (existing?.url ?? pick(urls));
          await submit(db, recorded, {
            id: rename ? existing?.id : undefined,
            url,
            title: `t${trial}-${step}`,
            trackId: pick(tracksSeed).id,
            kind: kindAt(trial + step),
          });
          break;
        }
        case "caughtUp": {
          const target = pick(recorded);
          await catchUp(db, recorded, target.id, random() < 0.5, nextNow());
          break;
        }
        case "memo": {
          const target = pick(recorded);
          await addMemo(
            db,
            recorded,
            `memo-${trial}-${step}`,
            target.id,
            `<p>${trial}-${step}</p>`,
            nextNow(),
          );
          break;
        }
        case "delete": {
          const target = pick(recorded);
          await assertDelete(db, [target.id]);
          recorded = removeFromModel(recorded, [target.id]);
          matches(await snapshot(db), recorded);
          break;
        }
        default: {
          const unreachable: never = kind;
          fail(unreachable);
        }
      }
    }
  }
};

const assertCaughtUpRollsBack = async (): Promise<void> => {
  const db = await openDb();
  const saved = await ingestEntry(db, {
    id: "entry-a",
    trackId: "track-cursor",
    kind: "Release",
    title: "A",
    url: "https://example.test/rollback",
    publishedAt: "2026-11-02T00:00:00.000Z",
    summary: "要約です。",
    body: "",
    now: "2026-11-02T00:00:00.000Z",
  });
  let failed = false;
  try {
    await commitCatchUp(
      db,
      [
        { id: saved.id, caughtUp: true },
        { id: "entry-missing", caughtUp: true },
      ],
      "2026-11-02T01:00:00.000Z",
    );
  } catch (error) {
    failed =
      typeof error === "object" &&
      error !== null &&
      "_tag" in error &&
      error._tag === "RecordNotFound";
  }
  if (!failed) {
    fail("a missing Caught up id was accepted");
  }
  const row = defined(await readEntry(db, saved.id), "rolled back Entry is missing");
  if (row.caughtUp !== false) {
    fail("a failed Caught up left an earlier row Caught up");
  }
};

const emptyWorkspace = {
  tracks: [],
  sources: [],
  entries: [],
  memos: [],
  isLoading: false,
  isError: false,
};

const botDoors = (db: AppDatabase, now: string): BotDoors => ({
  ingestEntry: (input) => ingestEntry(db, { ...input, now }),
  catchUp: (marks) => commitCatchUp(db, marks, now),
  saveTrack: async () => fail("the bot lifecycle check called saveTrack"),
  saveSource: async () => fail("the bot lifecycle check called saveSource"),
  saveMemo: (input) => saveMemo(db, { ...input, now }),
  removeEntries: (ids) => removeEntries(db, ids),
  removeMemos: async () => fail("the bot lifecycle check called removeMemos"),
});

const toolNamed = (name: string) =>
  defined(
    botToolSpecs.find((spec) => spec.name === name),
    `missing bot tool ${name}`,
  );

const assertBotCatchUpRollsBack = async (): Promise<void> => {
  const db = await openDb();
  const saved = await ingestEntry(db, {
    id: "entry-bot",
    trackId: "track-cursor",
    kind: "Release",
    title: "Bot",
    url: "https://example.test/bot-rollback",
    publishedAt: "2026-11-03T00:00:00.000Z",
    summary: "bot",
    body: "",
    now: "2026-11-03T00:00:00.000Z",
  });
  const result = await runBotTool(
    toolNamed("catch_up"),
    {
      marks: [
        { id: saved.id, caughtUp: true },
        { id: "entry-missing", caughtUp: true },
      ],
    },
    botDoors(db, "2026-11-03T01:00:00.000Z"),
    emptyWorkspace,
  );
  if (typeof result !== "object" || result === null || !("error" in result)) {
    fail("bot catch_up hid a missing id");
  }
  const row = defined(await readEntry(db, saved.id), "bot rollback Entry is missing");
  if (row.caughtUp !== false) {
    fail("a failed bot catch_up left an earlier row Caught up");
  }
};

const main = async (): Promise<void> => {
  try {
    await runCascade();
    await runGenerated();
    await assertCaughtUpRollsBack();
    await assertBotCatchUpRollsBack();
    console.log(
      "entry lifecycle: 24 sequences of 12 operations, plus the screen cascade and the bot tool, held",
    );
  } finally {
    rmSync(scratchRoot, { recursive: true, force: true });
  }
};

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
