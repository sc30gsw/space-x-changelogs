import { createServerOnlyFn } from "@tanstack/react-start";
import { setResponseStatus } from "@tanstack/react-start/server";
import { Effect, Schema } from "effect";
import { Database } from "./db.server";

export class HttpFailure extends Schema.TaggedError<HttpFailure>()("HttpFailure", {
  status: Schema.Int,
  message: Schema.String,
  cause: Schema.optional(Schema.Defect()),
}) {}

// Server functions run an Effect program against the Database service and map a tagged
// failure to the HTTP status here.
export const runHttp = createServerOnlyFn(
  <A>(program: Effect.Effect<A, HttpFailure, Database>): Promise<A> =>
    Effect.runPromise(
      program.pipe(
        Effect.provide(Database.layer),
        Effect.tapError((error) =>
          Effect.sync(() => {
            setResponseStatus(error.status);
          }),
        ),
        Effect.mapError((error) => new Error(error.message)),
      ),
    ),
);
