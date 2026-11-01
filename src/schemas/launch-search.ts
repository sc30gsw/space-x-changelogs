import * as v from "valibot";

export const launchSearchSchema = v.object({
  q: v.optional(v.fallback(v.string(), ""), ""),
  year: v.optional(v.fallback(v.pipe(v.number(), v.integer()), 2026), 2026),
});

export type LaunchSearch = v.InferOutput<typeof launchSearchSchema>;
