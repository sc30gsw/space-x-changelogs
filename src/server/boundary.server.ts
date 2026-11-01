import { createServerOnlyFn } from "@tanstack/react-start";
import { setResponseStatus } from "@tanstack/react-start/server";
import { Effect } from "effect";
import { Database, type StoreError } from "./db.server";

const unconfiguredMessage = "Turso is not configured. Set TURSO_DATABASE_URL and TURSO_AUTH_TOKEN.";

const statusFor = (error: StoreError): number => {
  switch (error._tag) {
    case "DatabaseUnconfigured":
      return 500;
    case "RecordNotFound":
      return 404;
    case "RecordRejected":
      return 500;
    case "DatabaseError":
      return 503;
    default: {
      const unreachable: never = error;
      return unreachable;
    }
  }
};

const publicMessage = (error: StoreError): string => {
  switch (error._tag) {
    case "DatabaseUnconfigured":
      return unconfiguredMessage;
    case "RecordNotFound":
    case "RecordRejected":
    case "DatabaseError":
      return error.message;
    default: {
      const unreachable: never = error;
      return unreachable;
    }
  }
};

const logFailure = (error: StoreError): Effect.Effect<void> => {
  switch (error._tag) {
    case "DatabaseError":
    case "RecordRejected":
      return Effect.logError(publicMessage(error), error.cause);
    case "DatabaseUnconfigured":
    case "RecordNotFound":
      return Effect.logError(publicMessage(error));
    default: {
      const unreachable: never = error;
      return unreachable;
    }
  }
};

// Server functions run an Effect program and map a tagged failure to the HTTP status here.
export const runHttp = createServerOnlyFn(
  <A>(program: Effect.Effect<A, StoreError, Database>): Promise<A> =>
    Effect.runPromise(
      program.pipe(
        Effect.provide(Database.layer),
        Effect.tapError((error) =>
          Effect.andThen(
            logFailure(error),
            Effect.sync(() => {
              setResponseStatus(statusFor(error));
            }),
          ),
        ),
        Effect.mapError((error) => new Error(publicMessage(error))),
      ),
    ),
);
