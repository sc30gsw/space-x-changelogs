import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient } from "@libsql/client";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql/web";
import { migrate } from "drizzle-orm/libsql/migrator";
import { databaseSchema, entries, tracks, type AppDatabase } from "../src/lib/db/schema.ts";
import { catchUp, ingestEntry } from "../src/lib/db/write.ts";

const scratchRoot = mkdtempSync(join(tmpdir(), "catch-up-transaction-"));

const fail = (message: string): never => {
  throw new Error(message);
};

const openDb = async (): Promise<AppDatabase> => {
  const client = createClient({
    url: `file:${join(scratchRoot, "catch-up.db")}`,
    timeout: 0,
  });
  const db = drizzle({ client, schema: databaseSchema });
  await migrate(db, { migrationsFolder: "drizzle" });
  await db.run(sql`PRAGMA foreign_keys = ON`);
  await db.insert(tracks).values({ id: "track-cursor", name: "Cursor", slug: "cursor" });
  return db;
};

const main = async (): Promise<void> => {
  const db = await openDb();
  const now = "2026-11-02T00:00:00.000Z";
  const first = await ingestEntry(db, {
    id: "entry-a",
    trackId: "track-cursor",
    kind: "Release",
    title: "A",
    url: "https://example.test/a",
    publishedAt: now,
    summary: "要約です。",
    body: "本文",
    now,
  });
  const second = await ingestEntry(db, {
    id: "entry-b",
    trackId: "track-cursor",
    kind: "Release",
    title: "B",
    url: "https://example.test/b",
    publishedAt: now,
    summary: "要約です。",
    body: "本文",
    now,
  });
  const before = await db.select().from(entries);
  let failed = false;
  try {
    await catchUp(
      db,
      [
        { id: first.id, caughtUp: true },
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
    fail("catchUp with a missing id did not roll back");
  }
  const after = await db.select().from(entries);
  const beforeById = new Map(before.map((row) => [row.id, row]));
  if (after.length !== 2) {
    fail(`expected both rows, found ${after.length}`);
  }
  for (const row of after) {
    const previous = beforeById.get(row.id);
    if (previous === undefined) {
      fail(`unexpected row ${row.id}`);
    }
    if (JSON.stringify(row) !== JSON.stringify(previous)) {
      fail(`row ${row.id} changed`);
    }
  }
  if (after.some((row) => row.id !== first.id && row.id !== second.id)) {
    fail("catchUp inserted a row");
  }
  console.log("catchUp transaction: missing id left both rows unchanged");
};

main()
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    process.exitCode = 1;
  })
  .finally(() => {
    rmSync(scratchRoot, { recursive: true, force: true });
  });
