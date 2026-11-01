import { createServerOnlyFn } from "@tanstack/react-start";
import { setResponseStatus } from "@tanstack/react-start/server";
import { Effect, Schema } from "effect";

export class HttpFailure extends Schema.TaggedError<HttpFailure>()("HttpFailure", {
  status: Schema.Int,
  message: Schema.String,
  cause: Schema.optional(Schema.Defect()),
}) {}

// Server functions run an Effect program and map a tagged failure to the HTTP status here.
export const runHttp = createServerOnlyFn(<A>(program: Effect.Effect<A, HttpFailure>): Promise<A> =>
  Effect.runPromise(
    program.pipe(
      Effect.tapError((error) =>
        Effect.sync(() => {
          setResponseStatus(error.status);
        }),
      ),
      Effect.mapError((error) => new Error(error.message)),
    ),
  ),
);
