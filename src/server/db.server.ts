import { createClient } from "@libsql/client/web";
import type { Client } from "@libsql/client";
import type { LibSQLDatabase } from "drizzle-orm/libsql";
import { drizzle } from "drizzle-orm/libsql/web";
import { migrate } from "drizzle-orm/libsql/migrator";
import { Context, Effect, Layer, Schema } from "effect";
import { sql } from "drizzle-orm";
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

const isLocalUrl = (url: string): boolean => url.startsWith("file:") || url === ":memory:";

const openClient = async (url: string, authToken: string | undefined): Promise<Client> => {
  if (isLocalUrl(url)) {
    const local = await import("@libsql/client");
    // A native busy timeout blocks the thread that must commit the other write.
    // Fail immediately and let the Entry write retry after yielding.
    return local.createClient({ url, timeout: 0 });
  }

  if (authToken === undefined) {
    throw new DatabaseUnconfigured();
  }

  return createClient({ url, authToken });
};

const migratedUrls = new Set<string>();

const prepare = async (db: Db, url: string): Promise<void> => {
  if (!isLocalUrl(url) || url === ":memory:" || migratedUrls.has(url)) {
    if (url === ":memory:") {
      await migrate(db, { migrationsFolder: "drizzle" });
    }
    await db.run(sql`PRAGMA foreign_keys = ON`);
    return;
  }

  await migrate(db, { migrationsFolder: "drizzle" });
  await db.run(sql`PRAGMA foreign_keys = ON`);
  migratedUrls.add(url);
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

      const client = yield* Effect.tryPromise({
        try: () => openClient(url, token),
        catch: (cause) =>
          isStoreError(cause)
            ? cause
            : new DatabaseError({ message: "Could not open Turso.", cause }),
      });
      const db = drizzle({ client, schema });
      yield* Effect.tryPromise({
        try: () => prepare(db, url),
        catch: (cause) =>
          new DatabaseError({ message: "Could not migrate the local database.", cause }),
      });
      return Database.of({ db });
    }),
  );
}
