import { asc, eq, inArray } from "drizzle-orm";
import { Effect } from "effect";
import type {
  Memo,
  MemoUpdate,
  Source,
  SourceUpdate,
  SubmitEntry,
  Track,
  TrackUpdate,
} from "../types/schemas";
import { entries, memos, sources, tracks } from "./db/schema";
import {
  deleteEntries,
  insertMemoBatch,
  setCaughtUp,
  submitEntry,
  withWrite,
} from "./submit-entry";
import { nowInstant } from "../utils/time";
import {
  Database,
  DatabaseError,
  RecordNotFound,
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

const requireRow = <A>(row: A | undefined, message: string): A => {
  if (row === undefined) {
    throw new RecordNotFound({ message });
  }

  return row;
};

const orderById = <Row extends { readonly id: string }>(
  found: ReadonlyArray<Row>,
  ids: ReadonlyArray<string>,
): Array<Row | undefined> => {
  const byId = new Map(found.map((row) => [row.id, row]));
  return ids.map((id) => byId.get(id));
};

const definedPatch = <T extends Record<string, unknown>>(changes: T): Partial<T> => {
  const next: Partial<T> = {};
  for (const key of Object.keys(changes) as Array<keyof T>) {
    const value = changes[key];
    if (value !== undefined) {
      next[key] = value;
    }
  }
  return next;
};

const mutate = <A>(db: Db, message: string, run: (tx: Transaction) => Promise<A>) =>
  query(() => withWrite(db, run), message);

const writeEach = async <Row>(
  rows: readonly Row[],
  write: (row: Row) => Promise<void>,
): Promise<void> => {
  const [row, ...rest] = rows;
  if (row === undefined) {
    return;
  }

  await write(row);
  await writeEach(rest, write);
};

export const readTracks = Effect.fn("readTracks")(function* () {
  const { db } = yield* Database;
  return yield* query(
    () => db.select().from(tracks).orderBy(asc(tracks.name), asc(tracks.id)),
    "Could not read tracks.",
  );
});

export const readSources = Effect.fn("readSources")(function* () {
  const { db } = yield* Database;
  return yield* query(
    () => db.select().from(sources).orderBy(asc(sources.position), asc(sources.id)),
    "Could not read sources.",
  );
});

export const readEntries = Effect.fn("readEntries")(function* () {
  const { db } = yield* Database;
  return yield* query(
    () => db.select().from(entries).orderBy(asc(entries.publishedAt), asc(entries.id)),
    "Could not read entries.",
  );
});

export const readMemos = Effect.fn("readMemos")(function* () {
  const { db } = yield* Database;
  return yield* query(
    () => db.select().from(memos).orderBy(asc(memos.createdAt), asc(memos.id)),
    "Could not read memos.",
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
    return orderById(found, ids).map((row) => requireRow(row, "Track was not found."));
  });
});

export const updateTracks = Effect.fn("updateTracks")(function* (rows: ReadonlyArray<TrackUpdate>) {
  if (rows.length === 0) {
    return [];
  }

  const { db } = yield* Database;
  return yield* mutate(db, "Could not update the track.", async (tx) => {
    await writeEach(rows, async (row) => {
      const changes = definedPatch(row.changes);
      if (Object.keys(changes).length === 0) {
        return;
      }
      await tx.update(tracks).set(changes).where(eq(tracks.id, row.id));
    });
    const ids = rows.map((row) => row.id);
    const found = await tx.select().from(tracks).where(inArray(tracks.id, ids));
    return orderById(found, ids).map((row) => requireRow(row, "Track was not found."));
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
    return orderById(found, ids).map((row) => requireRow(row, "Source was not found."));
  });
});

export const updateSources = Effect.fn("updateSources")(function* (
  rows: ReadonlyArray<SourceUpdate>,
) {
  if (rows.length === 0) {
    return [];
  }

  const { db } = yield* Database;
  return yield* mutate(db, "Could not update the source.", async (tx) => {
    await writeEach(rows, async (row) => {
      const changes = definedPatch(row.changes);
      if (Object.keys(changes).length === 0) {
        return;
      }
      await tx.update(sources).set(changes).where(eq(sources.id, row.id));
    });
    const ids = rows.map((row) => row.id);
    const found = await tx.select().from(sources).where(inArray(sources.id, ids));
    return orderById(found, ids).map((row) => requireRow(row, "Source was not found."));
  });
});

export const ingestEntry = Effect.fn("ingestEntry")(function* (input: SubmitEntry) {
  const { db } = yield* Database;
  return yield* query(
    () =>
      submitEntry(db, {
        id: input.id,
        trackId: input.trackId,
        kind: input.kind,
        title: input.title,
        url: input.url,
        publishedAt: input.publishedAt,
        summary: input.summary,
        body: input.body,
        now: nowInstant(),
      }),
    "Could not ingest the entry.",
  );
});

export const markCaughtUp = Effect.fn("markCaughtUp")(function* (input: {
  readonly ids: ReadonlyArray<string>;
  readonly caughtUp: boolean;
}) {
  const { db } = yield* Database;
  return yield* query(
    () => setCaughtUp(db, { ids: input.ids, caughtUp: input.caughtUp, now: nowInstant() }),
    "Could not update Caught up.",
  );
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
  return yield* query(() => insertMemoBatch(db, rows), "Could not insert the memo.");
});

export const updateMemos = Effect.fn("updateMemos")(function* (rows: ReadonlyArray<MemoUpdate>) {
  if (rows.length === 0) {
    return [];
  }

  const { db } = yield* Database;
  return yield* mutate(db, "Could not update the memo.", async (tx) => {
    const now = nowInstant();
    await writeEach(rows, async (row) => {
      if (row.changes.body === undefined) {
        return;
      }
      await tx
        .update(memos)
        .set({ body: row.changes.body, updatedAt: now })
        .where(eq(memos.id, row.id));
    });
    const ids = rows.map((row) => row.id);
    const found = await tx.select().from(memos).where(inArray(memos.id, ids));
    return orderById(found, ids).map((row) => requireRow(row, "Memo was not found."));
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
