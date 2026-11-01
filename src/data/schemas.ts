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

export const entryChangesSchema = v.partial(v.omit(entrySchema, ["id"]));

export const projectUpdateSchema = v.object({
  id: v.string(),
  changes: v.object({
    name: v.optional(v.string()),
  }),
});

export const entryUpdateSchema = v.object({
  id: v.string(),
  changes: entryChangesSchema,
});

export const subsetFilterSchema = v.object({
  field: v.array(v.union([v.string(), v.number()])),
  operator: v.string(),
  value: v.optional(v.union([v.string(), v.number()])),
});

export const subsetSortSchema = v.object({
  field: v.array(v.union([v.string(), v.number()])),
  direction: v.picklist(["asc", "desc"]),
});

export const entrySubsetSchema = v.object({
  filters: v.array(subsetFilterSchema),
  sorts: v.array(subsetSortSchema),
  limit: v.optional(v.number()),
  offset: v.optional(v.number()),
});

export const projectsSchema = v.array(projectSchema);
export const entriesSchema = v.array(entrySchema);
export const projectUpdatesSchema = v.array(projectUpdateSchema);
export const entryUpdatesSchema = v.array(entryUpdateSchema);
export const keysSchema = v.array(v.string());

export type Project = v.InferOutput<typeof projectSchema>;
export type Entry = v.InferOutput<typeof entrySchema>;
export type EntryChanges = v.InferOutput<typeof entryChangesSchema>;
export type EntrySubset = v.InferOutput<typeof entrySubsetSchema>;
