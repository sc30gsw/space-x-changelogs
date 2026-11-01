import { createClient } from "@libsql/client/web";
import type { LibSQLDatabase } from "drizzle-orm/libsql";
import { drizzle } from "drizzle-orm/libsql/web";
import { Context, Effect, Layer, Schema } from "effect";
import * as schema from "../db/schema";

export type Db = LibSQLDatabase<typeof schema>;

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

export class Database extends Context.Service<Database, { readonly db: Db }>()(
  "space-x-changelogs/server/Database",
) {
  static readonly layer = Layer.effect(
    Database,
    Effect.gen(function* () {
      const url = process.env.TURSO_DATABASE_URL;
      const authToken = process.env.TURSO_AUTH_TOKEN;
      if (
        typeof url !== "string" ||
        url.length === 0 ||
        typeof authToken !== "string" ||
        authToken.length === 0
      ) {
        return yield* new DatabaseUnconfigured();
      }

      const client = createClient({ url, authToken });
      return Database.of({ db: drizzle({ client, schema }) });
    }),
  );
}
