import { asc, eq, inArray, sql, type Column, type SQL } from "drizzle-orm";
import { Effect } from "effect";
import * as v from "valibot";
import { pickEntryChanges } from "../utils/changes";
import type { Entry, EntryChanges, Memo, Source, Track } from "../types/schemas";
import { entrySchema, memoSchema, sourceSchema, trackSchema } from "../types/schemas";
import { seedTracks } from "./db/seed-data";
import { entries, memos, sources, tracks } from "./db/schema";
import { deleteEntries, setCaughtUp, submitEntry } from "./submit-entry";
import { isEntryKind } from "../utils/kinds";
import { instantFromJstLocal, nowInstant } from "../utils/time";
import {
  Database,
  DatabaseError,
  RecordNotFound,
  RecordRejected,
  isStoreError,
  type Db,
  type StoreError,
} from "./db/database.ts";

type Transaction = Parameters<Parameters<Db["transaction"]>[0]>[0];

const asStoreError = (message: string, cause: unknown): StoreError => {
  if (isStoreError(cause)) {
    return cause;
  }

  return new DatabaseError({ message, cause });
};

const query = <A>(task: () => Promise<A>, message: string) =>
  Effect.tryPromise({
    try: task,
    catch: (cause) => asStoreError(message, cause),
  });

const parseRow =
  <A>(schema: v.GenericSchema<unknown, A>, message: string) =>
  (row: unknown): A => {
    const parsed = v.safeParse(schema, row);
    if (!parsed.success) {
      throw new RecordRejected({ message, cause: parsed.issues });
    }

    return parsed.output;
  };

const parseTrack = parseRow(trackSchema, "Stored track did not match the collection schema.");
const parseSource = parseRow(sourceSchema, "Stored source did not match the collection schema.");
const parseEntry = parseRow(entrySchema, "Stored entry did not match the collection schema.");
const parseMemo = parseRow(memoSchema, "Stored memo did not match the collection schema.");

const requireRow = <A>(row: A | undefined, message: string, parse: (value: unknown) => A): A => {
  if (row === undefined) {
    throw new RecordNotFound({ message });
  }

  return parse(row);
};

const orderById = <Row extends { readonly id: string }>(
  found: ReadonlyArray<Row>,
  ids: ReadonlyArray<string>,
): Array<Row | undefined> => {
  const byId = new Map(found.map((row) => [row.id, row]));
  return ids.map((id) => byId.get(id));
};

const decodeRows = <A>(rows: ReadonlyArray<unknown>, parse: (row: unknown) => A, message: string) =>
  Effect.forEach(rows, (row) =>
    Effect.try({
      try: () => parse(row),
      catch: (cause) => asStoreError(message, cause),
    }),
  );

const mutate = <A>(db: Db, message: string, run: (tx: Transaction) => Promise<A>) =>
  query(
    () =>
      db.transaction(async (tx) => {
        await tx.run(sql`PRAGMA foreign_keys = ON`);
        return run(tx);
      }),
    message,
  );

const errorText = (error: unknown): string => {
  if (!(error instanceof Error)) {
    return String(error);
  }

  return error.cause === undefined ? error.message : `${error.message} ${errorText(error.cause)}`;
};

const isUnique = (error: unknown): boolean => errorText(error).includes("UNIQUE constraint failed");

type TextPatch = {
  readonly id: string;
  readonly value: string;
};

const textPatches = <Field extends string>(
  rows: ReadonlyArray<{
    readonly id: string;
    readonly changes: Partial<Record<Field, string | undefined>>;
  }>,
  field: Field,
): TextPatch[] =>
  rows.flatMap((row) => {
    const value = row.changes[field];
    return value === undefined ? [] : [{ id: row.id, value }];
  });

const textCase = (idColumn: Column, column: Column, pairs: readonly TextPatch[]): SQL =>
  sql`CASE ${idColumn} ${sql.join(
    pairs.map((pair) => sql`WHEN ${pair.id} THEN ${pair.value}`),
    sql` `,
  )} ELSE ${column} END`;

const applyTrackText = async (
  tx: Transaction,
  column: "name" | "slug",
  pairs: readonly TextPatch[],
): Promise<void> => {
  if (pairs.length === 0) {
    return;
  }

  const ids = pairs.map((pair) => pair.id);
  switch (column) {
    case "name":
      await tx
        .update(tracks)
        .set({ name: textCase(tracks.id, tracks.name, pairs) })
        .where(inArray(tracks.id, ids));
      return;
    case "slug":
      await tx
        .update(tracks)
        .set({ slug: textCase(tracks.id, tracks.slug, pairs) })
        .where(inArray(tracks.id, ids));
      return;
    default: {
      const unreachable: never = column;
      return unreachable;
    }
  }
};

const applySourceText = async (
  tx: Transaction,
  column: "label" | "url",
  pairs: readonly TextPatch[],
): Promise<void> => {
  if (pairs.length === 0) {
    return;
  }

  const ids = pairs.map((pair) => pair.id);
  switch (column) {
    case "label":
      await tx
        .update(sources)
        .set({ label: textCase(sources.id, sources.label, pairs) })
        .where(inArray(sources.id, ids));
      return;
    case "url":
      await tx
        .update(sources)
        .set({ url: textCase(sources.id, sources.url, pairs) })
        .where(inArray(sources.id, ids));
      return;
    default: {
      const unreachable: never = column;
      return unreachable;
    }
  }
};

const ensureSeed = Effect.fn("ensureSeed")(function* () {
  const { db } = yield* Database;
  const existing = yield* query(
    () => db.select({ id: tracks.id }).from(tracks).limit(1),
    "Could not read tracks.",
  );
  if (existing.length > 0) {
    return;
  }

  yield* query(async () => {
    try {
      await db.transaction(async (tx) => {
        await tx.run(sql`PRAGMA foreign_keys = ON`);
        await tx
          .insert(tracks)
          .values(
            seedTracks.map((track) => ({ id: track.id, name: track.name, slug: track.slug })),
          );
        const sourceRows = seedTracks.flatMap((track) =>
          track.sources.map((source, position) => ({
            id: source.id,
            trackId: track.id,
            label: source.label,
            url: source.url,
            position,
          })),
        );
        if (sourceRows.length > 0) {
          await tx.insert(sources).values(sourceRows);
        }
      });
    } catch (error) {
      if (!isUnique(error)) {
        throw error;
      }
    }
  }, "Could not seed tracks.");
});

export const readTracks = Effect.fn("readTracks")(function* () {
  yield* ensureSeed();
  const { db } = yield* Database;
  const rows = yield* query(
    () => db.select().from(tracks).orderBy(asc(tracks.name), asc(tracks.id)),
    "Could not read tracks.",
  );
  return yield* decodeRows(
    rows,
    parseTrack,
    "Turso returned a track row the collection schema rejected.",
  );
});

export const readSources = Effect.fn("readSources")(function* () {
  yield* ensureSeed();
  const { db } = yield* Database;
  const rows = yield* query(
    () => db.select().from(sources).orderBy(asc(sources.position), asc(sources.id)),
    "Could not read sources.",
  );
  return yield* decodeRows(
    rows,
    parseSource,
    "Turso returned a source row the collection schema rejected.",
  );
});

export const readEntries = Effect.fn("readEntries")(function* () {
  yield* ensureSeed();
  const { db } = yield* Database;
  const rows = yield* query(
    () => db.select().from(entries).orderBy(asc(entries.publishedAt), asc(entries.id)),
    "Could not read entries.",
  );
  return yield* decodeRows(
    rows,
    parseEntry,
    "Turso returned an entry row the collection schema rejected.",
  );
});

export const readMemos = Effect.fn("readMemos")(function* () {
  const { db } = yield* Database;
  const rows = yield* query(
    () => db.select().from(memos).orderBy(asc(memos.createdAt), asc(memos.id)),
    "Could not read memos.",
  );
  return yield* decodeRows(
    rows,
    parseMemo,
    "Turso returned a memo row the collection schema rejected.",
  );
});

export const insertTracks = Effect.fn("insertTracks")(function* (rows: ReadonlyArray<Track>) {
  if (rows.length === 0) {
    return [];
  }

  const { db } = yield* Database;
  return yield* mutate(db, "Could not insert the track.", async (tx) => {
    await tx
      .insert(tracks)
      .values(rows.map((row) => ({ id: row.id, name: row.name, slug: row.slug })));
    const ids = rows.map((row) => row.id);
    const found = await tx.select().from(tracks).where(inArray(tracks.id, ids));
    return orderById(found, ids).map((row) => requireRow(row, "Track was not found.", parseTrack));
  });
});

export const updateTracks = Effect.fn("updateTracks")(function* (
  rows: ReadonlyArray<{
    readonly id: string;
    readonly changes: { readonly name?: string; readonly slug?: string };
  }>,
) {
  if (rows.length === 0) {
    return [];
  }

  const { db } = yield* Database;
  return yield* mutate(db, "Could not update the track.", async (tx) => {
    await applyTrackText(tx, "name", textPatches(rows, "name"));
    await applyTrackText(tx, "slug", textPatches(rows, "slug"));
    const ids = rows.map((row) => row.id);
    const found = await tx.select().from(tracks).where(inArray(tracks.id, ids));
    return orderById(found, ids).map((row) => requireRow(row, "Track was not found.", parseTrack));
  });
});

export const insertSources = Effect.fn("insertSources")(function* (rows: ReadonlyArray<Source>) {
  if (rows.length === 0) {
    return [];
  }

  const { db } = yield* Database;
  return yield* mutate(db, "Could not insert the source.", async (tx) => {
    await tx.insert(sources).values(
      rows.map((row) => ({
        id: row.id,
        trackId: row.trackId,
        label: row.label,
        url: row.url,
        position: row.position,
      })),
    );
    const ids = rows.map((row) => row.id);
    const found = await tx.select().from(sources).where(inArray(sources.id, ids));
    return orderById(found, ids).map((row) =>
      requireRow(row, "Source was not found.", parseSource),
    );
  });
});

export const updateSources = Effect.fn("updateSources")(function* (
  rows: ReadonlyArray<{
    readonly id: string;
    readonly changes: { readonly label?: string; readonly url?: string };
  }>,
) {
  if (rows.length === 0) {
    return [];
  }

  const { db } = yield* Database;
  return yield* mutate(db, "Could not update the source.", async (tx) => {
    await applySourceText(tx, "label", textPatches(rows, "label"));
    await applySourceText(tx, "url", textPatches(rows, "url"));
    const ids = rows.map((row) => row.id);
    const found = await tx.select().from(sources).where(inArray(sources.id, ids));
    return orderById(found, ids).map((row) =>
      requireRow(row, "Source was not found.", parseSource),
    );
  });
});

const toEntry = (row: unknown): Entry => parseEntry(row);

export const ingestEntry = Effect.fn("ingestEntry")(function* (input: {
  readonly id?: string;
  readonly trackId: string;
  readonly kind: string;
  readonly title: string;
  readonly url: string;
  readonly publishedAt: string;
  readonly summary: string;
  readonly body?: string;
}) {
  if (!isEntryKind(input.kind)) {
    return yield* new RecordRejected({ message: "種類が不正です。", cause: input.kind });
  }

  let publishedAt = input.publishedAt;
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/u.test(publishedAt)) {
    publishedAt = instantFromJstLocal(publishedAt);
  }

  const { db } = yield* Database;
  const saved = yield* query(
    () =>
      submitEntry(db, {
        id: input.id,
        trackId: input.trackId,
        kind: input.kind,
        title: input.title,
        url: input.url,
        publishedAt,
        summary: input.summary,
        body: input.body ?? "",
        now: nowInstant(),
      }),
    "Could not ingest the entry.",
  );
  return yield* Effect.try({
    try: () => toEntry(saved),
    catch: (cause) =>
      asStoreError("Turso returned an entry row the collection schema rejected.", cause),
  });
});

const onlyCaughtUp = (changes: EntryChanges): boolean => {
  const keys = Object.entries(changes).flatMap(([key, value]) =>
    value === undefined ? [] : [key],
  );
  return keys.length === 1 && keys[0] === "caughtUp" && changes.caughtUp !== undefined;
};

const applyEntryUpdate = Effect.fnUntraced(function* (
  db: Db,
  row: { readonly id: string; readonly changes: EntryChanges },
) {
  const changes = pickEntryChanges(row.changes);
  if (onlyCaughtUp(changes) && changes.caughtUp !== undefined) {
    const caughtUp = changes.caughtUp;
    const next = yield* query(
      () => setCaughtUp(db, { id: row.id, caughtUp, now: nowInstant() }),
      "Could not update Caught up.",
    );
    return toEntry(next);
  }

  const currentRows = yield* query(
    () => db.select().from(entries).where(eq(entries.id, row.id)).limit(1),
    "Could not read the entry.",
  );
  const current = currentRows[0];
  if (current === undefined) {
    return yield* new RecordNotFound({ message: "Entry was not found." });
  }

  return yield* ingestEntry({
    id: current.id,
    trackId: changes.trackId ?? current.trackId,
    kind: changes.kind ?? current.kind,
    title: changes.title ?? current.title,
    url: changes.url ?? current.url,
    publishedAt: changes.publishedAt ?? current.publishedAt,
    summary: changes.summary ?? current.summary,
    body: changes.body ?? current.body,
  });
});

export const updateEntries = Effect.fn("updateEntries")(function* (
  rows: ReadonlyArray<{ readonly id: string; readonly changes: EntryChanges }>,
) {
  if (rows.length === 0) {
    return [];
  }

  const { db } = yield* Database;
  return yield* Effect.forEach(rows, (row) => applyEntryUpdate(db, row), { concurrency: 1 });
});

export const removeEntries = Effect.fn("removeEntries")(function* (ids: ReadonlyArray<string>) {
  if (ids.length === 0) {
    return;
  }

  const { db } = yield* Database;
  yield* query(() => deleteEntries(db, ids), "Could not delete the entry.");
});

export const insertMemos = Effect.fn("insertMemos")(function* (rows: ReadonlyArray<Memo>) {
  if (rows.length === 0) {
    return [];
  }

  const { db } = yield* Database;
  return yield* mutate(db, "Could not insert the memo.", async (tx) => {
    await tx.insert(memos).values(
      rows.map((row) => ({
        id: row.id,
        entryId: row.entryId,
        body: row.body,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      })),
    );
    const ids = rows.map((row) => row.id);
    const found = await tx.select().from(memos).where(inArray(memos.id, ids));
    return orderById(found, ids).map((row) => requireRow(row, "Memo was not found.", parseMemo));
  });
});

export const updateMemos = Effect.fn("updateMemos")(function* (
  rows: ReadonlyArray<{ readonly id: string; readonly changes: { readonly body?: string } }>,
) {
  if (rows.length === 0) {
    return [];
  }

  const { db } = yield* Database;
  return yield* mutate(db, "Could not update the memo.", async (tx) => {
    const now = nowInstant();
    const bodyPairs = textPatches(rows, "body");
    if (bodyPairs.length > 0) {
      await tx
        .update(memos)
        .set({
          body: textCase(memos.id, memos.body, bodyPairs),
          updatedAt: now,
        })
        .where(
          inArray(
            memos.id,
            bodyPairs.map((pair) => pair.id),
          ),
        );
    }
    const ids = rows.map((row) => row.id);
    const found = await tx.select().from(memos).where(inArray(memos.id, ids));
    return orderById(found, ids).map((row) => requireRow(row, "Memo was not found.", parseMemo));
  });
});

export const removeMemos = Effect.fn("removeMemos")(function* (ids: ReadonlyArray<string>) {
  if (ids.length === 0) {
    return;
  }

  const { db } = yield* Database;
  yield* mutate(db, "Could not delete the memo.", async (tx) => {
    await tx.delete(memos).where(inArray(memos.id, [...ids]));
  });
});
