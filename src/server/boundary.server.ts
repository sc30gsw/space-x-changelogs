import { createServerOnlyFn } from "@tanstack/react-start";
import { setResponseStatus } from "@tanstack/react-start/server";
import { Effect, Schema } from "effect";
import { Database, type DatabaseError, type DatabaseUnconfigured } from "./db.server";

export class HttpFailure extends Schema.TaggedError<HttpFailure>()("HttpFailure", {
  status: Schema.Int,
  message: Schema.String,
  cause: Schema.optional(Schema.Defect()),
}) {}

type ServerError = HttpFailure | DatabaseError | DatabaseUnconfigured;

const toHttpFailure = (error: ServerError): HttpFailure => {
  switch (error._tag) {
    case "HttpFailure":
      return error;
    case "DatabaseUnconfigured":
      return new HttpFailure({
        status: 500,
        message: "Turso is not configured. Set TURSO_DATABASE_URL and TURSO_AUTH_TOKEN.",
      });
    case "DatabaseError":
      return new HttpFailure({ status: 503, message: error.message, cause: error.cause });
    default: {
      const unreachable: never = error;
      return unreachable;
    }
  }
};

export const runHttp = createServerOnlyFn(
  <A>(program: Effect.Effect<A, ServerError, Database>): Promise<A> =>
    Effect.runPromise(
      program.pipe(
        Effect.provide(Database.layer),
        Effect.mapError(toHttpFailure),
        Effect.tapError((error) =>
          Effect.sync(() => {
            setResponseStatus(error.status);
          }),
        ),
        Effect.mapError((error) => new Error(error.message)),
      ),
    ),
);
