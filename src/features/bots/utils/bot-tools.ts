import { entryKinds, isEntryKind, type EntryKind } from "../../../utils/kinds";

export const writeDoors = [
  "ingestEntry",
  "catchUp",
  "saveTrack",
  "saveSource",
  "saveMemo",
  "removeEntries",
  "removeMemos",
] as const;

export type WriteDoor = (typeof writeDoors)[number];

type JsonSchema = {
  readonly type: "object";
  readonly properties: Readonly<Record<string, unknown>>;
  readonly required?: readonly string[];
  readonly additionalProperties?: false;
};

export type BotToolSpec = {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: JsonSchema;
  readonly readOnly: boolean;
  readonly door: WriteDoor | null;
};

const text = { type: "string" } as const;
const idText = { type: "string", minLength: 1 } as const;
const flag = { type: "boolean" } as const;
const kindText = { type: "string", enum: entryKinds } as const;
const instantText = {
  type: "string",
  description: "ISO-8601 instant such as 2026-11-03T00:00:00Z",
} as const;
const markText = {
  type: "object",
  properties: { id: text, caughtUp: flag },
  required: ["id", "caughtUp"],
  additionalProperties: false,
} as const;
const idListText = { type: "array", items: text } as const;

export const botToolSpecs: readonly BotToolSpec[] = [
  {
    name: "list_workspace",
    description: "Return the Tracks, Sources, Entries, and Memos already loaded in this page.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
    readOnly: true,
    door: null,
  },
  {
    name: "ingest_entry",
    description:
      "Create or update the one Entry for a URL, the same way the entry form keeps one Entry per URL, and store an omitted body as empty.",
    inputSchema: {
      type: "object",
      properties: {
        id: idText,
        trackId: text,
        kind: kindText,
        title: text,
        url: text,
        publishedAt: instantText,
        summary: text,
        body: text,
      },
      required: ["trackId", "kind", "title", "url", "publishedAt", "summary"],
      additionalProperties: false,
    },
    readOnly: false,
    door: "ingestEntry",
  },
  {
    name: "catch_up",
    description:
      "Set Caught up on existing Entries in one all-or-nothing write, the same way the track screen marks Caught up.",
    inputSchema: {
      type: "object",
      properties: {
        marks: { type: "array", items: markText },
      },
      required: ["marks"],
      additionalProperties: false,
    },
    readOnly: false,
    door: "catchUp",
  },
  {
    name: "save_track",
    description: "Create or update a Track, the same way the manage screen saves a name and slug.",
    inputSchema: {
      type: "object",
      properties: { id: idText, name: text, slug: text },
      required: ["name", "slug"],
      additionalProperties: false,
    },
    readOnly: false,
    door: "saveTrack",
  },
  {
    name: "save_source",
    description:
      "Create or update a Source on a Track, the same way the manage screen saves a label and URL.",
    inputSchema: {
      type: "object",
      properties: { id: idText, trackId: text, label: text, url: text },
      required: ["trackId", "label", "url"],
      additionalProperties: false,
    },
    readOnly: false,
    door: "saveSource",
  },
  {
    name: "save_memo",
    description: "Create or update a Memo on an Entry, the same way the memo editor saves a body.",
    inputSchema: {
      type: "object",
      properties: { id: idText, entryId: text, body: text },
      required: ["entryId", "body"],
      additionalProperties: false,
    },
    readOnly: false,
    door: "saveMemo",
  },
  {
    name: "remove_entries",
    description: "Delete Entries by id, the same way the entry screen deletes an Entry.",
    inputSchema: {
      type: "object",
      properties: { ids: idListText },
      required: ["ids"],
      additionalProperties: false,
    },
    readOnly: false,
    door: "removeEntries",
  },
  {
    name: "remove_memos",
    description: "Delete Memos by id, the same way the memo editor deletes a Memo.",
    inputSchema: {
      type: "object",
      properties: { ids: idListText },
      required: ["ids"],
      additionalProperties: false,
    },
    readOnly: false,
    door: "removeMemos",
  },
];

type Failure = { readonly error: string };

type IngestToolInput = {
  readonly id: string | undefined;
  readonly trackId: string;
  readonly kind: EntryKind;
  readonly title: string;
  readonly url: string;
  readonly publishedAt: string;
  readonly summary: string;
  readonly body: string;
};

type CatchUpToolInput = {
  readonly marks: readonly { readonly id: string; readonly caughtUp: boolean }[];
};

type SaveTrackToolInput = {
  readonly id: string | undefined;
  readonly name: string;
  readonly slug: string;
};

type SaveSourceToolInput = {
  readonly id: string | undefined;
  readonly trackId: string;
  readonly label: string;
  readonly url: string;
};

type SaveMemoToolInput = {
  readonly id: string | undefined;
  readonly entryId: string;
  readonly body: string;
};

type RemoveToolInput = { readonly ids: readonly string[] };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isString = (value: unknown): value is string => typeof value === "string";

const isBoolean = (value: unknown): value is boolean => typeof value === "boolean";

const isStringList = (value: unknown): value is readonly string[] =>
  Array.isArray(value) && value.every(isString);

const fail = (error: string): Failure => ({ error });

const readObject = (
  input: unknown,
  fields: readonly string[],
): { readonly record: Record<string, unknown> } | Failure => {
  if (!isRecord(input)) {
    return fail("Tool input must be an object.");
  }
  for (const key of Object.keys(input)) {
    if (!fields.includes(key)) {
      return fail(`${key} is not accepted.`);
    }
  }
  return { record: input };
};

const requiredString = (
  record: Record<string, unknown>,
  key: string,
): { readonly value: string } | Failure => {
  if (!Object.hasOwn(record, key)) {
    return fail(`${key} is required.`);
  }
  const value = record[key];
  if (!isString(value)) {
    return fail(`${key} must be a string.`);
  }
  return { value };
};

const optionalId = (
  record: Record<string, unknown>,
  key: string,
): { readonly value: string | undefined } | Failure => {
  if (!Object.hasOwn(record, key)) {
    return { value: undefined };
  }
  const value = record[key];
  if (!isString(value) || value.length < 1) {
    return fail(`${key} must be a non-empty string.`);
  }
  return { value };
};

const optionalBody = (record: Record<string, unknown>): { readonly value: string } | Failure => {
  if (!Object.hasOwn(record, "body")) {
    return { value: "" };
  }
  const value = record.body;
  if (!isString(value)) {
    return fail("body must be a string.");
  }
  return { value };
};

const requiredKind = (record: Record<string, unknown>): { readonly value: EntryKind } | Failure => {
  const read = requiredString(record, "kind");
  if ("error" in read) {
    return read;
  }
  if (!isEntryKind(read.value)) {
    return fail("kind must be Release, X Post, Bot Template, or Pull Request.");
  }
  return { value: read.value };
};

const requiredIds = (
  record: Record<string, unknown>,
): { readonly value: readonly string[] } | Failure => {
  if (!Object.hasOwn(record, "ids")) {
    return fail("ids is required.");
  }
  const value = record.ids;
  if (!isStringList(value)) {
    return fail("ids must be an array of strings.");
  }
  return { value };
};

const requiredMarks = (record: Record<string, unknown>): CatchUpToolInput | Failure => {
  if (!Object.hasOwn(record, "marks")) {
    return fail("marks is required.");
  }
  const value = record.marks;
  if (!Array.isArray(value)) {
    return fail("marks must be an array.");
  }
  const marks: { readonly id: string; readonly caughtUp: boolean }[] = [];
  for (const mark of value) {
    if (!isRecord(mark)) {
      return fail("Each mark must be an object.");
    }
    for (const key of Object.keys(mark)) {
      if (key !== "id" && key !== "caughtUp") {
        return fail(`${key} is not accepted on a mark.`);
      }
    }
    if (!Object.hasOwn(mark, "id")) {
      return fail("Each mark id is required.");
    }
    if (!isString(mark.id)) {
      return fail("Each mark id must be a string.");
    }
    if (!Object.hasOwn(mark, "caughtUp")) {
      return fail("Each mark caughtUp is required.");
    }
    if (!isBoolean(mark.caughtUp)) {
      return fail("Each mark caughtUp must be a boolean.");
    }
    marks.push({ id: mark.id, caughtUp: mark.caughtUp });
  }
  return { marks };
};

const parseIngestEntry = (input: unknown): IngestToolInput | Failure => {
  const fields = readObject(input, [
    "id",
    "trackId",
    "kind",
    "title",
    "url",
    "publishedAt",
    "summary",
    "body",
  ]);
  if ("error" in fields) {
    return fields;
  }
  const id = optionalId(fields.record, "id");
  if ("error" in id) {
    return id;
  }
  const trackId = requiredString(fields.record, "trackId");
  if ("error" in trackId) {
    return trackId;
  }
  const kind = requiredKind(fields.record);
  if ("error" in kind) {
    return kind;
  }
  const title = requiredString(fields.record, "title");
  if ("error" in title) {
    return title;
  }
  const url = requiredString(fields.record, "url");
  if ("error" in url) {
    return url;
  }
  const publishedAt = requiredString(fields.record, "publishedAt");
  if ("error" in publishedAt) {
    return publishedAt;
  }
  const summary = requiredString(fields.record, "summary");
  if ("error" in summary) {
    return summary;
  }
  const body = optionalBody(fields.record);
  if ("error" in body) {
    return body;
  }
  return {
    id: id.value,
    trackId: trackId.value,
    kind: kind.value,
    title: title.value,
    url: url.value,
    publishedAt: publishedAt.value,
    summary: summary.value,
    body: body.value,
  };
};

const parseCatchUp = (input: unknown): CatchUpToolInput | Failure => {
  const fields = readObject(input, ["marks"]);
  if ("error" in fields) {
    return fields;
  }
  return requiredMarks(fields.record);
};

const parseSaveTrack = (input: unknown): SaveTrackToolInput | Failure => {
  const fields = readObject(input, ["id", "name", "slug"]);
  if ("error" in fields) {
    return fields;
  }
  const id = optionalId(fields.record, "id");
  if ("error" in id) {
    return id;
  }
  const name = requiredString(fields.record, "name");
  if ("error" in name) {
    return name;
  }
  const slug = requiredString(fields.record, "slug");
  if ("error" in slug) {
    return slug;
  }
  return { id: id.value, name: name.value, slug: slug.value };
};

const parseSaveSource = (input: unknown): SaveSourceToolInput | Failure => {
  const fields = readObject(input, ["id", "trackId", "label", "url"]);
  if ("error" in fields) {
    return fields;
  }
  const id = optionalId(fields.record, "id");
  if ("error" in id) {
    return id;
  }
  const trackId = requiredString(fields.record, "trackId");
  if ("error" in trackId) {
    return trackId;
  }
  const label = requiredString(fields.record, "label");
  if ("error" in label) {
    return label;
  }
  const url = requiredString(fields.record, "url");
  if ("error" in url) {
    return url;
  }
  return { id: id.value, trackId: trackId.value, label: label.value, url: url.value };
};

const parseSaveMemo = (input: unknown): SaveMemoToolInput | Failure => {
  const fields = readObject(input, ["id", "entryId", "body"]);
  if ("error" in fields) {
    return fields;
  }
  const id = optionalId(fields.record, "id");
  if ("error" in id) {
    return id;
  }
  const entryId = requiredString(fields.record, "entryId");
  if ("error" in entryId) {
    return entryId;
  }
  const body = requiredString(fields.record, "body");
  if ("error" in body) {
    return body;
  }
  return { id: id.value, entryId: entryId.value, body: body.value };
};

const parseRemoveEntries = (input: unknown): RemoveToolInput | Failure => {
  const fields = readObject(input, ["ids"]);
  if ("error" in fields) {
    return fields;
  }
  const ids = requiredIds(fields.record);
  if ("error" in ids) {
    return ids;
  }
  return { ids: ids.value };
};

const parseRemoveMemos = (input: unknown): RemoveToolInput | Failure => {
  const fields = readObject(input, ["ids"]);
  if ("error" in fields) {
    return fields;
  }
  const ids = requiredIds(fields.record);
  if ("error" in ids) {
    return ids;
  }
  return { ids: ids.value };
};

export type WorkspaceSnapshot = {
  readonly tracks: readonly unknown[];
  readonly sources: readonly unknown[];
  readonly entries: readonly unknown[];
  readonly memos: readonly unknown[];
  readonly isLoading: boolean;
  readonly isError: boolean;
};

export type BotDoors = {
  readonly ingestEntry: (input: {
    readonly id?: string;
    readonly trackId: string;
    readonly kind: EntryKind;
    readonly title: string;
    readonly url: string;
    readonly publishedAt: string;
    readonly summary: string;
    readonly body: string;
  }) => Promise<unknown>;
  readonly catchUp: (marks: CatchUpToolInput["marks"]) => Promise<unknown>;
  readonly saveTrack: (input: {
    readonly id: string;
    readonly name: string;
    readonly slug: string;
  }) => Promise<unknown>;
  readonly saveSource: (input: {
    readonly id: string;
    readonly trackId: string;
    readonly label: string;
    readonly url: string;
  }) => Promise<unknown>;
  readonly saveMemo: (input: {
    readonly id: string;
    readonly entryId: string;
    readonly body: string;
  }) => Promise<unknown>;
  readonly removeEntries: (ids: readonly string[]) => Promise<unknown>;
  readonly removeMemos: (ids: readonly string[]) => Promise<unknown>;
};

const runWrite = async <T>(write: () => Promise<T>): Promise<T | Failure> => {
  try {
    return await write();
  } catch (error) {
    if (error instanceof Error) {
      return fail(error.message);
    }
    return fail("The changelog write failed.");
  }
};

const snapshotOf = (workspace: WorkspaceSnapshot) => ({
  tracks: workspace.tracks,
  sources: workspace.sources,
  entries: workspace.entries,
  memos: workspace.memos,
  isLoading: workspace.isLoading,
  isError: workspace.isError,
});

export const runBotTool = async (
  spec: BotToolSpec,
  input: unknown,
  doors: BotDoors,
  workspace: WorkspaceSnapshot,
  createId: () => string = () => crypto.randomUUID(),
): Promise<unknown> => {
  if (spec.door === null) {
    const parsed = readObject(input, []);
    if ("error" in parsed) {
      return parsed;
    }
    return snapshotOf(workspace);
  }

  switch (spec.door) {
    case "ingestEntry": {
      const parsed = parseIngestEntry(input);
      if ("error" in parsed) {
        return parsed;
      }
      const row = {
        ...(parsed.id === undefined ? {} : { id: parsed.id }),
        trackId: parsed.trackId,
        kind: parsed.kind,
        title: parsed.title,
        url: parsed.url,
        publishedAt: parsed.publishedAt,
        summary: parsed.summary,
        body: parsed.body,
      };
      return runWrite(() => doors.ingestEntry(row));
    }
    case "catchUp": {
      const parsed = parseCatchUp(input);
      if ("error" in parsed) {
        return parsed;
      }
      return runWrite(() => doors.catchUp(parsed.marks));
    }
    case "saveTrack": {
      const parsed = parseSaveTrack(input);
      if ("error" in parsed) {
        return parsed;
      }
      return runWrite(() =>
        doors.saveTrack({
          id: parsed.id ?? createId(),
          name: parsed.name,
          slug: parsed.slug,
        }),
      );
    }
    case "saveSource": {
      const parsed = parseSaveSource(input);
      if ("error" in parsed) {
        return parsed;
      }
      return runWrite(() =>
        doors.saveSource({
          id: parsed.id ?? createId(),
          trackId: parsed.trackId,
          label: parsed.label,
          url: parsed.url,
        }),
      );
    }
    case "saveMemo": {
      const parsed = parseSaveMemo(input);
      if ("error" in parsed) {
        return parsed;
      }
      return runWrite(() =>
        doors.saveMemo({
          id: parsed.id ?? createId(),
          entryId: parsed.entryId,
          body: parsed.body,
        }),
      );
    }
    case "removeEntries": {
      const parsed = parseRemoveEntries(input);
      if ("error" in parsed) {
        return parsed;
      }
      return runWrite(() => doors.removeEntries(parsed.ids));
    }
    case "removeMemos": {
      const parsed = parseRemoveMemos(input);
      if ("error" in parsed) {
        return parsed;
      }
      return runWrite(() => doors.removeMemos(parsed.ids));
    }
    default: {
      const unreachable: never = spec.door;
      return fail(`Unknown write door. Expected ${writeDoors.join(", ")}. ${String(unreachable)}`);
    }
  }
};
