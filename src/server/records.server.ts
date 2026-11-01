import { and, asc, desc, eq, gt, gte, like, lt, lte, type SQL } from "drizzle-orm";
import type { AnySQLiteColumn } from "drizzle-orm/sqlite-core";
import { Effect } from "effect";
import * as v from "valibot";
import { entries, projects } from "../db/schema";
import type { Entry, EntryChanges, EntrySubset, Project } from "../data/schemas";
import { entrySchema, projectSchema } from "../data/schemas";
import { HttpFailure } from "./boundary.server";
import { Database, DatabaseError, type Db } from "./db.server";

const entryColumns = {
  id: entries.id,
  projectId: entries.projectId,
  title: entries.title,
  body: entries.body,
  createdAt: entries.createdAt,
} as const;

type EntryField = keyof typeof entryColumns;

const query = <A>(task: () => PromiseLike<A>, message: string) =>
  Effect.tryPromise({
    try: task,
    catch: (cause) => new DatabaseError({ message, cause }),
  });

const decode = <A>(schema: v.GenericSchema<A>, row: unknown, message: string) =>
  Effect.try({
    try: () => v.parse(schema, row),
    catch: (cause) => new HttpFailure({ status: 500, message, cause }),
  });

const entryField = (field: ReadonlyArray<string | number>): EntryField | undefined => {
  const name = field.at(-1);
  if (field.length === 0 || field.length > 2 || typeof name !== "string") {
    return undefined;
  }
  if (field.length === 2 && field[0] !== "entry") {
    return undefined;
  }

  switch (name) {
    case "id":
    case "projectId":
    case "title":
    case "body":
    case "createdAt":
      return name;
    default:
      return undefined;
  }
};

const comparison = (
  operator: string,
  column: AnySQLiteColumn,
  value: string | number,
): SQL | undefined => {
  switch (operator) {
    case "eq":
      return eq(column, value);
    case "gt":
      return gt(column, value);
    case "gte":
      return gte(column, value);
    case "lt":
      return lt(column, value);
    case "lte":
      return lte(column, value);
    case "like":
      return like(column, String(value));
    default:
      return undefined;
  }
};

const ordering = (direction: "asc" | "desc", column: AnySQLiteColumn): SQL => {
  switch (direction) {
    case "asc":
      return asc(column);
    case "desc":
      return desc(column);
    default: {
      const unreachable: never = direction;
      return unreachable;
    }
  }
};

const nonNegativeInt = (value: number | undefined, label: string) =>
  Effect.gen(function* () {
    if (value === undefined) {
      return undefined;
    }

    if (!Number.isInteger(value) || value < 0) {
      return yield* new HttpFailure({
        status: 400,
        message: `Subset ${label} must be a non-negative integer.`,
      });
    }

    return value;
  });

const compileEntrySubset = (subset: EntrySubset) =>
  Effect.gen(function* () {
    const clauses: Array<SQL> = [];

    for (const filter of subset.filters) {
      const field = entryField(filter.field);
      const clause =
        field === undefined || filter.value === undefined
          ? undefined
          : comparison(filter.operator, entryColumns[field], filter.value);
      if (clause === undefined) {
        return yield* new HttpFailure({
          status: 400,
          message: "The entry API does not support that subset predicate yet.",
        });
      }

      clauses.push(clause);
    }

    const order: Array<SQL> = [];
    let orderedById = false;
    for (const sort of subset.sorts) {
      const field = entryField(sort.field);
      if (field === undefined) {
        return yield* new HttpFailure({
          status: 400,
          message: "The entry API does not support that subset order yet.",
        });
      }

      orderedById = orderedById || field === "id";
      order.push(ordering(sort.direction, entryColumns[field]));
    }

    if (!orderedById) {
      order.push(asc(entries.id));
    }

    const limit = yield* nonNegativeInt(subset.limit, "limit");
    const offset = yield* nonNegativeInt(subset.offset, "offset");

    return { where: clauses.length > 0 ? and(...clauses) : undefined, order, limit, offset };
  });

const decodeProjects = (rows: ReadonlyArray<unknown>) =>
  Effect.forEach(rows, (row) =>
    decode(projectSchema, row, "Turso returned a project row the collection schema rejected."),
  );

const decodeEntries = (rows: ReadonlyArray<unknown>) =>
  Effect.forEach(rows, (row) =>
    decode(entrySchema, row, "Turso returned an entry row the collection schema rejected."),
  );

const requireProject = (row: unknown) =>
  Effect.gen(function* () {
    if (row === null || row === undefined) {
      return yield* new HttpFailure({ status: 404, message: "Project was not found." });
    }

    return yield* decode(projectSchema, row, "Stored project did not match the collection schema.");
  });

const requireEntry = (row: unknown) =>
  Effect.gen(function* () {
    if (row === null || row === undefined) {
      return yield* new HttpFailure({ status: 404, message: "Entry was not found." });
    }

    return yield* decode(entrySchema, row, "Stored entry did not match the collection schema.");
  });

const readProjectRow = (db: Db, id: string) =>
  query(
    () => db.select().from(projects).where(eq(projects.id, id)).get(),
    "Could not read the project.",
  );

const readEntryRow = (db: Db, id: string) =>
  query(
    () => db.select().from(entries).where(eq(entries.id, id)).get(),
    "Could not read the entry.",
  );

export const readProjects = Effect.fn("readProjects")(function* () {
  const { db } = yield* Database;
  const rows = yield* query(
    () => db.select().from(projects).orderBy(asc(projects.name), asc(projects.id)),
    "Could not read projects.",
  );
  return yield* decodeProjects(rows);
});

export const readEntries = Effect.fn("readEntries")(function* () {
  const { db } = yield* Database;
  const rows = yield* query(
    () => db.select().from(entries).orderBy(asc(entries.createdAt), asc(entries.id)),
    "Could not read entries.",
  );
  return yield* decodeEntries(rows);
});

export const readEntriesMatching = Effect.fn("readEntriesMatching")(function* (
  subset: EntrySubset,
) {
  const { db } = yield* Database;
  const statement = yield* compileEntrySubset(subset);
  const rows = yield* query(() => {
    const base = db
      .select()
      .from(entries)
      .where(statement.where)
      .orderBy(...statement.order);
    const limited = statement.limit === undefined ? base : base.limit(statement.limit);
    return statement.offset === undefined ? limited : limited.offset(statement.offset);
  }, "Could not read the requested entries.");
  return yield* decodeEntries(rows);
});

export const insertProjects = Effect.fn("insertProjects")(function* (rows: ReadonlyArray<Project>) {
  const { db } = yield* Database;
  const saved: Array<Project> = [];

  for (const row of rows) {
    yield* query(
      () => db.insert(projects).values({ id: row.id, name: row.name }),
      "Could not insert the project.",
    );
    saved.push(yield* requireProject(yield* readProjectRow(db, row.id)));
  }

  return saved;
});

export const updateProjects = Effect.fn("updateProjects")(function* (
  rows: ReadonlyArray<{ readonly id: string; readonly changes: { readonly name?: string } }>,
) {
  const { db } = yield* Database;
  const saved: Array<Project> = [];

  for (const row of rows) {
    if (row.changes.name !== undefined) {
      const name = row.changes.name;
      yield* query(
        () => db.update(projects).set({ name }).where(eq(projects.id, row.id)),
        "Could not update the project.",
      );
    }

    saved.push(yield* requireProject(yield* readProjectRow(db, row.id)));
  }

  return saved;
});

export const deleteProjects = Effect.fn("deleteProjects")(function* (ids: ReadonlyArray<string>) {
  const { db } = yield* Database;

  for (const id of ids) {
    yield* query(
      () => db.delete(projects).where(eq(projects.id, id)),
      "Could not delete the project.",
    );
  }
});

const entryAssignments = (changes: EntryChanges): Partial<typeof entries.$inferInsert> => {
  const assignments: Partial<typeof entries.$inferInsert> = {};

  if (changes.projectId !== undefined) {
    assignments.projectId = changes.projectId;
  }
  if (changes.title !== undefined) {
    assignments.title = changes.title;
  }
  if (changes.body !== undefined) {
    assignments.body = changes.body;
  }
  if (changes.createdAt !== undefined) {
    assignments.createdAt = changes.createdAt;
  }

  return assignments;
};

export const insertEntries = Effect.fn("insertEntries")(function* (rows: ReadonlyArray<Entry>) {
  const { db } = yield* Database;
  const saved: Array<Entry> = [];

  for (const row of rows) {
    yield* query(
      () =>
        db.insert(entries).values({
          id: row.id,
          projectId: row.projectId,
          title: row.title,
          body: row.body,
          createdAt: row.createdAt,
        }),
      "Could not insert the entry.",
    );
    saved.push(yield* requireEntry(yield* readEntryRow(db, row.id)));
  }

  return saved;
});

export const updateEntries = Effect.fn("updateEntries")(function* (
  rows: ReadonlyArray<{ readonly id: string; readonly changes: EntryChanges }>,
) {
  const { db } = yield* Database;
  const saved: Array<Entry> = [];

  for (const row of rows) {
    const assignments = entryAssignments(row.changes);
    if (Object.keys(assignments).length > 0) {
      yield* query(
        () => db.update(entries).set(assignments).where(eq(entries.id, row.id)),
        "Could not update the entry.",
      );
    }

    saved.push(yield* requireEntry(yield* readEntryRow(db, row.id)));
  }

  return saved;
});

export const deleteEntries = Effect.fn("deleteEntries")(function* (ids: ReadonlyArray<string>) {
  const { db } = yield* Database;

  for (const id of ids) {
    yield* query(() => db.delete(entries).where(eq(entries.id, id)), "Could not delete the entry.");
  }
});
