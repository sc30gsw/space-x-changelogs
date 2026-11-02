import { asc, eq, inArray, sql } from "drizzle-orm";
import { Effect } from "effect";
import { nowInstant } from "../../utils/time";
import {
  Database,
  DatabaseError,
  RecordNotFound,
  isStoreError,
  type Db,
  type StoreError,
} from "./database.ts";
import {
  type AppDatabase,
  type Entry,
  type Memo,
  type Source,
  type Track,
  entries,
  memos,
  sources,
  tracks,
} from "./schema";

type Tx = Parameters<Parameters<AppDatabase["transaction"]>[0]>[0];

export type IngestEntry = Pick<
  Entry,
  "trackId" | "kind" | "title" | "url" | "publishedAt" | "summary" | "body"
> & { readonly id?: Entry["id"] };

export type CaughtUpMark = {
  readonly id: Entry["id"];
  readonly caughtUp: Entry["caughtUp"];
};

export type TrackSave = Pick<Track, "id" | "name" | "slug">;
export type SourceSave = Pick<Source, "id" | "trackId" | "label" | "url">;
export type MemoSave = Pick<Memo, "id" | "entryId" | "body">;

type IngestWrite = IngestEntry & { readonly now: string };
type MemoWrite = MemoSave & { readonly now: string };

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

const errorText = (error: unknown): string => {
  if (!(error instanceof Error)) {
    return String(error);
  }

  const cause = error.cause;
  return cause === undefined ? error.message : `${error.message} ${errorText(cause)}`;
};

const isUniqueUrl = (error: unknown): boolean => {
  const text = errorText(error);
  return text.includes("UNIQUE constraint failed") && text.includes("entries.url");
};

const isBusy = (error: unknown): boolean => {
  const text = errorText(error);
  return (
    text.includes("SQLITE_BUSY") ||
    text.includes("database is locked") ||
    text.includes("TRANSACTION_ACTIVE")
  );
};

const requireEntry = async (tx: Tx, id: string): Promise<Entry> => {
  const rows = await tx.select().from(entries).where(eq(entries.id, id)).limit(1);
  const row = rows[0];
  if (row === undefined) {
    throw new Error(`Entry ${id} was not found after write.`);
  }

  return row;
};

const findByUrl = async (tx: Tx, url: string): Promise<Entry | undefined> => {
  const rows = await tx.select().from(entries).where(eq(entries.url, url)).limit(1);
  return rows[0];
};

const contentOf = (input: IngestWrite) => ({
  trackId: input.trackId,
  kind: input.kind,
  title: input.title,
  publishedAt: input.publishedAt,
  summary: input.summary,
  body: input.body,
  updatedAt: input.now,
});

const overwrite = async (tx: Tx, existing: Entry, input: IngestWrite): Promise<Entry> => {
  await tx.update(entries).set(contentOf(input)).where(eq(entries.id, existing.id));
  return requireEntry(tx, existing.id);
};

const insertUnread = async (tx: Tx, id: string, input: IngestWrite): Promise<Entry> => {
  await tx.insert(entries).values({
    id,
    trackId: input.trackId,
    kind: input.kind,
    title: input.title,
    url: input.url,
    publishedAt: input.publishedAt,
    summary: input.summary,
    body: input.body,
    caughtUp: false,
    createdAt: input.now,
    updatedAt: input.now,
  });
  return requireEntry(tx, id);
};

const ingestInTx = async (tx: Tx, input: IngestWrite): Promise<Entry> => {
  const owner = await findByUrl(tx, input.url);
  if (owner !== undefined) {
    return overwrite(tx, owner, input);
  }

  if (input.id !== undefined) {
    const rows = await tx.select().from(entries).where(eq(entries.id, input.id)).limit(1);
    const current = rows[0];
    if (current !== undefined) {
      try {
        await tx
          .update(entries)
          .set({ ...contentOf(input), url: input.url })
          .where(eq(entries.id, current.id));
      } catch (error) {
        if (!isUniqueUrl(error)) {
          throw error;
        }

        const winner = await findByUrl(tx, input.url);
        if (winner === undefined) {
          throw error;
        }

        return overwrite(tx, winner, input);
      }

      return requireEntry(tx, current.id);
    }
  }

  const id = input.id ?? crypto.randomUUID();
  try {
    return await insertUnread(tx, id, input);
  } catch (error) {
    if (!isUniqueUrl(error)) {
      throw error;
    }

    const winner = await findByUrl(tx, input.url);
    if (winner === undefined) {
      throw error;
    }

    return overwrite(tx, winner, input);
  }
};

const writeQueues = new WeakMap<AppDatabase, Promise<unknown>>();

const yieldToHolder = (attempt: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, 5 * attempt);
  });

const once = async <A>(db: AppDatabase, run: (tx: Tx) => Promise<A>): Promise<A> => {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    try {
      return await db.transaction(async (tx) => {
        await tx.run(sql`PRAGMA foreign_keys = ON`);
        return run(tx);
      });
    } catch (error) {
      if (!isBusy(error) || attempt === 7) {
        throw error;
      }
      await yieldToHolder(attempt + 1);
    }
  }

  throw new Error("Entry write did not finish.");
};

const withWrite = async <A>(db: AppDatabase, run: (tx: Tx) => Promise<A>): Promise<A> => {
  const previous = writeQueues.get(db) ?? Promise.resolve();
  const result = previous
    .then(
      () => undefined,
      () => undefined,
    )
    .then(() => once(db, run));
  writeQueues.set(db, result);
  return result;
};

const lastMarks = (marks: readonly CaughtUpMark[]): CaughtUpMark[] => {
  const byId = new Map<string, boolean>();
  for (const mark of marks) {
    byId.set(mark.id, mark.caughtUp);
  }
  return [...byId].map(([id, caughtUp]) => ({ id, caughtUp }));
};

const nextPosition = async (tx: Tx, trackId: string): Promise<number> => {
  const rows = await tx
    .select({ position: sources.position })
    .from(sources)
    .where(eq(sources.trackId, trackId));
  let max = -1;
  for (const row of rows) {
    if (row.position > max) {
      max = row.position;
    }
  }
  return max + 1;
};

const oneTrack = async (tx: Tx, id: string): Promise<Track> => {
  const rows = await tx.select().from(tracks).where(eq(tracks.id, id)).limit(1);
  const row = rows[0];
  if (row === undefined) {
    throw new RecordNotFound({ message: "Track was not found." });
  }
  return row;
};

const oneSource = async (tx: Tx, id: string): Promise<Source> => {
  const rows = await tx.select().from(sources).where(eq(sources.id, id)).limit(1);
  const row = rows[0];
  if (row === undefined) {
    throw new RecordNotFound({ message: "Source was not found." });
  }
  return row;
};

const oneMemo = async (tx: Tx, id: string): Promise<Memo> => {
  const rows = await tx.select().from(memos).where(eq(memos.id, id)).limit(1);
  const row = rows[0];
  if (row === undefined) {
    throw new RecordNotFound({ message: `Memo ${id} was not found after write.` });
  }
  return row;
};

export const commitIngest = (db: AppDatabase, input: IngestWrite): Promise<Entry> =>
  withWrite(db, (tx) => ingestInTx(tx, input));

export const commitCatchUp = (
  db: AppDatabase,
  marks: readonly CaughtUpMark[],
  now: string,
): Promise<Entry[]> => {
  const next = lastMarks(marks);
  if (next.length === 0) {
    return Promise.resolve([]);
  }

  return withWrite(db, async (tx) => {
    const ids = next.map((mark) => mark.id);
    const caughtUp = sql<boolean>`case ${entries.id} ${sql.join(
      next.map((mark) => sql`when ${mark.id} then ${mark.caughtUp}`),
      sql` `,
    )} else ${entries.caughtUp} end`;
    await tx.update(entries).set({ caughtUp, updatedAt: now }).where(inArray(entries.id, ids));
    const found = await tx.select().from(entries).where(inArray(entries.id, ids));
    if (found.length !== ids.length) {
      throw new RecordNotFound({ message: "Could not update Caught up." });
    }
    const byId = new Map(found.map((row) => [row.id, row]));
    return ids.map((id) => {
      const row = byId.get(id);
      if (row === undefined) {
        throw new RecordNotFound({ message: "Could not update Caught up." });
      }
      return row;
    });
  });
};

const commitTrack = (db: AppDatabase, input: TrackSave): Promise<Track> =>
  withWrite(db, async (tx) => {
    const existing = await tx
      .select({ id: tracks.id })
      .from(tracks)
      .where(eq(tracks.id, input.id))
      .limit(1);
    if (existing.length === 0) {
      await tx.insert(tracks).values({ id: input.id, name: input.name, slug: input.slug });
    } else {
      await tx
        .update(tracks)
        .set({ name: input.name, slug: input.slug })
        .where(eq(tracks.id, input.id));
    }
    return oneTrack(tx, input.id);
  });

const commitSource = (db: AppDatabase, input: SourceSave): Promise<Source> =>
  withWrite(db, async (tx) => {
    const existing = await tx
      .select({ id: sources.id })
      .from(sources)
      .where(eq(sources.id, input.id))
      .limit(1);
    if (existing.length === 0) {
      const position = await nextPosition(tx, input.trackId);
      await tx.insert(sources).values({
        id: input.id,
        trackId: input.trackId,
        label: input.label,
        url: input.url,
        position,
      });
    } else {
      await tx
        .update(sources)
        .set({ trackId: input.trackId, label: input.label, url: input.url })
        .where(eq(sources.id, input.id));
    }
    return oneSource(tx, input.id);
  });

export const commitMemo = (db: AppDatabase, input: MemoWrite): Promise<Memo> =>
  withWrite(db, async (tx) => {
    const existing = await tx
      .select({ id: memos.id })
      .from(memos)
      .where(eq(memos.id, input.id))
      .limit(1);
    if (existing.length === 0) {
      await tx.insert(memos).values({
        id: input.id,
        entryId: input.entryId,
        body: input.body,
        createdAt: input.now,
        updatedAt: input.now,
      });
    } else {
      await tx
        .update(memos)
        .set({ entryId: input.entryId, body: input.body, updatedAt: input.now })
        .where(eq(memos.id, input.id));
    }
    return oneMemo(tx, input.id);
  });

export const commitRemoveEntries = (db: AppDatabase, ids: readonly string[]): Promise<void> => {
  if (ids.length === 0) {
    return Promise.resolve();
  }

  return withWrite(db, async (tx) => {
    await tx.delete(memos).where(inArray(memos.entryId, [...ids]));
    await tx.delete(entries).where(inArray(entries.id, [...ids]));
  });
};

const commitRemoveMemos = (db: AppDatabase, ids: readonly string[]): Promise<void> => {
  if (ids.length === 0) {
    return Promise.resolve();
  }

  return withWrite(db, async (tx) => {
    await tx.delete(memos).where(inArray(memos.id, [...ids]));
  });
};

const readRows = <A>(task: (db: Db) => Promise<A>, message: string) =>
  Effect.fn(message)(function* () {
    const { db } = yield* Database;
    return yield* query(() => task(db), message);
  });

export const readTracks = readRows(
  (db) => db.select().from(tracks).orderBy(asc(tracks.name), asc(tracks.id)),
  "Could not read tracks.",
);

export const readSources = readRows(
  (db) => db.select().from(sources).orderBy(asc(sources.position), asc(sources.id)),
  "Could not read sources.",
);

export const readEntries = readRows(
  (db) => db.select().from(entries).orderBy(asc(entries.publishedAt), asc(entries.id)),
  "Could not read entries.",
);

export const readMemos = readRows(
  (db) => db.select().from(memos).orderBy(asc(memos.createdAt), asc(memos.id)),
  "Could not read memos.",
);

export const ingestEntryEffect = Effect.fn("ingestEntry")(function* (input: IngestEntry) {
  const { db } = yield* Database;
  return yield* query(
    () => commitIngest(db, { ...input, now: nowInstant() }),
    "Could not ingest the entry.",
  );
});

export const catchUpEffect = Effect.fn("catchUp")(function* (marks: readonly CaughtUpMark[]) {
  if (marks.length === 0) {
    return [];
  }

  const { db } = yield* Database;
  return yield* query(() => commitCatchUp(db, marks, nowInstant()), "Could not update Caught up.");
});

export const saveTrackEffect = Effect.fn("saveTrack")(function* (input: TrackSave) {
  const { db } = yield* Database;
  return yield* query(() => commitTrack(db, input), "Could not save the track.");
});

export const saveSourceEffect = Effect.fn("saveSource")(function* (input: SourceSave) {
  const { db } = yield* Database;
  return yield* query(() => commitSource(db, input), "Could not save the source.");
});

export const saveMemoEffect = Effect.fn("saveMemo")(function* (input: MemoSave) {
  const { db } = yield* Database;
  return yield* query(
    () => commitMemo(db, { ...input, now: nowInstant() }),
    "Could not save the memo.",
  );
});

export const removeEntriesEffect = Effect.fn("removeEntries")(function* (ids: readonly string[]) {
  if (ids.length === 0) {
    return;
  }

  const { db } = yield* Database;
  yield* query(() => commitRemoveEntries(db, ids), "Could not delete the entry.");
});

export const removeMemosEffect = Effect.fn("removeMemos")(function* (ids: readonly string[]) {
  if (ids.length === 0) {
    return;
  }

  const { db } = yield* Database;
  yield* query(() => commitRemoveMemos(db, ids), "Could not delete the memo.");
});
