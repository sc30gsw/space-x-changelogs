export const entryKinds = ["Release", "X Post", "Bot Template", "Pull Request"] as const;

export type EntryKind = (typeof entryKinds)[number];

export type KindFilter = "all" | EntryKind;

const kindFilters = ["all", ...entryKinds] as const;

export const isEntryKind = (value: string): value is EntryKind =>
  entryKinds.some((kind) => kind === value);

export const isKindFilter = (value: string): value is KindFilter =>
  kindFilters.some((kind) => kind === value);

export const entryMatchesKind = (filter: KindFilter, kind: string): boolean => {
  switch (filter) {
    case "all":
      return true;
    case "Release":
    case "X Post":
    case "Bot Template":
    case "Pull Request":
      return kind === filter;
    default: {
      const unreachable: never = filter;
      return unreachable;
    }
  }
};
