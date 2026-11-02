import { DbProvider } from "@tanstack/react-db";
import { useState, type ReactNode } from "react";
import { createChangelogClient } from "../stores/changelog";

export function DataProvider({ children }: { readonly children: ReactNode }) {
  const [client] = useState(() => createChangelogClient());
  return <DbProvider client={client}>{children}</DbProvider>;
}
