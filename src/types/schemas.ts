import { Temporal } from "@js-temporal/polyfill";
import * as v from "valibot";
import type { Entry, Memo, Source, Track } from "../lib/db/schema";
import { entryKinds } from "../utils/kinds";
import { jstLocalPattern } from "../utils/time";

const idSchema = v.pipe(v.string(), v.minLength(1));
const timestampSchema = v.pipe(v.string(), v.minLength(1));
const httpUrlSchema = v.pipe(
  v.string(),
  v.trim(),
  v.nonEmpty("URL を入力してください"),
  v.regex(/^https?:\/\/\S+$/u, "URL を入力してください"),
);
const nameSchema = v.pipe(
  v.string(),
  v.trim(),
  v.minLength(1, "名前を入力してください"),
  v.maxLength(80),
);
const slugSchema = v.pipe(
  v.string(),
  v.trim(),
  v.regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u, "slug は英小文字とハイフンです"),
  v.maxLength(80),
);
const labelSchema = v.pipe(
  v.string(),
  v.trim(),
  v.minLength(1, "ラベルを入力してください"),
  v.maxLength(120),
);
const kindSchema = v.picklist(entryKinds, "種類を選択してください");
const titleSchema = v.pipe(
  v.string(),
  v.trim(),
  v.minLength(1, "原文タイトルを入力してください"),
  v.maxLength(500),
);
const summarySchema = v.pipe(
  v.string(),
  v.trim(),
  v.minLength(1, "要約を入力してください"),
  v.maxLength(4000),
);
const bodySchema = v.pipe(v.string(), v.maxLength(20000));
const memoBodySchema = v.pipe(v.string(), v.minLength(1), v.maxLength(20000));
const isInstant = (value: string): boolean => {
  try {
    Temporal.Instant.from(value);
    return true;
  } catch {
    return false;
  }
};

const publishedAtSchema = v.pipe(v.string(), v.check(isInstant, "公開日時は Instant です。"));
const publishedAtLocalSchema = v.pipe(
  v.string(),
  v.regex(jstLocalPattern, "公開日時を入力してください"),
);

export type { Entry, Memo, Source, Track };

export type TrackChanges = Partial<Pick<Track, "name" | "slug">>;
export type SourceChanges = Partial<Pick<Source, "label" | "url">>;
export type MemoChanges = Partial<Pick<Memo, "body">>;
export type EntryFormValues = Pick<
  Entry,
  "trackId" | "kind" | "title" | "url" | "publishedAt" | "summary" | "body"
>;
export type SubmitEntry = Pick<
  Entry,
  "trackId" | "kind" | "title" | "url" | "publishedAt" | "summary" | "body"
> & { readonly id?: Entry["id"] };
export type TrackFormValues = Pick<Track, "name" | "slug">;
export type SourceFormValues = Pick<Source, "label" | "url">;
export type TrackUpdate = { readonly id: Track["id"]; readonly changes: TrackChanges };
export type SourceUpdate = { readonly id: Source["id"]; readonly changes: SourceChanges };
export type MemoUpdate = { readonly id: Memo["id"]; readonly changes: MemoChanges };
export type SeedSource = Pick<Source, "id" | "label" | "url">;
export type SeedTrack = Pick<Track, "id" | "name" | "slug"> & {
  readonly sources: readonly SeedSource[];
};
export type CaughtUpWrite = {
  readonly ids: readonly Entry["id"][];
  readonly caughtUp: Entry["caughtUp"];
  readonly now: string;
};
export type MemoWrite = Pick<Memo, "id" | "entryId" | "body"> & { readonly now: string };

export const trackSchema = v.pipe(
  v.object({
    id: idSchema,
    name: nameSchema,
    slug: slugSchema,
  }),
  v.transform((row): Track => ({
    id: row.id,
    name: row.name,
    slug: row.slug,
  })),
);

export const sourceSchema = v.pipe(
  v.object({
    id: idSchema,
    trackId: idSchema,
    label: labelSchema,
    url: httpUrlSchema,
    position: v.number(),
  }),
  v.transform((row): Source => ({
    id: row.id,
    trackId: row.trackId,
    label: row.label,
    url: row.url,
    position: row.position,
  })),
);

export const entrySchema = v.pipe(
  v.object({
    id: idSchema,
    trackId: idSchema,
    kind: kindSchema,
    title: titleSchema,
    url: httpUrlSchema,
    publishedAt: publishedAtSchema,
    summary: summarySchema,
    body: bodySchema,
    caughtUp: v.boolean(),
    createdAt: timestampSchema,
    updatedAt: timestampSchema,
  }),
  v.transform((row): Entry => ({
    id: row.id,
    trackId: row.trackId,
    kind: row.kind,
    title: row.title,
    url: row.url,
    publishedAt: row.publishedAt,
    summary: row.summary,
    body: row.body,
    caughtUp: row.caughtUp,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  })),
);

export const memoSchema = v.pipe(
  v.object({
    id: idSchema,
    entryId: idSchema,
    body: memoBodySchema,
    createdAt: timestampSchema,
    updatedAt: timestampSchema,
  }),
  v.transform((row): Memo => ({
    id: row.id,
    entryId: row.entryId,
    body: row.body,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  })),
);

export const submitEntrySchema = v.pipe(
  v.object({
    id: v.optional(idSchema),
    trackId: idSchema,
    kind: kindSchema,
    title: titleSchema,
    url: httpUrlSchema,
    publishedAt: publishedAtSchema,
    summary: summarySchema,
    body: v.optional(bodySchema, ""),
  }),
  v.transform((row): SubmitEntry => ({
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

export const entryFormSchema = v.pipe(
  v.object({
    trackId: idSchema,
    kind: kindSchema,
    title: titleSchema,
    url: httpUrlSchema,
    publishedAt: publishedAtLocalSchema,
    summary: summarySchema,
    body: bodySchema,
  }),
  v.transform((row): EntryFormValues => ({
    trackId: row.trackId,
    kind: row.kind,
    title: row.title,
    url: row.url,
    publishedAt: row.publishedAt,
    summary: row.summary,
    body: row.body,
  })),
);

export const trackFormSchema = v.pipe(
  v.object({
    name: nameSchema,
    slug: slugSchema,
  }),
  v.transform((row): TrackFormValues => ({
    name: row.name,
    slug: row.slug,
  })),
);

export const sourceFormSchema = v.pipe(
  v.object({
    label: labelSchema,
    url: httpUrlSchema,
  }),
  v.transform((row): SourceFormValues => ({
    label: row.label,
    url: row.url,
  })),
);

export const trackUpdatesSchema = v.array(
  v.pipe(
    v.object({
      id: idSchema,
      changes: v.object({
        name: v.optional(nameSchema),
        slug: v.optional(slugSchema),
      }),
    }),
    v.transform((row): TrackUpdate => {
      const changes: TrackChanges = {};
      if (row.changes.name !== undefined) {
        changes.name = row.changes.name;
      }
      if (row.changes.slug !== undefined) {
        changes.slug = row.changes.slug;
      }
      return { id: row.id, changes };
    }),
  ),
);

export const sourceUpdatesSchema = v.array(
  v.pipe(
    v.object({
      id: idSchema,
      changes: v.object({
        label: v.optional(labelSchema),
        url: v.optional(httpUrlSchema),
      }),
    }),
    v.transform((row): SourceUpdate => {
      const changes: SourceChanges = {};
      if (row.changes.label !== undefined) {
        changes.label = row.changes.label;
      }
      if (row.changes.url !== undefined) {
        changes.url = row.changes.url;
      }
      return { id: row.id, changes };
    }),
  ),
);

export const caughtUpSchema = v.object({
  ids: v.pipe(v.array(idSchema), v.minLength(1)),
  caughtUp: v.boolean(),
});

export const memoUpdatesSchema = v.array(
  v.pipe(
    v.object({
      id: idSchema,
      changes: v.object({
        body: v.optional(memoBodySchema),
      }),
    }),
    v.transform((row): MemoUpdate => {
      const changes: MemoChanges = {};
      if (row.changes.body !== undefined) {
        changes.body = row.changes.body;
      }
      return { id: row.id, changes };
    }),
  ),
);

export const tracksSchema = v.array(trackSchema);
export const sourcesSchema = v.array(sourceSchema);
export const memosSchema = v.array(memoSchema);
export const keysSchema = v.array(idSchema);
