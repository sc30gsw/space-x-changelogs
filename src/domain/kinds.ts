export const entryKinds = ["Release", "X Post", "Bot Template", "Pull Request"] as const;

export type EntryKind = (typeof entryKinds)[number];

export const isEntryKind = (value: string): value is EntryKind =>
  entryKinds.some((kind) => kind === value);
