import * as v from "valibot";

export const projectSchema = v.object({
  id: v.string(),
  name: v.string(),
});

export const entrySchema = v.object({
  id: v.string(),
  projectId: v.string(),
  title: v.string(),
  body: v.string(),
  createdAt: v.string(),
});

const entryChangesSchema = v.partial(v.omit(entrySchema, ["id"]));

const projectUpdateSchema = v.object({
  id: v.string(),
  changes: v.object({
    name: v.optional(v.string()),
  }),
});

const entryUpdateSchema = v.object({
  id: v.string(),
  changes: entryChangesSchema,
});

export const projectsSchema = v.array(projectSchema);
export const entriesSchema = v.array(entrySchema);
export const projectUpdatesSchema = v.array(projectUpdateSchema);
export const entryUpdatesSchema = v.array(entryUpdateSchema);
export const keysSchema = v.array(v.string());

export type Project = v.InferOutput<typeof projectSchema>;
export type Entry = v.InferOutput<typeof entrySchema>;
export type EntryChanges = v.InferOutput<typeof entryChangesSchema>;
