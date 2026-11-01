import { useLiveQuery, useDbClient, type Collection } from "@tanstack/react-db";
import { createContext, use, type ReactNode } from "react";
import { changelogCollections } from "./collections";
import type { Entry, Memo, Source, Track } from "./schemas";

type EntryCollection = Collection<Entry, string>;
type MemoCollection = Collection<Memo, string>;
type SourceCollection = Collection<Source, string>;
type TrackCollection = Collection<Track, string>;

type WorkspaceValue = {
  readonly tracks: readonly Track[];
  readonly sources: readonly Source[];
  readonly entries: readonly Entry[];
  readonly memos: readonly Memo[];
  readonly isLoading: boolean;
  readonly isError: boolean;
  readonly tracksCollection: TrackCollection;
  readonly sourcesCollection: SourceCollection;
  readonly entriesCollection: EntryCollection;
  readonly memosCollection: MemoCollection;
};

const WorkspaceContext = createContext<WorkspaceValue | null>(null);

const rows = <T extends { readonly id: string }>(
  data: ReadonlyArray<T> | undefined,
): readonly T[] => data ?? [];

export function WorkspaceProvider({ children }: { readonly children: ReactNode }) {
  const client = useDbClient();
  const trackQuery = useLiveQuery((q) => q.from({ track: changelogCollections.tracks }));
  const sourceQuery = useLiveQuery((q) => q.from({ source: changelogCollections.sources }));
  const entryQuery = useLiveQuery((q) => q.from({ entry: changelogCollections.entries }));
  const memoQuery = useLiveQuery((q) => q.from({ memo: changelogCollections.memos }));

  const value: WorkspaceValue = {
    tracks: rows(trackQuery.data),
    sources: rows(sourceQuery.data),
    entries: rows(entryQuery.data),
    memos: rows(memoQuery.data),
    isLoading:
      trackQuery.isLoading || sourceQuery.isLoading || entryQuery.isLoading || memoQuery.isLoading,
    isError:
      trackQuery.isLoadingError ||
      sourceQuery.isLoadingError ||
      entryQuery.isLoadingError ||
      memoQuery.isLoadingError,
    tracksCollection: client.collection(changelogCollections.tracks),
    sourcesCollection: client.collection(changelogCollections.sources),
    entriesCollection: client.collection(changelogCollections.entries),
    memosCollection: client.collection(changelogCollections.memos),
  };

  return <WorkspaceContext value={value}>{children}</WorkspaceContext>;
}

export const useWorkspace = (): WorkspaceValue => {
  const value = use(WorkspaceContext);
  if (value === null) {
    throw new Error("WorkspaceProvider is missing.");
  }

  return value;
};
