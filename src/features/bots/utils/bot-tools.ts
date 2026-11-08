import * as v from "valibot";
import {
  catchUpSchema,
  ingestEntrySchema,
  memoSaveSchema,
  removeIdsSchema,
  sourceSaveSchema,
  trackSaveSchema,
} from "../../../types/writes";
import { entryKinds } from "../../../utils/kinds";

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

const listWorkspaceSchema = v.pipe(
  v.custom<Record<string, unknown>>(
    (input) => typeof input === "object" && input !== null && !Array.isArray(input),
  ),
  v.strictObject({}),
);
const marksInputSchema = v.pipe(
  v.object({ marks: catchUpSchema }),
  v.transform((row) => row.marks),
);
const idsInputSchema = v.pipe(
  v.object({ ids: removeIdsSchema }),
  v.transform((row) => row.ids),
);

const issueMessage = (issues: readonly { readonly message: string }[]): string =>
  issues[0]?.message ?? "Tool input is invalid.";

export type WorkspaceSnapshot = {
  readonly tracks: readonly unknown[];
  readonly sources: readonly unknown[];
  readonly entries: readonly unknown[];
  readonly memos: readonly unknown[];
  readonly isLoading: boolean;
  readonly isError: boolean;
};

export type BotDoors = {
  readonly ingestEntry: (input: v.InferOutput<typeof ingestEntrySchema>) => Promise<unknown>;
  readonly catchUp: (marks: v.InferOutput<typeof catchUpSchema>) => Promise<unknown>;
  readonly saveTrack: (input: v.InferOutput<typeof trackSaveSchema>) => Promise<unknown>;
  readonly saveSource: (input: v.InferOutput<typeof sourceSaveSchema>) => Promise<unknown>;
  readonly saveMemo: (input: v.InferOutput<typeof memoSaveSchema>) => Promise<unknown>;
  readonly removeEntries: (ids: v.InferOutput<typeof removeIdsSchema>) => Promise<unknown>;
  readonly removeMemos: (ids: v.InferOutput<typeof removeIdsSchema>) => Promise<unknown>;
};

const fail = (error: string): Failure => ({ error });

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

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const withId = (input: unknown, createId: () => string): unknown => {
  if (!isRecord(input) || Object.hasOwn(input, "id")) {
    return input;
  }
  return { ...input, id: createId() };
};

type BoundWrite = {
  readonly run: (input: unknown, doors: BotDoors, createId: () => string) => Promise<unknown>;
};

const bind = <T>(
  schema: v.BaseSchema<unknown, T, v.BaseIssue<unknown>>,
  call: (doors: BotDoors, value: T) => Promise<unknown>,
  fillId = false,
): BoundWrite => ({
  run: async (input, doors, createId) => {
    const parsed = v.safeParse(schema, fillId ? withId(input, createId) : input);
    if (!parsed.success) {
      return fail(issueMessage(parsed.issues));
    }
    return runWrite(() => call(doors, parsed.output));
  },
});

const writes: Record<WriteDoor, BoundWrite> = {
  ingestEntry: bind(ingestEntrySchema, (doors, value) => doors.ingestEntry(value)),
  catchUp: bind(marksInputSchema, (doors, marks) => doors.catchUp(marks)),
  saveTrack: bind(trackSaveSchema, (doors, value) => doors.saveTrack(value), true),
  saveSource: bind(sourceSaveSchema, (doors, value) => doors.saveSource(value), true),
  saveMemo: bind(memoSaveSchema, (doors, value) => doors.saveMemo(value), true),
  removeEntries: bind(idsInputSchema, (doors, ids) => doors.removeEntries(ids)),
  removeMemos: bind(idsInputSchema, (doors, ids) => doors.removeMemos(ids)),
};

export const runBotTool = async (
  spec: BotToolSpec,
  input: unknown,
  doors: BotDoors,
  workspace: WorkspaceSnapshot,
  createId: () => string = () => crypto.randomUUID(),
): Promise<unknown> => {
  if (spec.door === null) {
    const parsed = v.safeParse(listWorkspaceSchema, input);
    if (!parsed.success) {
      return fail(issueMessage(parsed.issues));
    }
    return snapshotOf(workspace);
  }

  const write = writes[spec.door];
  return write.run(input, doors, createId);
};
