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
  saveMemos,
  saveSources,
  saveTracks,
  setCaughtUpFn,
} from "../api/records";
import { pickMemoChanges, pickSourceChanges, pickTrackChanges } from "../utils/changes";
import { entrySchema, memoSchema, sourceSchema, trackSchema } from "../types/schemas";

type MemoSync = {
  readonly idsFor: (entryIds: readonly string[]) => readonly string[];
  readonly drop: (ids: readonly string[]) => Promise<void> | void;
};

let memoSync: MemoSync | null = null;

export const bindMemoSync = (sync: MemoSync): void => {
  memoSync = sync;
};

const memoIdsForEntries = (entryIds: readonly string[]): readonly string[] =>
  memoSync?.idsFor(entryIds) ?? [];

const dropMemoRows = (ids: readonly string[]): Promise<void> | void => memoSync?.drop(ids);

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
      const caughtUpIds: string[] = [];
      const unreadIds: string[] = [];
      for (const mutation of transaction.mutations) {
        const caughtUp = mutation.changes.caughtUp;
        if (caughtUp === undefined) {
          continue;
        }
        const ids = caughtUp ? caughtUpIds : unreadIds;
        ids.push(String(mutation.key));
      }
      const caughtUpRows =
        caughtUpIds.length === 0
          ? []
          : await setCaughtUpFn({ data: { ids: caughtUpIds, caughtUp: true } });
      const unreadRows =
        unreadIds.length === 0
          ? []
          : await setCaughtUpFn({ data: { ids: unreadIds, caughtUp: false } });
      const saved = [...caughtUpRows, ...unreadRows];
      if (saved.length > 0) {
        await collection.utils.writeUpsert(saved);
      }
    },
    onDelete: async ({ transaction, collection }) => {
      const keys = transaction.mutations.map((mutation) => String(mutation.key));
      await removeEntriesFn({ data: keys });
      await collection.utils.writeDelete(keys);
      const memoIds = memoIdsForEntries(keys);
      if (memoIds.length > 0) {
        await dropMemoRows(memoIds);
      }
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
