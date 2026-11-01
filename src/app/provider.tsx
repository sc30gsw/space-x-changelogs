import { DbClient, DbProvider } from "@tanstack/react-db";
import { QueryClient } from "@tanstack/query-core";
import { useState, type ReactNode } from "react";
import { changelogCollections } from "../stores/collections";

export function DataProvider({ children }: { readonly children: ReactNode }) {
  const [client] = useState(
    () =>
      new DbClient({
        queryClient: new QueryClient(),
        // Descriptors only. A live query materializes them later, which is when Turso is contacted.
        changelogCollections,
      }),
  );
  return <DbProvider client={client}>{children}</DbProvider>;
}
