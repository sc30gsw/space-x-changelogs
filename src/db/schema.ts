import { sqliteTable, text } from "drizzle-orm/sqlite-core";

// Scaffold tables only. These mirror what the first scaffold created at runtime;
// the production Track/Source/Entry/Memo schema from README.md and GLOSSARY.md
// is not defined yet.

export const projects = sqliteTable("projects", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
});

export const entries = sqliteTable("entries", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull(),
  title: text("title").notNull(),
  body: text("body").notNull(),
  createdAt: text("created_at").notNull(),
});
