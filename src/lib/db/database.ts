import { createClient as createNodeClient } from "@libsql/client";
import { createClient } from "@libsql/client/web";
import { sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/libsql/migrator";
import { drizzle } from "drizzle-orm/libsql/web";
import { Context, Effect, Layer, Schema } from "effect";
import { databaseSchema, type AppDatabase } from "./schema";

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

export class RecordRejected extends Schema.TaggedError<RecordRejected>()("RecordRejected", {
  message: Schema.String,
  cause: Schema.Defect(),
}) {}

export type StoreError = DatabaseUnconfigured | DatabaseError | RecordNotFound | RecordRejected;

export const isStoreError = (cause: unknown): cause is StoreError =>
  cause instanceof DatabaseUnconfigured ||
  cause instanceof DatabaseError ||
  cause instanceof RecordNotFound ||
  cause instanceof RecordRejected;

const isLocalUrl = (url: string): boolean => url.startsWith("file:") || url === ":memory:";

const migratedUrls = new Set<string>();

const attempt = <A>(task: () => Promise<A>, message: string) =>
  Effect.tryPromise({
    try: task,
    catch: (cause) => (isStoreError(cause) ? cause : new DatabaseError({ message, cause })),
  });

const enableForeignKeys = (db: Db) =>
  attempt(() => db.run(sql`PRAGMA foreign_keys = ON`), "Could not enable foreign keys.");

const migrateLocal = (db: Db) =>
  attempt(
    () => migrate(db, { migrationsFolder: "drizzle" }),
    "Could not migrate the local database.",
  );

// A native busy timeout blocks the thread that must commit the other write.
// Fail immediately and let the Entry write retry after yielding.
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

type PrepareChoice =
  | { readonly kind: "memory" }
  | { readonly kind: "file"; readonly url: string }
  | { readonly kind: "ready" };

const prepareChoice = (url: string): PrepareChoice => {
  if (url === ":memory:") {
    return { kind: "memory" };
  }
  if (isLocalUrl(url) && !migratedUrls.has(url)) {
    return { kind: "file", url };
  }
  return { kind: "ready" };
};

const openClient = Effect.fn("Database.openClient")(function* (
  url: string,
  authToken: string | undefined,
) {
  const choice = clientChoice(url, authToken);
  switch (choice.kind) {
    case "local":
      return createNodeClient({ url, timeout: 0 });
    case "unconfigured":
      return yield* new DatabaseUnconfigured();
    case "remote":
      return createClient({ url, authToken: choice.authToken });
    default: {
      const unreachable: never = choice;
      return unreachable;
    }
  }
});

const prepare = Effect.fn("Database.prepare")(function* (db: Db, url: string) {
  const choice = prepareChoice(url);
  switch (choice.kind) {
    case "memory":
      yield* migrateLocal(db);
      break;
    case "file":
      yield* migrateLocal(db);
      migratedUrls.add(choice.url);
      break;
    case "ready":
      break;
    default: {
      const unreachable: never = choice;
      return unreachable;
    }
  }

  yield* enableForeignKeys(db);
});

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

      const client = yield* openClient(url, token);
      const db = drizzle({ client, schema: databaseSchema });
      yield* prepare(db, url);
      return Database.of({ db });
    }),
  );
}
