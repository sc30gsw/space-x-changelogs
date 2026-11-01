import { Effect, Predicate } from "effect";
import { listLaunches } from "../functions/launches";
import type { LaunchSearch } from "../schemas/launch-search";
import type { LaunchList } from "../server/changelog";

const toRouteError = (cause: unknown): Error =>
  Predicate.isError(cause) ? cause : new Error("Could not load launches.");

export const loadLaunchRoute = (search: LaunchSearch): Promise<LaunchList> =>
  Effect.runPromise(
    Effect.tryPromise({
      try: () => listLaunches({ data: search }),
      catch: (cause) => cause,
    }).pipe(Effect.mapError(toRouteError)),
  );
