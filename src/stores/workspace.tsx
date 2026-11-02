import { useLiveQuery } from "@tanstack/react-db";
import { createContext, use, useMemo, type ReactNode } from "react";
import type { Entry, Memo, Source, Track } from "../types/schemas";
import { changelogCollections } from "./changelog";

type WorkspaceValue = {
  readonly tracks: readonly Track[];
  readonly sources: readonly Source[];
  readonly entries: readonly Entry[];
  readonly memos: readonly Memo[];
  readonly isLoading: boolean;
  readonly isError: boolean;
};

const WorkspaceContext = createContext<WorkspaceValue | null>(null);

const noRows: readonly [] = [];

const rows = <T extends { readonly id: string }>(
  data: ReadonlyArray<T> | undefined,
): readonly T[] => data ?? noRows;

export function WorkspaceProvider({ children }: { readonly children: ReactNode }) {
  const trackQuery = useLiveQuery((q) => q.from({ track: changelogCollections.tracks }));
  const sourceQuery = useLiveQuery((q) => q.from({ source: changelogCollections.sources }));
  const entryQuery = useLiveQuery((q) => q.from({ entry: changelogCollections.entries }));
  const memoQuery = useLiveQuery((q) => q.from({ memo: changelogCollections.memos }));

  const value = useMemo<WorkspaceValue>(
    () => ({
      tracks: rows(trackQuery.data),
      sources: rows(sourceQuery.data),
      entries: rows(entryQuery.data),
      memos: rows(memoQuery.data),
      isLoading:
        trackQuery.isLoading ||
        sourceQuery.isLoading ||
        entryQuery.isLoading ||
        memoQuery.isLoading,
      isError:
        trackQuery.isLoadingError ||
        sourceQuery.isLoadingError ||
        entryQuery.isLoadingError ||
        memoQuery.isLoadingError,
    }),
    [
      entryQuery.data,
      entryQuery.isLoading,
      entryQuery.isLoadingError,
      memoQuery.data,
      memoQuery.isLoading,
      memoQuery.isLoadingError,
      sourceQuery.data,
      sourceQuery.isLoading,
      sourceQuery.isLoadingError,
      trackQuery.data,
      trackQuery.isLoading,
      trackQuery.isLoadingError,
    ],
  );

  return <WorkspaceContext value={value}>{children}</WorkspaceContext>;
}

export const useWorkspace = (): WorkspaceValue => {
  const value = use(WorkspaceContext);
  if (value === null) {
    throw new Error("WorkspaceProvider is missing.");
  }

  return value;
};
