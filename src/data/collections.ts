import { collectionOptions } from "@tanstack/db";
import { queryCollectionOptions } from "@tanstack/query-db-collection";
import type { QueryClient } from "@tanstack/query-core";
import {
  createMemos,
  createSources,
  createTracks,
  listEntries,
  listMemos,
  listSources,
  listTracks,
  removeEntriesFn,
  removeMemosFn,
  saveEntries,
  saveMemos,
  saveSources,
  saveTracks,
} from "../functions/records";
import { pickEntryChanges, pickMemoChanges, pickSourceChanges, pickTrackChanges } from "./changes";
import { entrySchema, memoSchema, sourceSchema, trackSchema } from "./schemas";

const trackCollection = collectionOptions("tracks", (client) =>
  queryCollectionOptions({
    id: "tracks",
    queryKey: ["tracks"],
    queryFn: () => listTracks(),
    queryClient: client.requireDependency<QueryClient>("queryClient"),
    schema: trackSchema,
    getKey: (track) => track.id,
    onInsert: async ({ transaction, collection }) => {
      const saved = await createTracks({
        data: transaction.mutations.map((mutation) => mutation.modified),
      });
      await collection.utils.writeUpsert(saved);
    },
    onUpdate: async ({ transaction, collection }) => {
      const saved = await saveTracks({
        data: transaction.mutations.map((mutation) => ({
          id: String(mutation.key),
          changes: pickTrackChanges(mutation.changes),
        })),
      });
      await collection.utils.writeUpsert(saved);
    },
  }),
);

const sourceCollection = collectionOptions("sources", (client) =>
  queryCollectionOptions({
    id: "sources",
    queryKey: ["sources"],
    queryFn: () => listSources(),
    queryClient: client.requireDependency<QueryClient>("queryClient"),
    schema: sourceSchema,
    getKey: (source) => source.id,
    onInsert: async ({ transaction, collection }) => {
      const saved = await createSources({
        data: transaction.mutations.map((mutation) => mutation.modified),
      });
      await collection.utils.writeUpsert(saved);
    },
    onUpdate: async ({ transaction, collection }) => {
      const saved = await saveSources({
        data: transaction.mutations.map((mutation) => ({
          id: String(mutation.key),
          changes: pickSourceChanges(mutation.changes),
        })),
      });
      await collection.utils.writeUpsert(saved);
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
    onUpdate: async ({ transaction, collection }) => {
      const saved = await saveEntries({
        data: transaction.mutations.map((mutation) => ({
          id: String(mutation.key),
          changes: pickEntryChanges(mutation.changes),
        })),
      });
      await collection.utils.writeUpsert(saved);
    },
    onDelete: async ({ transaction, collection }) => {
      const keys = transaction.mutations.map((mutation) => String(mutation.key));
      await removeEntriesFn({ data: keys });
      await collection.utils.writeDelete(keys);
    },
  }),
);

const memoCollection = collectionOptions("memos", (client) =>
  queryCollectionOptions({
    id: "memos",
    queryKey: ["memos"],
    queryFn: () => listMemos(),
    queryClient: client.requireDependency<QueryClient>("queryClient"),
    schema: memoSchema,
    getKey: (memo) => memo.id,
    onInsert: async ({ transaction, collection }) => {
      const saved = await createMemos({
        data: transaction.mutations.map((mutation) => mutation.modified),
      });
      await collection.utils.writeUpsert(saved);
    },
    onUpdate: async ({ transaction, collection }) => {
      const saved = await saveMemos({
        data: transaction.mutations.map((mutation) => ({
          id: String(mutation.key),
          changes: pickMemoChanges(mutation.changes),
        })),
      });
      await collection.utils.writeUpsert(saved);
    },
    onDelete: async ({ transaction, collection }) => {
      const keys = transaction.mutations.map((mutation) => String(mutation.key));
      await removeMemosFn({ data: keys });
      await collection.utils.writeDelete(keys);
    },
  }),
);

export const changelogCollections = {
  tracks: trackCollection,
  sources: sourceCollection,
  entries: entryCollection,
  memos: memoCollection,
} as const;
