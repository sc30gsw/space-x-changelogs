import type {
  Entry,
  EntryChanges,
  Memo,
  MemoChanges,
  Source,
  SourceChanges,
  Track,
  TrackChanges,
} from "../types/schemas";

const entryChangeFields = [
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
] as const satisfies readonly (keyof EntryChanges)[];

export const pickEntryChanges = (changes: Partial<Entry>): EntryChanges => {
  const next: EntryChanges = {};
  for (const field of entryChangeFields) {
    switch (field) {
      case "trackId":
        if (changes.trackId !== undefined) {
          next.trackId = changes.trackId;
        }
        break;
      case "kind":
        if (changes.kind !== undefined) {
          next.kind = changes.kind;
        }
        break;
      case "title":
        if (changes.title !== undefined) {
          next.title = changes.title;
        }
        break;
      case "url":
        if (changes.url !== undefined) {
          next.url = changes.url;
        }
        break;
      case "publishedAt":
        if (changes.publishedAt !== undefined) {
          next.publishedAt = changes.publishedAt;
        }
        break;
      case "summary":
        if (changes.summary !== undefined) {
          next.summary = changes.summary;
        }
        break;
      case "body":
        if (changes.body !== undefined) {
          next.body = changes.body;
        }
        break;
      case "caughtUp":
        if (changes.caughtUp !== undefined) {
          next.caughtUp = changes.caughtUp;
        }
        break;
      case "createdAt":
        if (changes.createdAt !== undefined) {
          next.createdAt = changes.createdAt;
        }
        break;
      case "updatedAt":
        if (changes.updatedAt !== undefined) {
          next.updatedAt = changes.updatedAt;
        }
        break;
      default: {
        const unreachable: never = field;
        return unreachable;
      }
    }
  }
  return next;
};

export const pickTrackChanges = (changes: Partial<Track>): TrackChanges => {
  const next: TrackChanges = {};
  if (changes.name !== undefined) {
    next.name = changes.name;
  }
  if (changes.slug !== undefined) {
    next.slug = changes.slug;
  }
  return next;
};

export const pickSourceChanges = (changes: Partial<Source>): SourceChanges => {
  const next: SourceChanges = {};
  if (changes.label !== undefined) {
    next.label = changes.label;
  }
  if (changes.url !== undefined) {
    next.url = changes.url;
  }
  return next;
};

export const pickMemoChanges = (changes: Partial<Memo>): MemoChanges => {
  if (changes.body === undefined) {
    return {};
  }
  return { body: changes.body };
};
