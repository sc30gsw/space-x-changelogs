import { collectionOptions, parseLoadSubsetOptions } from "@tanstack/db";
import { queryCollectionOptions } from "@tanstack/query-db-collection";
import type { QueryClient } from "@tanstack/query-core";
import {
  createEntries,
  createProjects,
  listEntries,
  listEntriesMatching,
  listProjects,
  removeEntries,
  removeProjects,
  saveEntries,
  saveProjects,
} from "../functions/records";
import type { Entry, EntryChanges, Project } from "./schemas";
import { entrySchema, projectSchema } from "./schemas";

/**
 * Adoption sequence for an existing REST or TanStack Query workflow:
 *
 * 1. Collections first. `projectCollection` and `entryCollection` keep the
 *    current list endpoints as their query functions. Live queries and
 *    optimistic mutations sit on those collections. A rejected persistence
 *    handler rolls the optimistic rows back.
 * 2. Query-driven sync, once the API can answer a live query's predicates.
 *    `entryQuerySyncCollection` sets `syncMode: "on-demand"` and sends
 *    `parseLoadSubsetOptions` to `listEntriesMatching`. Use that descriptor
 *    in place of `entryCollection` when the backend supports the filters.
 *    Unsupported predicates fail at the Effect boundary instead of scanning
 *    the whole table.
 */

const definedEntryChanges = (changes: Partial<Entry>): EntryChanges => {
  const next: EntryChanges = {};
  if (changes.projectId !== undefined) {
    next.projectId = changes.projectId;
  }
  if (changes.title !== undefined) {
    next.title = changes.title;
  }
  if (changes.body !== undefined) {
    next.body = changes.body;
  }
  if (changes.createdAt !== undefined) {
    next.createdAt = changes.createdAt;
  }
  return next;
};

export const projectCollection = collectionOptions("projects", (client) =>
  queryCollectionOptions({
    id: "projects",
    queryKey: ["projects"],
    queryFn: () => listProjects(),
    queryClient: client.requireDependency<QueryClient>("queryClient"),
    schema: projectSchema,
    getKey: (project) => project.id,
    onInsert: async ({ transaction, collection }) => {
      const saved = await createProjects({
        data: transaction.mutations.map((mutation) => mutation.modified),
      });
      await collection.utils.writeUpsert(saved);
    },
    onUpdate: async ({ transaction, collection }) => {
      const saved = await saveProjects({
        data: transaction.mutations.map((mutation) => ({
          id: mutation.key,
          changes: { name: mutation.changes.name },
        })),
      });
      await collection.utils.writeUpsert(saved);
    },
    onDelete: async ({ transaction, collection }) => {
      const keys = transaction.mutations.map((mutation) => mutation.key);
      await removeProjects({ data: keys });
      await collection.utils.writeDelete(keys);
    },
  }),
);

export const entryCollection = collectionOptions("entries", (client) =>
  queryCollectionOptions({
    id: "entries",
    queryKey: ["entries"],
    queryFn: () => listEntries(),
    queryClient: client.requireDependency<QueryClient>("queryClient"),
    schema: entrySchema,
    getKey: (entry) => entry.id,
    onInsert: async ({ transaction, collection }) => {
      const saved = await createEntries({
        data: transaction.mutations.map((mutation) => mutation.modified),
      });
      await collection.utils.writeUpsert(saved);
    },
    onUpdate: async ({ transaction, collection }) => {
      const saved = await saveEntries({
        data: transaction.mutations.map((mutation) => ({
          id: mutation.key,
          changes: definedEntryChanges(mutation.changes),
        })),
      });
      await collection.utils.writeUpsert(saved);
    },
    onDelete: async ({ transaction, collection }) => {
      const keys = transaction.mutations.map((mutation) => mutation.key);
      await removeEntries({ data: keys });
      await collection.utils.writeDelete(keys);
    },
  }),
);

export const entryQuerySyncCollection = collectionOptions("entries-sync", (client) =>
  queryCollectionOptions({
    id: "entries-sync",
    queryKey: ["entries", "sync"],
    syncMode: "on-demand",
    queryFn: (ctx) => {
      const request = ctx.meta?.loadSubsetOptions;
      const parsed = parseLoadSubsetOptions(request);
      return listEntriesMatching({
        data: {
          filters: parsed.filters.map((filter) => ({
            field: filter.field,
            operator: filter.operator,
            ...(typeof filter.value === "string" || typeof filter.value === "number"
              ? { value: filter.value }
              : {}),
          })),
          sorts: parsed.sorts.map((sort) => ({
            field: sort.field,
            direction: sort.direction,
          })),
          limit: parsed.limit,
          offset: request?.offset,
        },
      });
    },
    queryClient: client.requireDependency<QueryClient>("queryClient"),
    schema: entrySchema,
    getKey: (entry) => entry.id,
    onInsert: async ({ transaction, collection }) => {
      const saved = await createEntries({
        data: transaction.mutations.map((mutation) => mutation.modified),
      });
      await collection.utils.writeUpsert(saved);
    },
    onUpdate: async ({ transaction, collection }) => {
      const saved = await saveEntries({
        data: transaction.mutations.map((mutation) => ({
          id: mutation.key,
          changes: definedEntryChanges(mutation.changes),
        })),
      });
      await collection.utils.writeUpsert(saved);
    },
    onDelete: async ({ transaction, collection }) => {
      const keys = transaction.mutations.map((mutation) => mutation.key);
      await removeEntries({ data: keys });
      await collection.utils.writeDelete(keys);
    },
  }),
);

export const changelogCollections = {
  projects: projectCollection,
  entries: entryCollection,
  entriesOnDemand: entryQuerySyncCollection,
} as const;

export type { Entry, Project };
