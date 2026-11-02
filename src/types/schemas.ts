import * as v from "valibot";
import type { Entry, Memo, Source, Track } from "../lib/db/schema";
import { entryKinds } from "../utils/kinds";
import { jstLocalPattern } from "../utils/time";

const idSchema = v.pipe(v.string(), v.minLength(1));
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
const publishedAtLocalSchema = v.pipe(
  v.string(),
  v.regex(jstLocalPattern, "公開日時を入力してください"),
);

export type { Entry, Memo, Source, Track };

export type EntryFormValues = Pick<
  Entry,
  "trackId" | "kind" | "title" | "url" | "publishedAt" | "summary" | "body"
>;
export type TrackFormValues = Pick<Track, "name" | "slug">;
export type SourceFormValues = Pick<Source, "label" | "url">;
export type SeedSource = Pick<Source, "id" | "label" | "url">;
export type SeedTrack = Pick<Track, "id" | "name" | "slug"> & {
  readonly sources: readonly SeedSource[];
};

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
