import { createServerOnlyFn } from "@tanstack/react-start";
import { connect, type Connection } from "@tursodatabase/serverless";
import { Effect } from "effect";
import * as v from "valibot";
import type { Entry, EntryChanges, EntrySubset, Project } from "../data/schemas";
import { entrySchema, projectSchema } from "../data/schemas";
import { HttpFailure } from "./boundary.server";

const entryColumns = {
  id: "id",
  projectId: "project_id",
  title: "title",
  body: "body",
  createdAt: "created_at",
} as const;

type EntryField = keyof typeof entryColumns;

const openTurso = createServerOnlyFn((): Connection | null => {
  const url = process.env.TURSO_DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;
  if (
    typeof url !== "string" ||
    url.length === 0 ||
    typeof authToken !== "string" ||
    authToken.length === 0
  ) {
    return null;
  }

  return connect({ url, authToken });
});

const openConfigured = Effect.gen(function* () {
  const connection = openTurso();
  if (connection === null) {
    return yield* new HttpFailure({
      status: 500,
      message: "Turso is not configured. Set TURSO_DATABASE_URL and TURSO_AUTH_TOKEN.",
    });
  }

  return connection;
});

const query = <A>(task: () => Promise<A>, message: string) =>
  Effect.tryPromise({
    try: task,
    catch: (cause) => new HttpFailure({ status: 503, message, cause }),
  });

const decode = <A>(schema: v.GenericSchema<A>, row: unknown, message: string) =>
  Effect.try({
    try: () => v.parse(schema, row),
    catch: (cause) => new HttpFailure({ status: 500, message, cause }),
  });

const ensureSchema = (connection: Connection) =>
  query(async () => {
    await connection.run(`CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL
    )`);
    await connection.run(`CREATE TABLE IF NOT EXISTS entries (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      created_at TEXT NOT NULL
    )`);
  }, "Could not prepare the Turso schema.");

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const projectFromRow = (row: unknown): unknown => {
  if (!isRecord(row)) {
    return row;
  }

  return { id: row.id, name: row.name };
};

const entryFromRow = (row: unknown): unknown => {
  if (!isRecord(row)) {
    return row;
  }

  return {
    id: row.id,
    projectId: row.project_id,
    title: row.title,
    body: row.body,
    createdAt: row.created_at,
  };
};

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

const comparisonSql = (operator: string): string | undefined => {
  switch (operator) {
    case "eq":
      return "=";
    case "gt":
      return ">";
    case "gte":
      return ">=";
    case "lt":
      return "<";
    case "lte":
      return "<=";
    case "like":
      return "LIKE";
    default:
      return undefined;
  }
};

const sqlDirection = (direction: "asc" | "desc"): "ASC" | "DESC" => {
  switch (direction) {
    case "asc":
      return "ASC";
    case "desc":
      return "DESC";
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
    const clauses: Array<string> = [];
    const args: Array<string | number> = [];

    for (const filter of subset.filters) {
      const field = entryField(filter.field);
      const operator = comparisonSql(filter.operator);
      if (field === undefined || operator === undefined || filter.value === undefined) {
        return yield* new HttpFailure({
          status: 400,
          message: "The entry API does not support that subset predicate yet.",
        });
      }

      clauses.push(`${entryColumns[field]} ${operator} ?`);
      args.push(filter.value);
    }

    const order: Array<string> = [];
    for (const sort of subset.sorts) {
      const field = entryField(sort.field);
      if (field === undefined) {
        return yield* new HttpFailure({
          status: 400,
          message: "The entry API does not support that subset order yet.",
        });
      }

      order.push(`${entryColumns[field]} ${sqlDirection(sort.direction)}`);
    }

    if (!order.some((part) => part.startsWith("id "))) {
      order.push("id ASC");
    }

    const limit = yield* nonNegativeInt(subset.limit, "limit");
    const offset = yield* nonNegativeInt(subset.offset, "offset");
    const where = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
    const paging: Array<string> = [];
    if (limit !== undefined) {
      paging.push("LIMIT ?");
      args.push(limit);
    }
    if (offset !== undefined) {
      paging.push("OFFSET ?");
      args.push(offset);
    }

    return {
      sql: `SELECT id, project_id, title, body, created_at FROM entries ${where} ORDER BY ${order.join(", ")} ${paging.join(" ")}`,
      args,
    };
  });

const decodeProjects = (rows: ReadonlyArray<unknown>) =>
  Effect.forEach(rows, (row) =>
    decode(
      projectSchema,
      projectFromRow(row),
      "Turso returned a project row the collection schema rejected.",
    ),
  );

const decodeEntries = (rows: ReadonlyArray<unknown>) =>
  Effect.forEach(rows, (row) =>
    decode(
      entrySchema,
      entryFromRow(row),
      "Turso returned an entry row the collection schema rejected.",
    ),
  );

const readProjectRow = (connection: Connection, id: string) =>
  query(
    () => connection.get("SELECT id, name FROM projects WHERE id = ?", id),
    "Could not read the project.",
  );

const readEntryRow = (connection: Connection, id: string) =>
  query(
    () =>
      connection.get(
        "SELECT id, project_id, title, body, created_at FROM entries WHERE id = ?",
        id,
      ),
    "Could not read the entry.",
  );

const requireProject = (row: unknown) =>
  Effect.gen(function* () {
    if (row === null || row === undefined) {
      return yield* new HttpFailure({ status: 404, message: "Project was not found." });
    }

    return yield* decode(
      projectSchema,
      projectFromRow(row),
      "Stored project did not match the collection schema.",
    );
  });

const requireEntry = (row: unknown) =>
  Effect.gen(function* () {
    if (row === null || row === undefined) {
      return yield* new HttpFailure({ status: 404, message: "Entry was not found." });
    }

    return yield* decode(
      entrySchema,
      entryFromRow(row),
      "Stored entry did not match the collection schema.",
    );
  });

export const readProjects = Effect.fn("readProjects")(function* () {
  const connection = yield* openConfigured;
  yield* ensureSchema(connection);
  const rows = yield* query(
    () => connection.all("SELECT id, name FROM projects ORDER BY name, id"),
    "Could not read projects.",
  );
  return yield* decodeProjects(rows);
});

export const readEntries = Effect.fn("readEntries")(function* () {
  const connection = yield* openConfigured;
  yield* ensureSchema(connection);
  const rows = yield* query(
    () =>
      connection.all(
        "SELECT id, project_id, title, body, created_at FROM entries ORDER BY created_at, id",
      ),
    "Could not read entries.",
  );
  return yield* decodeEntries(rows);
});

export const readEntriesMatching = Effect.fn("readEntriesMatching")(function* (
  subset: EntrySubset,
) {
  const connection = yield* openConfigured;
  yield* ensureSchema(connection);
  const statement = yield* compileEntrySubset(subset);
  const rows = yield* query(
    () => connection.all(statement.sql, ...statement.args),
    "Could not read the requested entries.",
  );
  return yield* decodeEntries(rows);
});

export const insertProjects = Effect.fn("insertProjects")(function* (rows: ReadonlyArray<Project>) {
  const connection = yield* openConfigured;
  yield* ensureSchema(connection);
  const saved: Array<Project> = [];

  for (const row of rows) {
    yield* query(
      () => connection.run("INSERT INTO projects (id, name) VALUES (?, ?)", row.id, row.name),
      "Could not insert the project.",
    );
    saved.push(yield* requireProject(yield* readProjectRow(connection, row.id)));
  }

  return saved;
});

export const updateProjects = Effect.fn("updateProjects")(function* (
  rows: ReadonlyArray<{ readonly id: string; readonly changes: { readonly name?: string } }>,
) {
  const connection = yield* openConfigured;
  yield* ensureSchema(connection);
  const saved: Array<Project> = [];

  for (const row of rows) {
    if (row.changes.name !== undefined) {
      yield* query(
        () => connection.run("UPDATE projects SET name = ? WHERE id = ?", row.changes.name, row.id),
        "Could not update the project.",
      );
    }

    saved.push(yield* requireProject(yield* readProjectRow(connection, row.id)));
  }

  return saved;
});

export const deleteProjects = Effect.fn("deleteProjects")(function* (ids: ReadonlyArray<string>) {
  const connection = yield* openConfigured;
  yield* ensureSchema(connection);

  for (const id of ids) {
    yield* query(
      () => connection.run("DELETE FROM projects WHERE id = ?", id),
      "Could not delete the project.",
    );
  }
});

const entryAssignments = (changes: EntryChanges): { sql: string; args: Array<string> } => {
  const assignments: Array<string> = [];
  const args: Array<string> = [];

  if (changes.projectId !== undefined) {
    assignments.push("project_id = ?");
    args.push(changes.projectId);
  }
  if (changes.title !== undefined) {
    assignments.push("title = ?");
    args.push(changes.title);
  }
  if (changes.body !== undefined) {
    assignments.push("body = ?");
    args.push(changes.body);
  }
  if (changes.createdAt !== undefined) {
    assignments.push("created_at = ?");
    args.push(changes.createdAt);
  }

  return { sql: assignments.join(", "), args };
};

export const insertEntries = Effect.fn("insertEntries")(function* (rows: ReadonlyArray<Entry>) {
  const connection = yield* openConfigured;
  yield* ensureSchema(connection);
  const saved: Array<Entry> = [];

  for (const row of rows) {
    yield* query(
      () =>
        connection.run(
          "INSERT INTO entries (id, project_id, title, body, created_at) VALUES (?, ?, ?, ?, ?)",
          row.id,
          row.projectId,
          row.title,
          row.body,
          row.createdAt,
        ),
      "Could not insert the entry.",
    );
    saved.push(yield* requireEntry(yield* readEntryRow(connection, row.id)));
  }

  return saved;
});

export const updateEntries = Effect.fn("updateEntries")(function* (
  rows: ReadonlyArray<{ readonly id: string; readonly changes: EntryChanges }>,
) {
  const connection = yield* openConfigured;
  yield* ensureSchema(connection);
  const saved: Array<Entry> = [];

  for (const row of rows) {
    const assignment = entryAssignments(row.changes);
    if (assignment.sql.length > 0) {
      yield* query(
        () =>
          connection.run(
            `UPDATE entries SET ${assignment.sql} WHERE id = ?`,
            ...assignment.args,
            row.id,
          ),
        "Could not update the entry.",
      );
    }

    saved.push(yield* requireEntry(yield* readEntryRow(connection, row.id)));
  }

  return saved;
});

export const deleteEntries = Effect.fn("deleteEntries")(function* (ids: ReadonlyArray<string>) {
  const connection = yield* openConfigured;
  yield* ensureSchema(connection);

  for (const id of ids) {
    yield* query(
      () => connection.run("DELETE FROM entries WHERE id = ?", id),
      "Could not delete the entry.",
    );
  }
});
