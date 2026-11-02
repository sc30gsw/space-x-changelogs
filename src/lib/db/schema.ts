import { type BuildQueryResult, type ExtractTablesWithRelations, relations } from "drizzle-orm";
import type { LibSQLDatabase } from "drizzle-orm/libsql";
import { integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { entryKinds } from "../../utils/kinds";

export const tracks = sqliteTable("tracks", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
});

export const sources = sqliteTable(
  "sources",
  {
    id: text("id").primaryKey(),
    trackId: text("track_id")
      .notNull()
      .references(() => tracks.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    url: text("url").notNull(),
    position: integer("position").notNull(),
  },
  (table) => [uniqueIndex("sources_track_url").on(table.trackId, table.url)],
);

export const entries = sqliteTable("entries", {
  id: text("id").primaryKey(),
  trackId: text("track_id")
    .notNull()
    .references(() => tracks.id, { onDelete: "cascade" }),
  kind: text("kind", { enum: entryKinds }).notNull(),
  title: text("title").notNull(),
  url: text("url").notNull().unique(),
  publishedAt: text("published_at").notNull(),
  summary: text("summary").notNull(),
  body: text("body").notNull().default(""),
  caughtUp: integer("caught_up", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const memos = sqliteTable("memos", {
  id: text("id").primaryKey(),
  entryId: text("entry_id")
    .notNull()
    .references(() => entries.id, { onDelete: "cascade" }),
  body: text("body").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const tracksRelations = relations(tracks, ({ many }) => ({
  sources: many(sources),
  entries: many(entries),
}));

export const sourcesRelations = relations(sources, ({ one }) => ({
  track: one(tracks, {
    fields: [sources.trackId],
    references: [tracks.id],
  }),
}));

export const entriesRelations = relations(entries, ({ one, many }) => ({
  track: one(tracks, {
    fields: [entries.trackId],
    references: [tracks.id],
  }),
  memos: many(memos),
}));

export const memosRelations = relations(memos, ({ one }) => ({
  entry: one(entries, {
    fields: [memos.entryId],
    references: [entries.id],
  }),
}));

export const databaseSchema = {
  tracks,
  sources,
  entries,
  memos,
  tracksRelations,
  sourcesRelations,
  entriesRelations,
  memosRelations,
};

export type AppDatabase = LibSQLDatabase<typeof databaseSchema>;

export type Track = typeof tracks.$inferSelect;
export type Source = typeof sources.$inferSelect;
export type Entry = typeof entries.$inferSelect;
export type Memo = typeof memos.$inferSelect;

type RelationalSchema = ExtractTablesWithRelations<typeof databaseSchema>;

export type TrackWithSources = BuildQueryResult<
  RelationalSchema,
  RelationalSchema["tracks"],
  { with: { sources: true } }
>;

export type SourceWithTrack = BuildQueryResult<
  RelationalSchema,
  RelationalSchema["sources"],
  { with: { track: true } }
>;

export type EntryWithMemos = BuildQueryResult<
  RelationalSchema,
  RelationalSchema["entries"],
  { with: { track: true; memos: true } }
>;

export type MemoWithEntry = BuildQueryResult<
  RelationalSchema,
  RelationalSchema["memos"],
  { with: { entry: true } }
>;
