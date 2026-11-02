import type {
  Memo,
  MemoChanges,
  Source,
  SourceChanges,
  Track,
  TrackChanges,
} from "../types/schemas";

const definedFields = <T extends Record<string, unknown>>(changes: T): Partial<T> => {
  const next: Partial<T> = {};
  for (const key of Object.keys(changes) as Array<keyof T>) {
    const value = changes[key];
    if (value !== undefined) {
      next[key] = value;
    }
  }
  return next;
};

export const pickTrackChanges = (changes: Partial<Track>): TrackChanges =>
  definedFields({
    name: changes.name,
    slug: changes.slug,
  });

export const pickSourceChanges = (changes: Partial<Source>): SourceChanges =>
  definedFields({
    label: changes.label,
    url: changes.url,
  });

export const pickMemoChanges = (changes: Partial<Memo>): MemoChanges =>
  definedFields({
    body: changes.body,
  });
