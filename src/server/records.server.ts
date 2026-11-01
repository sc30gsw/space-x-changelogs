import { asc, eq, inArray, sql } from "drizzle-orm";
import { Effect } from "effect";
import * as v from "valibot";
import { pickEntryChanges } from "../data/entry-changes";
import type { Entry, EntryChanges, Project } from "../data/schemas";
import { entrySchema, projectSchema } from "../data/schemas";
import { entries, projects } from "../db/schema";
import {
  Database,
  DatabaseError,
  RecordNotFound,
  RecordRejected,
  isStoreError,
  type Db,
  type StoreError,
} from "./db.server";

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

const parseProject = (row: unknown): Project => {
  try {
    return v.parse(projectSchema, row);
  } catch (cause) {
    throw new RecordRejected({
      message: "Stored project did not match the collection schema.",
      cause,
    });
  }
};

const parseEntry = (row: unknown): Entry => {
  try {
    return v.parse(entrySchema, row);
  } catch (cause) {
    throw new RecordRejected({
      message: "Stored entry did not match the collection schema.",
      cause,
    });
  }
};

const requireProject = (row: unknown): Project => {
  if (row === null || row === undefined) {
    throw new RecordNotFound({ message: "Project was not found." });
  }

  return parseProject(row);
};

const requireEntry = (row: unknown): Entry => {
  if (row === null || row === undefined) {
    throw new RecordNotFound({ message: "Entry was not found." });
  }

  return parseEntry(row);
};

const decodeRows = <A>(rows: ReadonlyArray<unknown>, parse: (row: unknown) => A, message: string) =>
  Effect.forEach(rows, (row) =>
    Effect.try({
      try: () => parse(row),
      catch: (cause) => asStoreError(message, cause),
    }),
  );

// One transaction for every row of a mutation. A throw rolls the whole callback back.
const mutate = <A>(db: Db, message: string, run: (tx: Transaction) => Promise<A>) =>
  query(
    () =>
      db.transaction(async (tx) => {
        await tx.run(sql`PRAGMA foreign_keys = ON`);
        return run(tx);
      }),
    message,
  );

export const readProjects = Effect.fn("readProjects")(function* () {
  const { db } = yield* Database;
  const rows = yield* query(
    () => db.select().from(projects).orderBy(asc(projects.name), asc(projects.id)),
    "Could not read projects.",
  );
  return yield* decodeRows(
    rows,
    parseProject,
    "Turso returned a project row the collection schema rejected.",
  );
});

export const readEntries = Effect.fn("readEntries")(function* () {
  const { db } = yield* Database;
  const rows = yield* query(
    () => db.select().from(entries).orderBy(asc(entries.createdAt), asc(entries.id)),
    "Could not read entries.",
  );
  return yield* decodeRows(
    rows,
    parseEntry,
    "Turso returned an entry row the collection schema rejected.",
  );
});

export const insertProjects = Effect.fn("insertProjects")(function* (rows: ReadonlyArray<Project>) {
  const { db } = yield* Database;
  return yield* mutate(db, "Could not insert the project.", async (tx) => {
    const saved: Array<Project> = [];
    for (const row of rows) {
      await tx.insert(projects).values({ id: row.id, name: row.name });
      saved.push(
        requireProject(await tx.select().from(projects).where(eq(projects.id, row.id)).get()),
      );
    }
    return saved;
  });
});

export const updateProjects = Effect.fn("updateProjects")(function* (
  rows: ReadonlyArray<{ readonly id: string; readonly changes: { readonly name?: string } }>,
) {
  const { db } = yield* Database;
  return yield* mutate(db, "Could not update the project.", async (tx) => {
    const saved: Array<Project> = [];
    for (const row of rows) {
      if (row.changes.name !== undefined) {
        await tx.update(projects).set({ name: row.changes.name }).where(eq(projects.id, row.id));
      }
      saved.push(
        requireProject(await tx.select().from(projects).where(eq(projects.id, row.id)).get()),
      );
    }
    return saved;
  });
});

export const deleteProjects = Effect.fn("deleteProjects")(function* (ids: ReadonlyArray<string>) {
  if (ids.length === 0) {
    return;
  }

  const { db } = yield* Database;
  yield* mutate(db, "Could not delete the project.", async (tx) => {
    const keys = [...ids];
    await tx.delete(entries).where(inArray(entries.projectId, keys));
    await tx.delete(projects).where(inArray(projects.id, keys));
  });
});

export const insertEntries = Effect.fn("insertEntries")(function* (rows: ReadonlyArray<Entry>) {
  const { db } = yield* Database;
  return yield* mutate(db, "Could not insert the entry.", async (tx) => {
    const saved: Array<Entry> = [];
    for (const row of rows) {
      await tx.insert(entries).values({
        id: row.id,
        projectId: row.projectId,
        title: row.title,
        body: row.body,
        createdAt: row.createdAt,
      });
      saved.push(requireEntry(await tx.select().from(entries).where(eq(entries.id, row.id)).get()));
    }
    return saved;
  });
});

export const updateEntries = Effect.fn("updateEntries")(function* (
  rows: ReadonlyArray<{ readonly id: string; readonly changes: EntryChanges }>,
) {
  const { db } = yield* Database;
  return yield* mutate(db, "Could not update the entry.", async (tx) => {
    const saved: Array<Entry> = [];
    for (const row of rows) {
      const changes = pickEntryChanges(row.changes);
      if (Object.keys(changes).length > 0) {
        await tx.update(entries).set(changes).where(eq(entries.id, row.id));
      }
      saved.push(requireEntry(await tx.select().from(entries).where(eq(entries.id, row.id)).get()));
    }
    return saved;
  });
});

export const deleteEntries = Effect.fn("deleteEntries")(function* (ids: ReadonlyArray<string>) {
  if (ids.length === 0) {
    return;
  }

  const { db } = yield* Database;
  yield* mutate(db, "Could not delete the entry.", async (tx) => {
    await tx.delete(entries).where(inArray(entries.id, [...ids]));
  });
});
