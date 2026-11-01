import { setResponseStatus } from "@tanstack/react-start/server";
import { Effect } from "effect";
import { Changelog, changelogRuntime } from "./changelog";

export const runHttp = <A, E extends { readonly message: string }>(
  effect: Effect.Effect<A, E, Changelog>,
  statusFor: (error: E) => number,
): Promise<A> =>
  changelogRuntime.runPromise(
    effect.pipe(
      Effect.tapError((error) =>
        Effect.sync(() => {
          setResponseStatus(statusFor(error));
        }),
      ),
      Effect.mapError((error) => new Error(error.message)),
    ),
  );
