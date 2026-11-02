import type {
  Client,
  InArgs,
  InStatement,
  ResultSet,
  Row,
  Transaction,
  TransactionMode,
} from "@libsql/client";
import { createClient } from "@libsql/client/web";
import { sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/libsql/migrator";
import { drizzle } from "drizzle-orm/libsql/web";
import { Context, Effect, Layer, Schema } from "effect";
import { DatabaseSync, type SQLInputValue, type StatementSync } from "node:sqlite";
import { seedTracks } from "./seed-data";
import { databaseSchema, sources, tracks, type AppDatabase } from "./schema";

export type Db = AppDatabase;

class DatabaseUnconfigured extends Schema.TaggedError<DatabaseUnconfigured>()(
  "DatabaseUnconfigured",
  {},
) {}

export class DatabaseError extends Schema.TaggedError<DatabaseError>()("DatabaseError", {
  message: Schema.String,
  cause: Schema.Defect(),
}) {}

export class RecordNotFound extends Schema.TaggedError<RecordNotFound>()("RecordNotFound", {
  message: Schema.String,
}) {}

export type StoreError = DatabaseUnconfigured | DatabaseError | RecordNotFound;

export const isStoreError = (cause: unknown): cause is StoreError =>
  cause instanceof DatabaseUnconfigured ||
  cause instanceof DatabaseError ||
  cause instanceof RecordNotFound;

const isLocalUrl = (url: string): boolean => url.startsWith("file:") || url === ":memory:";

const migratedUrls = new Set<string>();
const databases = new Map<string, Db>();
const opening = new Map<string, Promise<Db>>();

const attempt = <A>(task: () => Promise<A>, message: string) =>
  Effect.tryPromise({
    try: task,
    catch: (cause) => (isStoreError(cause) ? cause : new DatabaseError({ message, cause })),
  });

const errorText = (error: unknown): string => {
  if (!(error instanceof Error)) {
    return String(error);
  }

  return error.cause === undefined ? error.message : `${error.message} ${errorText(error.cause)}`;
};

const isUnique = (error: unknown): boolean => errorText(error).includes("UNIQUE constraint failed");

const enableForeignKeys = (db: Db) => db.run(sql`PRAGMA foreign_keys = ON`);

const seedDatabase = async (db: Db): Promise<void> => {
  const existing = await db.select({ id: tracks.id }).from(tracks).limit(1);
  if (existing.length > 0) {
    return;
  }

  try {
    await db.transaction(async (tx) => {
      await tx
        .insert(tracks)
        .values(seedTracks.map((track) => ({ id: track.id, name: track.name, slug: track.slug })));
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
};

const prepareDatabase = async (db: Db, url: string): Promise<void> => {
  if (url === ":memory:" || (isLocalUrl(url) && !migratedUrls.has(url))) {
    await migrate(db, { migrationsFolder: "drizzle" });
    if (url.startsWith("file:")) {
      migratedUrls.add(url);
    }
  }

  await enableForeignKeys(db);
  await seedDatabase(db);
};

type ClientChoice =
  | { readonly kind: "local" }
  | { readonly kind: "unconfigured" }
  | { readonly kind: "remote"; readonly authToken: string };

const clientChoice = (url: string, authToken: string | undefined): ClientChoice => {
  if (isLocalUrl(url)) {
    return { kind: "local" };
  }
  if (authToken === undefined) {
    return { kind: "unconfigured" };
  }
  return { kind: "remote", authToken };
};

const sqlitePath = (url: string): string => {
  if (url === ":memory:" || url === "file::memory:") {
    return ":memory:";
  }
  return decodeURIComponent(new URL(url).pathname);
};

const sqlValue = (value: unknown): SQLInputValue => {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === "boolean") {
    return value ? 1 : 0;
  }
  if (typeof value === "number" || typeof value === "string" || typeof value === "bigint") {
    return value;
  }
  if (value instanceof Uint8Array) {
    return value;
  }
  if (value instanceof ArrayBuffer) {
    return new Uint8Array(value);
  }
  throw new DatabaseError({ message: "Unsupported SQL value.", cause: value });
};

const bind = (
  args: InArgs | undefined,
): SQLInputValue[] | Record<string, SQLInputValue> | undefined => {
  if (args === undefined) {
    return undefined;
  }
  if (Array.isArray(args)) {
    return args.map((value) => sqlValue(value));
  }
  const named: Record<string, SQLInputValue> = {};
  for (const [key, value] of Object.entries(args)) {
    named[key] = sqlValue(value);
  }
  return named;
};

const callStatement = <A>(statement: StatementSync, args: InArgs | undefined, rows: boolean): A => {
  const bound = bind(args);
  if (bound === undefined) {
    return (rows ? statement.all() : statement.run()) as A;
  }
  if (Array.isArray(bound)) {
    return (rows ? statement.all(...bound) : statement.run(...bound)) as A;
  }
  return (rows ? statement.all(bound) : statement.run(bound)) as A;
};

const rowFrom = (names: readonly string[], values: readonly unknown[]): Row => {
  const row = Object.create(null) as Row;
  Object.defineProperty(row, "length", { value: values.length });
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    Object.defineProperty(row, index, { value });
    const name = names[index];
    if (name !== undefined && !Object.hasOwn(row, name)) {
      Object.defineProperty(row, name, { value, enumerable: true });
    }
  }
  return row;
};

const resultSet = (
  columns: string[],
  columnTypes: string[],
  rows: Row[],
  rowsAffected: number,
  lastInsertRowid: bigint | undefined,
): ResultSet => ({
  columns,
  columnTypes,
  rows,
  rowsAffected,
  lastInsertRowid,
  toJSON() {
    return { columns, columnTypes, rows, rowsAffected, lastInsertRowid };
  },
});

const executeOn = (db: DatabaseSync, stmt: InStatement, args?: InArgs): ResultSet => {
  const sqlText = typeof stmt === "string" ? stmt : stmt.sql;
  const values = typeof stmt === "string" ? args : stmt.args;
  const statement = db.prepare(sqlText);
  const columns = statement.columns();
  if (columns.length === 0) {
    const info = callStatement<{ changes: number | bigint; lastInsertRowid: number | bigint }>(
      statement,
      values,
      false,
    );
    const rowid = info.lastInsertRowid;
    return resultSet(
      [],
      [],
      [],
      Number(info.changes),
      typeof rowid === "bigint" ? rowid : BigInt(rowid),
    );
  }
  const objects = callStatement<Record<string, unknown>[]>(statement, values, true);
  const names = columns.map((column) => column.name);
  const rows = objects.map((row) =>
    rowFrom(
      names,
      names.map((name) => row[name] ?? null),
    ),
  );
  return resultSet(
    names,
    columns.map((column) => column.type ?? ""),
    rows,
    0,
    undefined,
  );
};

const beginSql = (mode?: TransactionMode): string => {
  switch (mode) {
    case "write":
      return "BEGIN IMMEDIATE";
    case "read":
    case "deferred":
    case undefined:
      return "BEGIN";
    default: {
      const unreachable: never = mode;
      return unreachable;
    }
  }
};

class FileTransaction implements Transaction {
  private settled = false;

  constructor(
    private readonly db: DatabaseSync,
    mode?: TransactionMode,
  ) {
    this.db.exec(beginSql(mode));
  }

  execute(stmt: InStatement, args?: InArgs): Promise<ResultSet> {
    return Promise.resolve(executeOn(this.db, stmt, args));
  }

  batch(stmts: InStatement[]): Promise<ResultSet[]> {
    return Promise.resolve(stmts.map((stmt) => executeOn(this.db, stmt)));
  }

  executeMultiple(sqlText: string): Promise<void> {
    this.db.exec(sqlText);
    return Promise.resolve();
  }

  async commit(): Promise<void> {
    if (!this.settled) {
      this.db.exec("COMMIT");
      this.settled = true;
    }
  }

  async rollback(): Promise<void> {
    if (!this.settled) {
      this.db.exec("ROLLBACK");
      this.settled = true;
    }
  }

  close(): void {
    if (!this.settled) {
      this.db.exec("ROLLBACK");
      this.settled = true;
    }
  }

  get closed(): boolean {
    return this.settled;
  }
}

const normalizeBatch = (stmt: InStatement | [string, InArgs?]): InStatement => {
  if (Array.isArray(stmt)) {
    const [sqlText, args] = stmt;
    return args === undefined ? sqlText : { sql: sqlText, args };
  }
  return stmt;
};

const settleBatch = (
  db: DatabaseSync,
  stmts: ReadonlyArray<InStatement | [string, InArgs?]>,
): ResultSet[] => {
  db.exec("BEGIN");
  try {
    const results = stmts.map((stmt) => executeOn(db, normalizeBatch(stmt)));
    db.exec("COMMIT");
    return results;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
};

class FileClient implements Client {
  closed = false;
  protocol = "file";

  constructor(private readonly db: DatabaseSync) {}

  execute(stmt: InStatement, args?: InArgs): Promise<ResultSet> {
    return Promise.resolve(executeOn(this.db, stmt, args));
  }

  batch(stmts: Array<InStatement | [string, InArgs?]>): Promise<ResultSet[]> {
    return Promise.resolve(settleBatch(this.db, stmts));
  }

  migrate(stmts: InStatement[]): Promise<ResultSet[]> {
    this.db.exec("PRAGMA foreign_keys = OFF");
    try {
      const results = settleBatch(this.db, stmts);
      this.db.exec("PRAGMA foreign_keys = ON");
      return Promise.resolve(results);
    } catch (error) {
      this.db.exec("PRAGMA foreign_keys = ON");
      return Promise.reject(error);
    }
  }

  transaction(mode?: TransactionMode): Promise<Transaction> {
    return Promise.resolve(new FileTransaction(this.db, mode));
  }

  executeMultiple(sqlText: string): Promise<void> {
    this.db.exec(sqlText);
    return Promise.resolve();
  }

  sync(): Promise<{ frames_synced: number; frame_no: number }> {
    return Promise.reject(
      new DatabaseError({ message: "File databases do not sync.", cause: undefined }),
    );
  }

  close(): void {
    if (!this.closed) {
      this.closed = true;
      this.db.close();
    }
  }

  reconnect(): void {
    this.closed = false;
  }
}

const openFileClient = (url: string): Client => new FileClient(new DatabaseSync(sqlitePath(url)));

const openClient = (url: string, authToken: string | undefined): Client => {
  const choice = clientChoice(url, authToken);
  switch (choice.kind) {
    case "local":
      return openFileClient(url);
    case "remote":
      return createClient({ url, authToken: choice.authToken });
    case "unconfigured":
      throw new DatabaseUnconfigured();
    default: {
      const unreachable: never = choice;
      return unreachable;
    }
  }
};

const createDatabase = async (url: string, authToken: string | undefined): Promise<Db> => {
  const client = openClient(url, authToken);
  try {
    const db = drizzle({ client, schema: databaseSchema });
    await prepareDatabase(db, url);
    return db;
  } catch (error) {
    client.close();
    throw error;
  }
};

const loadDatabase = (url: string, authToken: string | undefined): Promise<Db> => {
  const cached = databases.get(url);
  if (cached !== undefined) {
    return Promise.resolve(cached);
  }

  const pending = opening.get(url);
  if (pending !== undefined) {
    return pending;
  }

  const created = createDatabase(url, authToken).then(
    (db) => {
      databases.set(url, db);
      opening.delete(url);
      return db;
    },
    (error: unknown) => {
      opening.delete(url);
      throw error;
    },
  );
  opening.set(url, created);
  return created;
};

export class Database extends Context.Service<Database, { readonly db: Db }>()(
  "space-x-changelogs/server/Database",
) {
  static readonly layer = Layer.effect(
    Database,
    Effect.gen(function* () {
      const url = process.env.TURSO_DATABASE_URL;
      const authToken = process.env.TURSO_AUTH_TOKEN;
      if (typeof url !== "string" || url.length === 0) {
        return yield* new DatabaseUnconfigured();
      }

      const token = typeof authToken === "string" && authToken.length > 0 ? authToken : undefined;
      if (!isLocalUrl(url) && token === undefined) {
        return yield* new DatabaseUnconfigured();
      }

      const db = yield* attempt(() => loadDatabase(url, token), "Could not open the database.");
      return Database.of({ db });
    }),
  );
}
