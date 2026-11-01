import { createClient } from "@libsql/client/web";
import type { LibSQLDatabase } from "drizzle-orm/libsql";
import { drizzle } from "drizzle-orm/libsql/web";
import { Context, Effect, Layer } from "effect";
import * as schema from "../db/schema";
import { HttpFailure } from "./boundary.server";

export type Db = LibSQLDatabase<typeof schema>;

// Drizzle over the libsql HTTP client, which runs on Cloudflare Workers as well as Node.
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
        return yield* new HttpFailure({
          status: 500,
          message: "Turso is not configured. Set TURSO_DATABASE_URL and TURSO_AUTH_TOKEN.",
        });
      }

      const client = createClient({ url, authToken });
      return Database.of({ db: drizzle({ client, schema }) });
    }),
  );
}
