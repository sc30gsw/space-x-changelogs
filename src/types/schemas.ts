import * as v from "valibot";
import { entryKinds } from "../utils/kinds";

const idSchema = v.pipe(v.string(), v.minLength(1));
const httpUrlSchema = v.pipe(
  v.string(),
  v.trim(),
  v.nonEmpty("URL を入力してください"),
  v.regex(/^https?:\/\/\S+$/u, "URL を入力してください"),
);

export const trackSchema = v.object({
  id: idSchema,
  name: v.pipe(v.string(), v.trim(), v.minLength(1, "名前を入力してください"), v.maxLength(80)),
  slug: v.pipe(
    v.string(),
    v.trim(),
    v.regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u, "slug は英小文字とハイフンです"),
    v.maxLength(80),
  ),
});

export const sourceSchema = v.object({
  id: idSchema,
  trackId: idSchema,
  label: v.pipe(v.string(), v.trim(), v.minLength(1, "ラベルを入力してください"), v.maxLength(120)),
  url: httpUrlSchema,
  position: v.number(),
});

export const entrySchema = v.object({
  id: idSchema,
  trackId: idSchema,
  kind: v.picklist(entryKinds),
  title: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(500)),
  url: httpUrlSchema,
  publishedAt: v.pipe(v.string(), v.minLength(1)),
  summary: v.pipe(
    v.string(),
    v.trim(),
    v.minLength(1, "要約を入力してください"),
    v.maxLength(4000),
  ),
  body: v.pipe(v.string(), v.maxLength(20000)),
  caughtUp: v.boolean(),
  createdAt: v.pipe(v.string(), v.minLength(1)),
  updatedAt: v.pipe(v.string(), v.minLength(1)),
});

export const memoSchema = v.object({
  id: idSchema,
  entryId: idSchema,
  body: v.pipe(v.string(), v.minLength(1), v.maxLength(20000)),
  createdAt: v.pipe(v.string(), v.minLength(1)),
  updatedAt: v.pipe(v.string(), v.minLength(1)),
});

export const submitEntrySchema = v.object({
  id: v.optional(idSchema),
  trackId: idSchema,
  kind: v.picklist(entryKinds),
  title: v.pipe(
    v.string(),
    v.trim(),
    v.minLength(1, "原文タイトルを入力してください"),
    v.maxLength(500),
  ),
  url: httpUrlSchema,
  publishedAt: v.pipe(v.string(), v.minLength(1, "公開日時を入力してください")),
  summary: v.pipe(
    v.string(),
    v.trim(),
    v.minLength(1, "要約を入力してください"),
    v.maxLength(4000),
  ),
  body: v.optional(v.pipe(v.string(), v.maxLength(20000)), ""),
});

export const entryFormSchema = v.object({
  trackId: idSchema,
  kind: v.picklist(entryKinds, "種類を選択してください"),
  title: v.pipe(
    v.string(),
    v.trim(),
    v.minLength(1, "原文タイトルを入力してください"),
    v.maxLength(500),
  ),
  url: httpUrlSchema,
  publishedAt: v.pipe(
    v.string(),
    v.regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/u, "公開日時を入力してください"),
  ),
  summary: v.pipe(
    v.string(),
    v.trim(),
    v.minLength(1, "要約を入力してください"),
    v.maxLength(4000),
  ),
  body: v.pipe(v.string(), v.maxLength(20000)),
});

export const trackFormSchema = v.object({
  name: trackSchema.entries.name,
  slug: trackSchema.entries.slug,
});

export const sourceFormSchema = v.object({
  label: sourceSchema.entries.label,
  url: sourceSchema.entries.url,
});

const entryChangesSchema = v.partial(v.omit(entrySchema, ["id"]));

export const tracksSchema = v.array(trackSchema);
export const sourcesSchema = v.array(sourceSchema);
export const memosSchema = v.array(memoSchema);
export const keysSchema = v.array(idSchema);

export const trackUpdatesSchema = v.array(
  v.object({
    id: idSchema,
    changes: v.object({
      name: v.optional(trackSchema.entries.name),
      slug: v.optional(trackSchema.entries.slug),
    }),
  }),
);

export const sourceUpdatesSchema = v.array(
  v.object({
    id: idSchema,
    changes: v.object({
      label: v.optional(sourceSchema.entries.label),
      url: v.optional(sourceSchema.entries.url),
    }),
  }),
);

export const entryUpdatesSchema = v.array(
  v.object({
    id: idSchema,
    changes: entryChangesSchema,
  }),
);

export const memoUpdatesSchema = v.array(
  v.object({
    id: idSchema,
    changes: v.object({
      body: v.optional(memoSchema.entries.body),
    }),
  }),
);

export type Track = v.InferOutput<typeof trackSchema>;
export type Source = v.InferOutput<typeof sourceSchema>;
export type Entry = v.InferOutput<typeof entrySchema>;
export type Memo = v.InferOutput<typeof memoSchema>;
export type EntryFormValues = v.InferOutput<typeof entryFormSchema>;
export type EntryChanges = v.InferOutput<typeof entryChangesSchema>;
export type TrackFormValues = v.InferOutput<typeof trackFormSchema>;
export type SourceFormValues = v.InferOutput<typeof sourceFormSchema>;
