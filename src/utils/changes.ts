import type { Entry, EntryChanges, Memo, Source, Track } from "../types/schemas";

const entryFields = [
  "trackId",
  "kind",
  "title",
  "url",
  "publishedAt",
  "summary",
  "body",
  "caughtUp",
  "createdAt",
  "updatedAt",
] as const;

export const pickEntryChanges = (changes: Partial<Entry>): EntryChanges => {
  const next: EntryChanges = {};
  for (const field of entryFields) {
    if (changes[field] !== undefined) {
      Object.assign(next, { [field]: changes[field] });
    }
  }
  return next;
};

export const pickTrackChanges = (
  changes: Partial<Track>,
): { readonly name?: string; readonly slug?: string } => {
  const next: { name?: string; slug?: string } = {};
  if (changes.name !== undefined) {
    next.name = changes.name;
  }
  if (changes.slug !== undefined) {
    next.slug = changes.slug;
  }
  return next;
};

export const pickSourceChanges = (
  changes: Partial<Source>,
): { readonly label?: string; readonly url?: string } => {
  const next: { label?: string; url?: string } = {};
  if (changes.label !== undefined) {
    next.label = changes.label;
  }
  if (changes.url !== undefined) {
    next.url = changes.url;
  }
  return next;
};

export const pickMemoChanges = (changes: Partial<Memo>): { readonly body?: string } => {
  if (changes.body === undefined) {
    return {};
  }

  return { body: changes.body };
};
