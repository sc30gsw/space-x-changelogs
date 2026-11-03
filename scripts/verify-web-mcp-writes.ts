import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient } from "@libsql/client";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql/web";
import { migrate } from "drizzle-orm/libsql/migrator";
import { Effect, Layer } from "effect";
import {
  botToolSpecs,
  runBotTool,
  writeDoors,
  type BotDoors,
  type BotToolSpec,
  type WorkspaceSnapshot,
  type WriteDoor,
} from "../src/features/bots/utils/bot-tools.ts";
import { Database, type StoreError } from "../src/lib/db/database.ts";
import {
  databaseSchema,
  entries,
  memos,
  sources,
  tracks,
  type AppDatabase,
} from "../src/lib/db/schema.ts";
import {
  catchUpEffect,
  ingestEntryEffect,
  removeEntriesEffect,
  removeMemosEffect,
  saveMemoEffect,
  saveSourceEffect,
  saveTrackEffect,
} from "../src/lib/db/write.ts";

const specifiedTools = [
  { name: "list_workspace", door: null, readOnly: true },
  { name: "ingest_entry", door: "ingestEntry", readOnly: false },
  { name: "catch_up", door: "catchUp", readOnly: false },
  { name: "save_track", door: "saveTrack", readOnly: false },
  { name: "save_source", door: "saveSource", readOnly: false },
  { name: "save_memo", door: "saveMemo", readOnly: false },
  { name: "remove_entries", door: "removeEntries", readOnly: false },
  { name: "remove_memos", door: "removeMemos", readOnly: false },
] as const;

const storeDoors = `const doors = {
  ingestEntry,
  catchUp,
  saveTrack,
  saveSource,
  saveMemo,
  removeEntries,
  removeMemos,
};`;

const scratchRoot = mkdtempSync(join(tmpdir(), "web-mcp-writes-"));
let databaseSerial = 0;
let nextId = 0;

const fail = (message: string): never => {
  throw new Error(message);
};

const one = <T>(rows: readonly T[], label: string): T => {
  const row = rows[0];
  if (row === undefined || rows.length !== 1) {
    return fail(`${label} stored ${rows.length} rows`);
  }
  return row;
};

type Counts = Record<WriteDoor, number>;

const freshCounts = (): Counts => ({
  ingestEntry: 0,
  catchUp: 0,
  saveTrack: 0,
  saveSource: 0,
  saveMemo: 0,
  removeEntries: 0,
  removeMemos: 0,
});

const isErrorResult = (value: unknown): value is { readonly error: string } =>
  typeof value === "object" &&
  value !== null &&
  "error" in value &&
  typeof value.error === "string" &&
  value.error.length > 0;

const toolNamed = (name: string): BotToolSpec => {
  const spec = botToolSpecs.find((item) => item.name === name);
  if (spec === undefined) {
    return fail(`missing tool ${name}`);
  }
  return spec;
};

const assertSpec = (): void => {
  if (botToolSpecs.length !== specifiedTools.length) {
    fail(`expected ${specifiedTools.length} tools, found ${botToolSpecs.length}`);
  }
  for (let index = 0; index < specifiedTools.length; index += 1) {
    const expected = specifiedTools[index];
    const actual = botToolSpecs[index];
    if (
      expected === undefined ||
      actual === undefined ||
      actual.name !== expected.name ||
      actual.door !== expected.door ||
      actual.readOnly !== expected.readOnly
    ) {
      fail(`tool ${index} is not ${expected?.name} -> ${String(expected?.door)}`);
    }
  }
};

const assertRegistrar = (): void => {
  const registrar = readFileSync(
    new URL("../src/features/bots/components/bot-tools.tsx", import.meta.url),
    "utf8",
  );
  const imported = registrar.match(
    /import \{([^}]+)\} from "\.\.\/\.\.\/\.\.\/stores\/changelog";/u,
  );
  const names = imported?.[1]
    ?.split(",")
    .map((name) => name.trim())
    .filter((name) => name.length > 0)
    .toSorted();
  const expected = [...writeDoors].toSorted();
  if (names === undefined || names.join() !== expected.join()) {
    fail("the page does not bind the seven store write functions");
  }
  if (!registrar.includes(storeDoors)) {
    fail("the page wraps a write function instead of passing it through");
  }
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
  return db;
};

const bindDoors = (db: AppDatabase, counts: Counts): BotDoors => {
  const layer = Layer.succeed(Database, Database.of({ db }));
  const call = <A>(door: WriteDoor, effect: Effect.Effect<A, StoreError, Database>): Promise<A> => {
    counts[door] += 1;
    return Effect.runPromise(effect.pipe(Effect.provide(layer)));
  };
  return {
    ingestEntry: (input) => call("ingestEntry", ingestEntryEffect(input)),
    catchUp: (marks) => call("catchUp", catchUpEffect(marks)),
    saveTrack: (input) => call("saveTrack", saveTrackEffect(input)),
    saveSource: (input) => call("saveSource", saveSourceEffect(input)),
    saveMemo: (input) => call("saveMemo", saveMemoEffect(input)),
    removeEntries: (ids) => call("removeEntries", removeEntriesEffect(ids)),
    removeMemos: (ids) => call("removeMemos", removeMemosEffect(ids)),
  };
};

const fingerprint = async (db: AppDatabase): Promise<string> =>
  JSON.stringify({
    tracks: await db.select().from(tracks),
    sources: await db.select().from(sources),
    entries: await db.select().from(entries),
    memos: await db.select().from(memos),
  });

const assertDoor = (counts: Counts, door: WriteDoor | null, label: string): void => {
  for (const name of writeDoors) {
    const expected = name === door ? 1 : 0;
    if (counts[name] !== expected) {
      fail(`${label} called ${name} ${counts[name]} times`);
    }
  }
};

const emptyWorkspace: WorkspaceSnapshot = {
  tracks: [],
  sources: [],
  entries: [],
  memos: [],
  isLoading: false,
  isError: false,
};

const runTool = async (
  db: AppDatabase,
  counts: Counts,
  spec: BotToolSpec,
  input: unknown,
  workspace: WorkspaceSnapshot = emptyWorkspace,
): Promise<unknown> => {
  for (const name of writeDoors) {
    counts[name] = 0;
  }
  return runBotTool(spec, input, bindDoors(db, counts), workspace, () => {
    nextId += 1;
    return `generated-${nextId}`;
  });
};

const entryInput = (url: string, title: string) => ({
  trackId: "track-1",
  kind: "Release",
  title,
  url,
  publishedAt: "2026-11-03T00:00:00Z",
  summary: "A flight",
});

const proveRejected = async (db: AppDatabase, counts: Counts): Promise<void> => {
  const before = await fingerprint(db);
  for (const spec of botToolSpecs) {
    const result = await runTool(db, counts, spec, null);
    if (!isErrorResult(result)) {
      fail(`${spec.name} accepted null`);
    }
    assertDoor(counts, null, `${spec.name} rejected input`);
  }
  if ((await fingerprint(db)) !== before) {
    fail("a rejected tool input changed a stored row");
  }
};

const proveWrites = async (db: AppDatabase, counts: Counts): Promise<void> => {
  const createdTrack = await runTool(db, counts, toolNamed("save_track"), {
    id: "track-1",
    name: "Cursor",
    slug: "cursor",
  });
  if (isErrorResult(createdTrack)) {
    fail(`save_track failed: ${createdTrack.error}`);
  }
  assertDoor(counts, "saveTrack", "save_track");
  const track = one(await db.select().from(tracks), "save_track");
  if (track.id !== "track-1" || track.name !== "Cursor" || track.slug !== "cursor") {
    fail("save_track did not store the track it was given");
  }

  const renamed = await runTool(db, counts, toolNamed("save_track"), {
    id: "track-1",
    name: "Cursor 2",
    slug: "cursor",
  });
  if (isErrorResult(renamed)) {
    fail(`save_track update failed: ${renamed.error}`);
  }
  assertDoor(counts, "saveTrack", "save_track update");
  const renamedTrack = one(await db.select().from(tracks), "save_track update");
  if (renamedTrack.name !== "Cursor 2") {
    fail("save_track inserted a second track");
  }

  const createdSource = await runTool(db, counts, toolNamed("save_source"), {
    id: "source-1",
    trackId: "track-1",
    label: "Changelog",
    url: "https://example.test/source",
  });
  if (isErrorResult(createdSource)) {
    fail(`save_source failed: ${createdSource.error}`);
  }
  assertDoor(counts, "saveSource", "save_source");
  const source = one(await db.select().from(sources), "save_source");
  if (source.position !== 0 || source.trackId !== "track-1" || source.label !== "Changelog") {
    fail("save_source did not store the first source on the track");
  }

  const relabeled = await runTool(db, counts, toolNamed("save_source"), {
    id: "source-1",
    trackId: "track-1",
    label: "Notes",
    url: "https://example.test/source",
  });
  if (isErrorResult(relabeled)) {
    fail(`save_source update failed: ${relabeled.error}`);
  }
  assertDoor(counts, "saveSource", "save_source update");
  const relabeledSource = one(await db.select().from(sources), "save_source update");
  if (relabeledSource.label !== "Notes" || relabeledSource.position !== 0) {
    fail("save_source changed position or added a source");
  }

  const createdEntry = await runTool(
    db,
    counts,
    toolNamed("ingest_entry"),
    entryInput("https://example.test/a", "Starship"),
  );
  if (isErrorResult(createdEntry)) {
    fail(`ingest_entry failed: ${createdEntry.error}`);
  }
  assertDoor(counts, "ingestEntry", "ingest_entry");
  const entry = one(await db.select().from(entries), "ingest_entry");
  if (entry.caughtUp !== false || entry.body !== "" || entry.url !== "https://example.test/a") {
    fail("ingest_entry did not store one unread entry with an empty body");
  }

  const caught = await runTool(db, counts, toolNamed("catch_up"), {
    marks: [{ id: entry.id, caughtUp: true }],
  });
  if (isErrorResult(caught)) {
    fail(`catch_up failed: ${caught.error}`);
  }
  assertDoor(counts, "catchUp", "catch_up");
  const caughtEntry = one(await db.select().from(entries), "catch_up");
  if (
    caughtEntry.id !== entry.id ||
    caughtEntry.caughtUp !== true ||
    caughtEntry.title !== "Starship"
  ) {
    fail("catch_up changed more than Caught up");
  }

  const overwritten = await runTool(
    db,
    counts,
    toolNamed("ingest_entry"),
    entryInput("https://example.test/a", "Starship 2"),
  );
  if (isErrorResult(overwritten)) {
    fail(`ingest_entry overwrite failed: ${overwritten.error}`);
  }
  assertDoor(counts, "ingestEntry", "ingest_entry overwrite");
  const kept = one(await db.select().from(entries), "ingest_entry overwrite");
  if (kept.id !== entry.id || kept.caughtUp !== true || kept.title !== "Starship 2") {
    fail("ingest_entry replaced the id or cleared Caught up");
  }

  const noted = await runTool(db, counts, toolNamed("save_memo"), {
    id: "memo-1",
    entryId: entry.id,
    body: "<script>alert(1)</script><p>ok</p>",
  });
  if (isErrorResult(noted)) {
    fail(`save_memo failed: ${noted.error}`);
  }
  assertDoor(counts, "saveMemo", "save_memo");
  const memo = one(await db.select().from(memos), "save_memo");
  if (memo.entryId !== entry.id || memo.body !== "<p>ok</p>" || memo.body.includes("<script")) {
    fail("save_memo stored a script or dropped the note");
  }

  const cleared = await runTool(db, counts, toolNamed("remove_memos"), { ids: ["memo-1"] });
  if (isErrorResult(cleared)) {
    fail(`remove_memos failed: ${cleared.error}`);
  }
  assertDoor(counts, "removeMemos", "remove_memos");
  if ((await db.select().from(memos)).length !== 0) {
    fail("remove_memos left the memo");
  }
  const stillThere = one(await db.select().from(entries), "remove_memos");
  if (stillThere.id !== entry.id) {
    fail("remove_memos removed the entry");
  }

  const other = await runTool(
    db,
    counts,
    toolNamed("ingest_entry"),
    entryInput("https://example.test/b", "Booster"),
  );
  if (isErrorResult(other)) {
    fail(`second ingest_entry failed: ${other.error}`);
  }
  assertDoor(counts, "ingestEntry", "second ingest_entry");
  const otherEntry =
    (await db.select().from(entries)).find((row) => row.url === "https://example.test/b") ??
    fail("second ingest_entry did not store a separate unread entry");
  if (otherEntry.caughtUp !== false) {
    return fail("second ingest_entry did not store a separate unread entry");
  }

  const otherMemo = await runTool(db, counts, toolNamed("save_memo"), {
    id: "memo-2",
    entryId: otherEntry.id,
    body: "<p>stay</p>",
  });
  if (isErrorResult(otherMemo)) {
    fail(`second save_memo failed: ${otherMemo.error}`);
  }
  assertDoor(counts, "saveMemo", "second save_memo");

  const removed = await runTool(db, counts, toolNamed("remove_entries"), { ids: [entry.id] });
  if (isErrorResult(removed)) {
    fail(`remove_entries failed: ${removed.error}`);
  }
  assertDoor(counts, "removeEntries", "remove_entries");
  const remainingEntries = await db.select().from(entries);
  const remainingMemos = await db.select().from(memos);
  if (
    remainingEntries.length !== 1 ||
    remainingEntries[0]?.id !== otherEntry.id ||
    remainingMemos.length !== 1 ||
    remainingMemos[0]?.id !== "memo-2"
  ) {
    fail("remove_entries removed the other entry or left the deleted entry's memo");
  }

  const loaded = {
    tracks: [{ id: "track-1" }],
    sources: [{ id: "source-1" }],
    entries: [{ id: otherEntry.id }],
    memos: [{ id: "memo-2" }],
    isLoading: false,
    isError: false,
  };
  const beforeList = await fingerprint(db);
  const listed = await runTool(db, counts, toolNamed("list_workspace"), {}, loaded);
  if (JSON.stringify(listed) !== JSON.stringify(loaded)) {
    fail("list_workspace did not return the loaded snapshot");
  }
  assertDoor(counts, null, "list_workspace");
  if ((await fingerprint(db)) !== beforeList) {
    fail("list_workspace wrote a row");
  }
};

const proveCatchUpRollsBack = async (): Promise<void> => {
  const db = await openDb();
  const counts = freshCounts();
  const saved = await runTool(db, counts, toolNamed("save_track"), {
    id: "track-1",
    name: "Cursor",
    slug: "cursor",
  });
  if (isErrorResult(saved)) {
    fail(`rollback setup failed: ${saved.error}`);
  }
  const ingested = await runTool(db, counts, toolNamed("ingest_entry"), {
    ...entryInput("https://example.test/a", "Starship"),
    id: "entry-a",
  });
  if (isErrorResult(ingested)) {
    fail(`rollback ingest failed: ${ingested.error}`);
  }
  const result = await runTool(db, counts, toolNamed("catch_up"), {
    marks: [
      { id: "entry-a", caughtUp: true },
      { id: "missing-entry", caughtUp: true },
    ],
  });
  assertDoor(counts, "catchUp", "catch_up with a missing id");
  const entry = one(await db.select().from(entries), "failed catch_up");
  if (entry.caughtUp !== false || entry.title !== "Starship") {
    fail("a failed catch_up left an earlier row Caught up");
  }
  if (!isErrorResult(result)) {
    fail("catch_up stored a missing id");
  }
};

const main = async (): Promise<void> => {
  assertSpec();
  assertRegistrar();
  const db = await openDb();
  const counts = freshCounts();
  await proveRejected(db, counts);
  await proveWrites(db, counts);
  await proveCatchUpRollsBack();
  console.log("web mcp writes: 8 tools, 7 write functions, one call each, stored rows held");
};

try {
  await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : "web mcp writes failed");
  process.exitCode = 1;
} finally {
  rmSync(scratchRoot, { recursive: true, force: true });
}
