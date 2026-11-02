import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient } from "@libsql/client";
import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql/web";
import { migrate } from "drizzle-orm/libsql/migrator";
import { databaseSchema, entries, memos, tracks, type AppDatabase } from "../src/lib/db/schema.ts";
import {
  commitCatchUp,
  commitIngest as ingestEntry,
  commitMemo as saveMemo,
} from "../src/lib/db/write.ts";
import { entryKinds } from "../src/utils/kinds.ts";
const scratchRoot = mkdtempSync(join(tmpdir(), "entry-url-identity-"));
let databaseSerial = 0;
const urls = [
  "https://example.test/a",
  "https://example.test/b",
  "https://example.test/c",
  "https://example.test/d",
];
const tracksSeed = [
  { id: "track-cursor", name: "Cursor", slug: "cursor" },
  { id: "track-grok-bot", name: "Grok Bot", slug: "grok-bot" },
];

type Recorded = {
  id: string;
  url: string;
  caughtUp: boolean;
  title: string;
  memoIds: string[];
};

const fail = (message: string): never => {
  throw new Error(message);
};

const defined = <T>(value: T | undefined, message: string): T => {
  if (value === undefined) {
    throw new Error(message);
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
  await db.insert(tracks).values(tracksSeed);
  return db;
};

const snapshot = async (db: AppDatabase): Promise<{ entries: Recorded[]; memoCount: number }> => {
  const entryRows = await db.select().from(entries);
  const memoRows = await db.select().from(memos);
  return {
    entries: entryRows.map((row) => ({
      id: row.id,
      url: row.url,
      caughtUp: row.caughtUp,
      title: row.title,
      memoIds: memoRows
        .filter((memo) => memo.entryId === row.id)
        .map((memo) => memo.id)
        .toSorted(),
    })),
    memoCount: memoRows.length,
  };
};

const matches = (actual: Recorded[], expected: Recorded[]): void => {
  const urlsSeen = actual.map((row) => row.url);
  if (new Set(urlsSeen).size !== urlsSeen.length) {
    fail(`duplicate 原文 URL: ${urlsSeen.join(", ")}`);
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
    if (found.memoIds.join() !== row.memoIds.join()) {
      fail(`原文 URL ${row.url} lost Memo rows`);
    }
  }
};

const applySubmit = (
  recorded: Recorded[],
  input: { id?: string; url: string; title: string },
  returned: { id: string; url: string; caughtUp: boolean; title: string },
): void => {
  const byUrl = recorded.find((row) => row.url === input.url);
  if (byUrl !== undefined) {
    if (returned.id !== byUrl.id || returned.caughtUp !== byUrl.caughtUp) {
      fail(`overwrite of ${input.url} moved id or Caught up`);
    }
    byUrl.title = input.title;
    return;
  }

  const byId = input.id === undefined ? undefined : recorded.find((row) => row.id === input.id);
  if (byId !== undefined) {
    if (returned.id !== byId.id || returned.caughtUp !== byId.caughtUp) {
      fail(`edit of ${byId.url} moved id or Caught up`);
    }
    byId.url = input.url;
    byId.title = input.title;
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
    memoIds: [],
  });
};

const submit = async (
  db: AppDatabase,
  recorded: Recorded[],
  input: { id?: string; url: string; title: string; trackId?: string },
) => {
  const returned = await ingestEntry(db, {
    id: input.id,
    trackId: input.trackId ?? "track-cursor",
    kind: entryKinds[Math.abs(input.title.length) % entryKinds.length] ?? entryKinds[0],
    title: input.title,
    url: input.url,
    publishedAt: "2026-11-01T00:00:00.000Z",
    summary: "要約です。",
    body: "本文",
    now: "2026-11-01T00:00:00.000Z",
  });
  applySubmit(recorded, input, returned);
  const actual = await snapshot(db);
  matches(actual.entries, recorded);
};

const runScripted = async (): Promise<void> => {
  const db = await openDb();
  const recorded: Recorded[] = [];
  await submit(db, recorded, { url: urls[0] ?? "", title: "最初" });
  const first = recorded[0];
  if (first === undefined) {
    fail("missing first entry");
  }
  await commitCatchUp(db, [{ id: first.id, caughtUp: true }], "2026-11-01T01:00:00.000Z");
  first.caughtUp = true;
  const memo = await saveMemo(db, {
    id: "memo-1",
    entryId: first.id,
    body: "<p>学び</p>",
    now: "2026-11-01T01:00:00.000Z",
  });
  first.memoIds = [memo.id];
  await submit(db, recorded, { url: first.url, title: "上書き" });
  const again = await snapshot(db);
  matches(again.entries, recorded);
  if (again.entries.length !== 1) {
    fail("resubmit created a second Entry");
  }

  const fresh = await openDb();
  const concurrent = await Promise.all([
    ingestEntry(fresh, {
      trackId: "track-cursor",
      kind: "X Post",
      title: "同時 A",
      url: "https://example.test/race",
      publishedAt: "2026-11-01T00:00:00.000Z",
      summary: "同時です。",
      body: "",
      now: "2026-11-01T00:00:00.000Z",
    }),
    ingestEntry(fresh, {
      trackId: "track-grok-bot",
      kind: "Release",
      title: "同時 B",
      url: "https://example.test/race",
      publishedAt: "2026-11-01T00:00:00.000Z",
      summary: "同時です。",
      body: "",
      now: "2026-11-01T00:00:00.000Z",
    }),
  ]);
  if (concurrent[0]?.id !== concurrent[1]?.id) {
    fail("concurrent Ingest created two Entry ids");
  }
  if (concurrent[0]?.caughtUp !== false) {
    fail("concurrent first Ingest was not Unread");
  }
  const raced = await fresh
    .select()
    .from(entries)
    .where(eq(entries.url, "https://example.test/race"));
  if (raced.length !== 1) {
    fail(`concurrent Ingest left ${raced.length} rows`);
  }
  await commitCatchUp(
    fresh,
    [{ id: raced[0]?.id ?? "", caughtUp: true }],
    "2026-11-01T02:00:00.000Z",
  );
  await saveMemo(fresh, {
    id: "memo-race",
    entryId: raced[0]?.id ?? "",
    body: "<p>残る</p>",
    now: "2026-11-01T02:00:00.000Z",
  });
  await Promise.all([
    ingestEntry(fresh, {
      trackId: "track-cursor",
      kind: "Release",
      title: "再同時 A",
      url: "https://example.test/race",
      publishedAt: "2026-11-01T03:00:00.000Z",
      summary: "更新。",
      body: "A",
      now: "2026-11-01T03:00:00.000Z",
    }),
    ingestEntry(fresh, {
      trackId: "track-cursor",
      kind: "Pull Request",
      title: "再同時 B",
      url: "https://example.test/race",
      publishedAt: "2026-11-01T03:00:00.000Z",
      summary: "更新。",
      body: "B",
      now: "2026-11-01T03:00:00.000Z",
    }),
  ]);
  const after = await snapshot(fresh);
  const racedRow = defined(
    after.entries.find((row) => row.url === "https://example.test/race"),
    "concurrent overwrite duplicated the Entry",
  );
  if (after.entries.length !== 1) {
    fail("concurrent overwrite duplicated the Entry");
  }
  if (!racedRow.caughtUp) {
    fail("concurrent overwrite cleared Caught up");
  }
  if (!racedRow.memoIds.includes("memo-race")) {
    fail("concurrent overwrite dropped Memo");
  }
};

const runGenerated = async (): Promise<void> => {
  const random = mulberry32(20261101);
  const pick = <T>(items: readonly T[]): T =>
    items[Math.floor(random() * items.length)] ?? items[0]!;
  for (let trial = 0; trial < 40; trial += 1) {
    const db = await openDb();
    const recorded: Recorded[] = [];
    const steps = 18;
    for (let step = 0; step < steps; step += 1) {
      const roll = random();
      if (recorded.length === 0 || roll < 0.55) {
        const existing = recorded.length > 0 && random() < 0.7 ? pick(recorded) : undefined;
        const url = existing?.url ?? pick(urls);
        const rename = existing !== undefined && random() < 0.15;
        const free = urls.find((item) => recorded.every((row) => row.url !== item));
        await submit(db, recorded, {
          id: rename ? existing?.id : undefined,
          url: rename && free !== undefined ? free : url,
          title: `t${trial}-${step}`,
          trackId: pick(tracksSeed).id,
        });
        continue;
      }
      const target = pick(recorded);
      if (roll < 0.8) {
        const caughtUp = random() < 0.5;
        await commitCatchUp(
          db,
          [{ id: target.id, caughtUp }],
          `2026-11-01T00:00:${String(step).padStart(2, "0")}.000Z`,
        );
        target.caughtUp = caughtUp;
      } else {
        const id = `memo-${trial}-${step}`;
        await saveMemo(db, {
          id,
          entryId: target.id,
          body: `<p>${id}</p>`,
          now: "2026-11-01T00:00:00.000Z",
        });
        target.memoIds = [...target.memoIds, id].toSorted();
      }
      const actual = await snapshot(db);
      matches(actual.entries, recorded);
    }
  }
};

const main = async (): Promise<void> => {
  try {
    await runScripted();
    await runGenerated();
    console.log("entry url identity: 40 sequences of 18 operations, plus concurrent Ingest, held");
  } finally {
    rmSync(scratchRoot, { recursive: true, force: true });
  }
};

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
