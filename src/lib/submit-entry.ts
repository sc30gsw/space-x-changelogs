import { eq, inArray, sql } from "drizzle-orm";
import type { CaughtUpWrite, MemoWrite, SubmitEntry } from "../types/schemas";
import { type AppDatabase, type Entry, type Memo, entries, memos } from "./db/schema";

type Tx = Parameters<Parameters<AppDatabase["transaction"]>[0]>[0];

export type SubmitEntryInput = SubmitEntry & { readonly now: string };

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

const contentOf = (input: SubmitEntryInput) => ({
  trackId: input.trackId,
  kind: input.kind,
  title: input.title,
  publishedAt: input.publishedAt,
  summary: input.summary,
  body: input.body,
  updatedAt: input.now,
});

const requireRow = async (tx: Tx, id: string): Promise<Entry> => {
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

const overwrite = async (tx: Tx, existing: Entry, input: SubmitEntryInput): Promise<Entry> => {
  await tx.update(entries).set(contentOf(input)).where(eq(entries.id, existing.id));
  return requireRow(tx, existing.id);
};

const insertUnread = async (tx: Tx, id: string, input: SubmitEntryInput): Promise<Entry> => {
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
  return requireRow(tx, id);
};

const submitInTx = async (tx: Tx, input: SubmitEntryInput): Promise<Entry> => {
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

      return requireRow(tx, current.id);
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

// libsql's busy timeout blocks the thread that has to commit the other write.
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

export const withWrite = async <A>(db: AppDatabase, run: (tx: Tx) => Promise<A>): Promise<A> => {
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

export const submitEntry = (db: AppDatabase, input: SubmitEntryInput): Promise<Entry> =>
  withWrite(db, (tx) => submitInTx(tx, input));

export const setCaughtUp = (db: AppDatabase, input: CaughtUpWrite): Promise<Entry[]> =>
  withWrite(db, async (tx) => {
    const ids = [...new Set(input.ids)];
    if (ids.length === 0) {
      return [];
    }

    await tx
      .update(entries)
      .set({ caughtUp: input.caughtUp, updatedAt: input.now })
      .where(inArray(entries.id, ids));
    const found = await tx.select().from(entries).where(inArray(entries.id, ids));
    if (found.length !== ids.length) {
      throw new Error("Could not update Caught up.");
    }

    const byId = new Map(found.map((row) => [row.id, row]));
    return ids.map((id) => {
      const row = byId.get(id);
      if (row === undefined) {
        throw new Error("Could not update Caught up.");
      }
      return row;
    });
  });

const insertMemoRows = async (tx: Tx, rows: readonly Memo[]): Promise<void> => {
  await tx.insert(memos).values(
    rows.map((row) => ({
      id: row.id,
      entryId: row.entryId,
      body: row.body,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    })),
  );
};

export const insertMemoBatch = (db: AppDatabase, rows: readonly Memo[]): Promise<Memo[]> => {
  if (rows.length === 0) {
    return Promise.resolve([]);
  }

  return withWrite(db, async (tx) => {
    await insertMemoRows(tx, rows);
    const ids = rows.map((row) => row.id);
    const found = await tx
      .select()
      .from(memos)
      .where(inArray(memos.id, [...ids]));
    const byId = new Map(found.map((row) => [row.id, row]));
    return ids.map((id) => {
      const row = byId.get(id);
      if (row === undefined) {
        throw new Error(`Memo ${id} was not found after write.`);
      }
      return row;
    });
  });
};

export const insertMemo = async (db: AppDatabase, input: MemoWrite): Promise<Memo> => {
  const [row] = await insertMemoBatch(db, [
    {
      id: input.id,
      entryId: input.entryId,
      body: input.body,
      createdAt: input.now,
      updatedAt: input.now,
    },
  ]);
  if (row === undefined) {
    throw new Error(`Memo ${input.id} was not found after write.`);
  }

  return row;
};

export const deleteEntries = (db: AppDatabase, ids: readonly string[]): Promise<void> => {
  if (ids.length === 0) {
    return Promise.resolve();
  }

  return withWrite(db, async (tx) => {
    await tx.delete(memos).where(inArray(memos.entryId, [...ids]));
    await tx.delete(entries).where(inArray(entries.id, [...ids]));
  });
};
