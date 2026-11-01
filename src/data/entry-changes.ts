import type { Entry, EntryChanges } from "./schemas";

const entryFields = ["projectId", "title", "body", "createdAt"] as const;

export const pickEntryChanges = (changes: Partial<Entry>): EntryChanges => {
  const next: EntryChanges = {};
  for (const field of entryFields) {
    const value = changes[field];
    if (value !== undefined) {
      next[field] = value;
    }
  }
  return next;
};
