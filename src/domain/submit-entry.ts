import { eq } from "drizzle-orm";
import type { LibSQLDatabase } from "drizzle-orm/libsql";
import { sql } from "drizzle-orm";
import * as schema from "../db/schema";
import { entries, memos } from "../db/schema";

export type EntryRow = typeof entries.$inferSelect;
export type MemoRow = typeof memos.$inferSelect;

type Database = LibSQLDatabase<typeof schema>;
type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];

export type SubmitEntryInput = {
  readonly id?: string;
  readonly trackId: string;
  readonly kind: string;
  readonly title: string;
  readonly url: string;
  readonly publishedAt: string;
  readonly summary: string;
  readonly body: string;
  readonly now: string;
};

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

const requireRow = async (tx: Tx, id: string): Promise<EntryRow> => {
  const rows = await tx.select().from(entries).where(eq(entries.id, id)).limit(1);
  const row = rows[0];
  if (row === undefined) {
    throw new Error(`Entry ${id} was not found after write.`);
  }

  return row;
};

const findByUrl = async (tx: Tx, url: string): Promise<EntryRow | undefined> => {
  const rows = await tx.select().from(entries).where(eq(entries.url, url)).limit(1);
  return rows[0];
};

// Overwrite the Entry that already owns this 原文 URL.
// id, caughtUp, and Memo rows stay. A resubmit must not create a second Entry
// and must not move a Caught up Entry back to Unread.
const overwrite = async (
  tx: Tx,
  existing: EntryRow,
  input: SubmitEntryInput,
): Promise<EntryRow> => {
  await tx.update(entries).set(contentOf(input)).where(eq(entries.id, existing.id));
  return requireRow(tx, existing.id);
};

const insertUnread = async (tx: Tx, id: string, input: SubmitEntryInput): Promise<EntryRow> => {
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

const submitInTx = async (tx: Tx, input: SubmitEntryInput): Promise<EntryRow> => {
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
// Queue writers on this client, and if sqlite still reports a lock, yield so the
// holder can commit before the next attempt.
const writeQueues = new WeakMap<Database, Promise<unknown>>();

const yieldToHolder = (attempt: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, 5 * attempt);
  });

const once = async <A>(db: Database, run: (tx: Tx) => Promise<A>): Promise<A> => {
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

const withTransaction = async <A>(db: Database, run: (tx: Tx) => Promise<A>): Promise<A> => {
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

export const submitEntry = (db: Database, input: SubmitEntryInput): Promise<EntryRow> =>
  withTransaction(db, (tx) => submitInTx(tx, input));

export const setCaughtUp = (
  db: Database,
  input: { readonly id: string; readonly caughtUp: boolean; readonly now: string },
): Promise<EntryRow> =>
  withTransaction(db, async (tx) => {
    await tx
      .update(entries)
      .set({ caughtUp: input.caughtUp, updatedAt: input.now })
      .where(eq(entries.id, input.id));
    return requireRow(tx, input.id);
  });

export const insertMemo = (
  db: Database,
  input: {
    readonly id: string;
    readonly entryId: string;
    readonly body: string;
    readonly now: string;
  },
): Promise<MemoRow> =>
  withTransaction(db, async (tx) => {
    await tx.insert(memos).values({
      id: input.id,
      entryId: input.entryId,
      body: input.body,
      createdAt: input.now,
      updatedAt: input.now,
    });
    const rows = await tx.select().from(memos).where(eq(memos.id, input.id)).limit(1);
    const row = rows[0];
    if (row === undefined) {
      throw new Error(`Memo ${input.id} was not found after write.`);
    }

    return row;
  });

export const deleteEntry = (db: Database, id: string): Promise<void> =>
  withTransaction(db, async (tx) => {
    await tx.delete(memos).where(eq(memos.entryId, id));
    await tx.delete(entries).where(eq(entries.id, id));
  });

export type AppDatabase = Database;
