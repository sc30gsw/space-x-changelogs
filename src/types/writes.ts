import { Temporal } from "@js-temporal/polyfill";
import * as v from "valibot";
import type { IngestEntry, SourceSave, TrackSave } from "../lib/db/write";
import { entryKinds } from "../utils/kinds";

const idSchema = v.pipe(v.string(), v.minLength(1));
const httpUrlSchema = v.pipe(
  v.string(),
  v.trim(),
  v.nonEmpty("URL を入力してください"),
  v.regex(/^https?:\/\/\S+$/u, "URL を入力してください"),
);
const nameSchema = v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(80));
const slugSchema = v.pipe(
  v.string(),
  v.trim(),
  v.regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u),
  v.maxLength(80),
);
const labelSchema = v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(120));
const titleSchema = v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(500));
const summarySchema = v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(4000));
const bodySchema = v.pipe(v.string(), v.maxLength(20000));
const isInstant = (value: string): boolean => {
  try {
    Temporal.Instant.from(value);
    return true;
  } catch {
    return false;
  }
};

export const ingestEntrySchema = v.pipe(
  v.object({
    id: v.optional(idSchema),
    trackId: idSchema,
    kind: v.picklist(entryKinds),
    title: titleSchema,
    url: httpUrlSchema,
    publishedAt: v.pipe(v.string(), v.check(isInstant)),
    summary: summarySchema,
    body: v.optional(bodySchema, ""),
  }),
  v.transform((row): IngestEntry => ({
    id: row.id,
    trackId: row.trackId,
    kind: row.kind,
    title: row.title,
    url: row.url,
    publishedAt: row.publishedAt,
    summary: row.summary,
    body: row.body,
  })),
);

export const catchUpSchema = v.array(
  v.object({
    id: idSchema,
    caughtUp: v.boolean(),
  }),
);

export const trackSaveSchema = v.pipe(
  v.object({
    id: idSchema,
    name: nameSchema,
    slug: slugSchema,
  }),
  v.transform((row): TrackSave => ({
    id: row.id,
    name: row.name,
    slug: row.slug,
  })),
);

export const sourceSaveSchema = v.pipe(
  v.object({
    id: idSchema,
    trackId: idSchema,
    label: labelSchema,
    url: httpUrlSchema,
  }),
  v.transform((row): SourceSave => ({
    id: row.id,
    trackId: row.trackId,
    label: row.label,
    url: row.url,
  })),
);

export const memoSaveSchema = v.object({
  id: idSchema,
  entryId: idSchema,
  body: v.pipe(v.string(), v.minLength(1), v.maxLength(20000)),
});

export const removeIdsSchema = v.array(idSchema);
