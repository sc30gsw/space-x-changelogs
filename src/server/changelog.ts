import { createServerOnlyFn } from "@tanstack/react-start";
import { Context, DateTime, Effect, Layer, ManagedRuntime, Ref, Schema } from "effect";
import type { FeedbackInput } from "../schemas/feedback";
import type { LaunchSearch } from "../schemas/launch-search";

export class CatalogUnavailable extends Schema.TaggedError<CatalogUnavailable>()(
  "CatalogUnavailable",
  {
    message: Schema.String,
    cause: Schema.Defect(),
  },
) {}

export class FeedbackRejected extends Schema.TaggedError<FeedbackRejected>()("FeedbackRejected", {
  message: Schema.String,
}) {}

export type LaunchSummary = {
  readonly id: string;
  readonly title: string;
  readonly year: number;
};

export type LaunchList = {
  readonly generatedAt: string;
  readonly launches: ReadonlyArray<LaunchSummary>;
};

export type FeedbackReceipt = {
  readonly id: string;
  readonly acceptedAt: string;
};

const readCatalog = createServerOnlyFn((): ReadonlyArray<LaunchSummary> => [
  { id: "ift-5", title: "Starship Flight 5", year: 2024 },
  { id: "direct-to-cell", title: "Starlink Direct to Cell", year: 2024 },
  { id: "booster-catch", title: "Super Heavy booster catch", year: 2025 },
  { id: "pad-2", title: "Launch pad 2", year: 2026 },
]);

export class Changelog extends Context.Service<
  Changelog,
  {
    readonly list: (search: LaunchSearch) => Effect.Effect<LaunchList, CatalogUnavailable>;
    readonly submit: (input: FeedbackInput) => Effect.Effect<FeedbackReceipt, FeedbackRejected>;
  }
>()("space-x-changelogs/server/Changelog") {
  static readonly layer = Layer.effect(
    Changelog,
    Effect.gen(function* () {
      const nextId = yield* Ref.make(1);

      const list = Effect.fn("Changelog.list")(function* (search: LaunchSearch) {
        const now = yield* DateTime.now;
        const entries = yield* Effect.try({
          try: () => readCatalog(),
          catch: (cause) =>
            new CatalogUnavailable({
              message: "Launch catalog is unavailable.",
              cause,
            }),
        });
        const query = search.q.trim().toLowerCase();
        const launches = entries.filter((entry) => {
          const matchesYear = entry.year === search.year;
          const matchesQuery = query.length === 0 || entry.title.toLowerCase().includes(query);
          return matchesYear && matchesQuery;
        });

        return {
          generatedAt: DateTime.formatIso(now),
          launches,
        };
      });

      const submit = Effect.fn("Changelog.submit")(function* (input: FeedbackInput) {
        if (input.message.includes("http://") || input.message.includes("https://")) {
          return yield* new FeedbackRejected({
            message: "Links are not accepted in this demo.",
          });
        }

        const acceptedAt = yield* DateTime.now;
        const id = yield* Ref.getAndUpdate(nextId, (current) => current + 1);
        return {
          id: `feedback-${id}`,
          acceptedAt: DateTime.formatIso(acceptedAt),
        };
      });

      return Changelog.of({ list, submit });
    }),
  );
}

export const changelogRuntime = ManagedRuntime.make(Changelog.layer);
