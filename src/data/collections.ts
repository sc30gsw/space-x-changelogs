import { collectionOptions } from "@tanstack/db";
import { queryCollectionOptions } from "@tanstack/query-db-collection";
import type { QueryClient } from "@tanstack/query-core";
import {
  createEntries,
  createProjects,
  listEntries,
  listProjects,
  removeEntries,
  removeProjects,
  saveEntries,
  saveProjects,
} from "../functions/records";
import { pickEntryChanges } from "./entry-changes";
import { entrySchema, projectSchema } from "./schemas";

/**
 * Adoption: wrap the list endpoints in collections first. Add on-demand sync
 * (`syncMode: "on-demand"`) when the API can answer live-query predicates.
 */

const projectCollection = collectionOptions("projects", (client) =>
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

const entryCollection = collectionOptions("entries", (client) =>
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
          changes: pickEntryChanges(mutation.changes),
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
} as const;
