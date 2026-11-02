import { collectionOptions } from "@tanstack/db";
import { queryCollectionOptions } from "@tanstack/query-db-collection";
import { QueryClient } from "@tanstack/query-core";
import { DbClient, type Collection } from "@tanstack/react-db";
import { createServerFn } from "@tanstack/react-start";
import {
  catchUpFn,
  ingestEntryFn,
  removeEntriesFn,
  removeMemosFn,
  saveMemoFn,
  saveSourceFn,
  saveTrackFn,
} from "../api/changelog";
import { runHttp } from "../lib/boundary.ts";
import { type Entry, type Memo, type Source, type Track } from "../lib/db/schema";
import {
  readEntries,
  readMemos,
  readSources,
  readTracks,
  type CaughtUpMark,
  type IngestEntry,
  type MemoSave,
  type SourceSave,
  type TrackSave,
} from "../lib/db/write.ts";
import { nowInstant } from "../utils/time";

const listTracks = createServerFn({ method: "GET" }).handler(() => runHttp(readTracks()));

const listSources = createServerFn({ method: "GET" }).handler(() => runHttp(readSources()));

const listEntries = createServerFn({ method: "GET" }).handler(() => runHttp(readEntries()));

const listMemos = createServerFn({ method: "GET" }).handler(() => runHttp(readMemos()));

const trackResults = new Map<string, Track>();
const sourceResults = new Map<string, Source>();
const memoResults = new Map<string, Memo>();
const catchUpResults = new Map<string, Entry[]>();

const tokenOf = (metadata: unknown): string | undefined => {
  if (typeof metadata !== "object" || metadata === null || !("token" in metadata)) {
    return undefined;
  }
  const token = metadata.token;
  return typeof token === "string" ? token : undefined;
};

const take = <T>(results: Map<string, T>, token: string, missing: string): T => {
  const row = results.get(token);
  results.delete(token);
  if (row === undefined) {
    throw new Error(missing);
  }
  return row;
};

const lastMarks = (marks: readonly CaughtUpMark[]): CaughtUpMark[] => {
  const byId = new Map<string, boolean>();
  for (const mark of marks) {
    byId.set(mark.id, mark.caughtUp);
  }
  return [...byId].map(([id, caughtUp]) => ({ id, caughtUp }));
};

let trackCollection: Collection<Track, string> | null = null;
let sourceCollection: Collection<Source, string> | null = null;
let entryCollection: Collection<Entry, string> | null = null;
let memoCollection: Collection<Memo, string> | null = null;

const ready = <T>(value: T | null): T => {
  if (value === null) {
    throw new Error("Changelog is not ready.");
  }
  return value;
};

const trackOptions = collectionOptions("tracks", (client) =>
  queryCollectionOptions({
    id: "tracks",
    queryKey: ["tracks"],
    queryFn: () => listTracks(),
    queryClient: client.requireDependency<QueryClient>("queryClient"),
    getKey: (track) => track.id,
    onInsert: async ({ transaction, collection }) => {
      const saved: Track[] = [];
      for (const mutation of transaction.mutations) {
        const row = await saveTrackFn({
          data: {
            id: mutation.modified.id,
            name: mutation.modified.name,
            slug: mutation.modified.slug,
          },
        });
        const token = tokenOf(mutation.metadata);
        if (token !== undefined) {
          trackResults.set(token, row);
        }
        saved.push(row);
      }
      await collection.utils.writeUpsert(saved);
    },
    onUpdate: async ({ transaction, collection }) => {
      const saved: Track[] = [];
      for (const mutation of transaction.mutations) {
        const row = await saveTrackFn({
          data: {
            id: mutation.modified.id,
            name: mutation.modified.name,
            slug: mutation.modified.slug,
          },
        });
        const token = tokenOf(mutation.metadata);
        if (token !== undefined) {
          trackResults.set(token, row);
        }
        saved.push(row);
      }
      await collection.utils.writeUpsert(saved);
    },
  }),
);

const sourceOptions = collectionOptions("sources", (client) =>
  queryCollectionOptions({
    id: "sources",
    queryKey: ["sources"],
    queryFn: () => listSources(),
    queryClient: client.requireDependency<QueryClient>("queryClient"),
    getKey: (source) => source.id,
    onInsert: async ({ transaction, collection }) => {
      const saved: Source[] = [];
      for (const mutation of transaction.mutations) {
        const row = await saveSourceFn({
          data: {
            id: mutation.modified.id,
            trackId: mutation.modified.trackId,
            label: mutation.modified.label,
            url: mutation.modified.url,
          },
        });
        const token = tokenOf(mutation.metadata);
        if (token !== undefined) {
          sourceResults.set(token, row);
        }
        saved.push(row);
      }
      await collection.utils.writeUpsert(saved);
    },
    onUpdate: async ({ transaction, collection }) => {
      const saved: Source[] = [];
      for (const mutation of transaction.mutations) {
        const row = await saveSourceFn({
          data: {
            id: mutation.modified.id,
            trackId: mutation.modified.trackId,
            label: mutation.modified.label,
            url: mutation.modified.url,
          },
        });
        const token = tokenOf(mutation.metadata);
        if (token !== undefined) {
          sourceResults.set(token, row);
        }
        saved.push(row);
      }
      await collection.utils.writeUpsert(saved);
    },
  }),
);

const entryOptions = collectionOptions("entries", (client) =>
  queryCollectionOptions({
    id: "entries",
    queryKey: ["entries"],
    queryFn: () => listEntries(),
    queryClient: client.requireDependency<QueryClient>("queryClient"),
    getKey: (entry) => entry.id,
    onUpdate: async ({ transaction, collection }) => {
      const marks: CaughtUpMark[] = [];
      for (const mutation of transaction.mutations) {
        const caughtUp = mutation.changes.caughtUp;
        if (typeof caughtUp !== "boolean") {
          continue;
        }
        marks.push({ id: String(mutation.key), caughtUp });
      }
      if (marks.length === 0) {
        return;
      }
      const saved = await catchUpFn({ data: marks });
      const token = tokenOf(transaction.mutations[0].metadata);
      if (token !== undefined) {
        catchUpResults.set(token, saved);
      }
      await collection.utils.writeUpsert(saved);
    },
    onDelete: async ({ transaction, collection }) => {
      const keys = transaction.mutations.map((mutation) => String(mutation.key));
      await removeEntriesFn({ data: keys });
      await collection.utils.writeDelete(keys);
      const memoIds = [...ready(memoCollection).values()]
        .filter((memo) => keys.includes(memo.entryId))
        .map((memo) => memo.id);
      if (memoIds.length > 0) {
        await ready(memoCollection).utils.writeDelete(memoIds);
      }
    },
  }),
);

const memoOptions = collectionOptions("memos", (client) =>
  queryCollectionOptions({
    id: "memos",
    queryKey: ["memos"],
    queryFn: () => listMemos(),
    queryClient: client.requireDependency<QueryClient>("queryClient"),
    getKey: (memo) => memo.id,
    onInsert: async ({ transaction, collection }) => {
      const saved: Memo[] = [];
      for (const mutation of transaction.mutations) {
        const row = await saveMemoFn({
          data: {
            id: mutation.modified.id,
            entryId: mutation.modified.entryId,
            body: mutation.modified.body,
          },
        });
        const token = tokenOf(mutation.metadata);
        if (token !== undefined) {
          memoResults.set(token, row);
        }
        saved.push(row);
      }
      await collection.utils.writeUpsert(saved);
    },
    onUpdate: async ({ transaction, collection }) => {
      const saved: Memo[] = [];
      for (const mutation of transaction.mutations) {
        const row = await saveMemoFn({
          data: {
            id: mutation.modified.id,
            entryId: mutation.modified.entryId,
            body: mutation.modified.body,
          },
        });
        const token = tokenOf(mutation.metadata);
        if (token !== undefined) {
          memoResults.set(token, row);
        }
        saved.push(row);
      }
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
  tracks: trackOptions,
  sources: sourceOptions,
  entries: entryOptions,
  memos: memoOptions,
} as const;

export function createChangelogClient(): DbClient {
  const client = new DbClient({
    queryClient: new QueryClient(),
    changelogCollections,
  });
  trackCollection = client.collection(changelogCollections.tracks);
  sourceCollection = client.collection(changelogCollections.sources);
  entryCollection = client.collection(changelogCollections.entries);
  memoCollection = client.collection(changelogCollections.memos);
  return client;
}

const settle = async <T>(
  token: string,
  run: Promise<unknown>,
  results: Map<string, T>,
): Promise<void> => {
  try {
    await run;
  } catch (error) {
    results.delete(token);
    throw error;
  }
};

export async function ingestEntry(input: IngestEntry): Promise<Entry> {
  const saved = await ingestEntryFn({ data: input });
  await ready(entryCollection).utils.writeUpsert(saved);
  return saved;
}

export async function catchUp(marks: readonly CaughtUpMark[]): Promise<Entry[]> {
  const next = lastMarks(marks);
  if (next.length === 0) {
    return [];
  }

  const collection = ready(entryCollection);
  const ids = next.map((mark) => mark.id);
  if (ids.some((id) => !collection.has(id))) {
    const saved = await catchUpFn({ data: next });
    await collection.utils.writeUpsert(saved);
    return saved;
  }

  const token = crypto.randomUUID();
  const tx = collection.update(ids, { metadata: { token } }, (drafts) => {
    for (const draft of drafts) {
      const mark = next.find((item) => item.id === draft.id);
      if (mark !== undefined) {
        draft.caughtUp = mark.caughtUp;
      }
    }
  });
  await settle(token, tx.when("settled"), catchUpResults);
  return take(catchUpResults, token, "Could not update Caught up.");
}

export async function saveTrack(input: TrackSave): Promise<Track> {
  const collection = ready(trackCollection);
  const token = crypto.randomUUID();
  const tx = collection.has(input.id)
    ? collection.update(input.id, { metadata: { token } }, (draft) => {
        draft.name = input.name;
        draft.slug = input.slug;
      })
    : collection.insert(
        { id: input.id, name: input.name, slug: input.slug },
        { metadata: { token } },
      );
  await settle(token, tx.when("settled"), trackResults);
  return take(trackResults, token, "Track was not found.");
}

export async function saveSource(input: SourceSave): Promise<Source> {
  const collection = ready(sourceCollection);
  const token = crypto.randomUUID();
  let max = -1;
  if (!collection.has(input.id)) {
    for (const source of collection.values()) {
      if (source.trackId === input.trackId && source.position > max) {
        max = source.position;
      }
    }
  }
  const tx = collection.has(input.id)
    ? collection.update(input.id, { metadata: { token } }, (draft) => {
        draft.trackId = input.trackId;
        draft.label = input.label;
        draft.url = input.url;
      })
    : collection.insert(
        {
          id: input.id,
          trackId: input.trackId,
          label: input.label,
          url: input.url,
          position: max + 1,
        },
        { metadata: { token } },
      );
  await settle(token, tx.when("settled"), sourceResults);
  return take(sourceResults, token, "Source was not found.");
}

export async function saveMemo(input: MemoSave): Promise<Memo> {
  const collection = ready(memoCollection);
  const token = crypto.randomUUID();
  const now = nowInstant();
  const tx = collection.has(input.id)
    ? collection.update(input.id, { metadata: { token } }, (draft) => {
        draft.entryId = input.entryId;
        draft.body = input.body;
      })
    : collection.insert(
        {
          id: input.id,
          entryId: input.entryId,
          body: input.body,
          createdAt: now,
          updatedAt: now,
        },
        { metadata: { token } },
      );
  await settle(token, tx.when("settled"), memoResults);
  return take(memoResults, token, "Memo was not found.");
}

const dropPresent = async (
  ids: readonly string[],
  collection: Collection<Entry, string> | Collection<Memo, string>,
  remove: (keys: readonly string[]) => Promise<void>,
): Promise<void> => {
  const present = ids.filter((id) => collection.has(id));
  if (present.length !== ids.length) {
    await remove(ids);
    if (present.length > 0) {
      await collection.utils.writeDelete([...present]);
    }
    return;
  }
  await collection.delete([...present]).when("settled");
};

export async function removeEntries(ids: readonly string[]): Promise<void> {
  if (ids.length === 0) {
    return;
  }
  const collection = ready(entryCollection);
  const present = ids.filter((id) => collection.has(id));
  if (present.length !== ids.length) {
    await removeEntriesFn({ data: [...ids] });
    if (present.length > 0) {
      await collection.utils.writeDelete(present);
    }
    const memoIds = [...ready(memoCollection).values()]
      .filter((memo) => ids.includes(memo.entryId))
      .map((memo) => memo.id);
    if (memoIds.length > 0) {
      await ready(memoCollection).utils.writeDelete(memoIds);
    }
    return;
  }
  await collection.delete(present).when("settled");
}

export async function removeMemos(ids: readonly string[]): Promise<void> {
  if (ids.length === 0) {
    return;
  }
  await dropPresent(ids, ready(memoCollection), (keys) => removeMemosFn({ data: [...keys] }));
}
