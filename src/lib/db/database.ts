import { createClient as createNodeClient } from "@libsql/client";
import { createClient } from "@libsql/client/web";
import { sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/libsql/migrator";
import { drizzle } from "drizzle-orm/libsql/web";
import { Context, Effect, Layer, Schema } from "effect";
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

const openClient = (url: string, authToken: string | undefined) => {
  const choice = clientChoice(url, authToken);
  switch (choice.kind) {
    case "local":
      return createNodeClient({ url, timeout: 0 });
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
  const db = drizzle({ client, schema: databaseSchema });
  await prepareDatabase(db, url);
  return db;
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
