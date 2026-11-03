import { readdirSync, readFileSync } from "node:fs";
import {
  botToolSpecs,
  runBotTool,
  writeDoors,
  type BotDoors,
  type BotToolSpec,
  type WorkspaceSnapshot,
  type WriteDoor,
} from "../src/features/bots/utils/bot-tools.ts";

const fail = (message: string): never => {
  console.error(message);
  process.exit(1);
};

const workspace: WorkspaceSnapshot = {
  tracks: [{ id: "track-cursor" }],
  sources: [{ id: "source-cursor" }],
  entries: [{ id: "entry-a" }],
  memos: [{ id: "memo-a" }],
  isLoading: false,
  isError: false,
};

type Call = { readonly door: WriteDoor; readonly args: unknown };

const openDoors = (): { readonly calls: Call[]; readonly doors: BotDoors } => {
  const calls: Call[] = [];
  const doors: BotDoors = {
    ingestEntry: async (input) => {
      calls.push({ door: "ingestEntry", args: input });
      return input;
    },
    catchUp: async (marks) => {
      calls.push({ door: "catchUp", args: marks });
      return marks;
    },
    saveTrack: async (input) => {
      calls.push({ door: "saveTrack", args: input });
      return input;
    },
    saveSource: async (input) => {
      calls.push({ door: "saveSource", args: input });
      return input;
    },
    saveMemo: async (input) => {
      calls.push({ door: "saveMemo", args: input });
      return input;
    },
    removeEntries: async (ids) => {
      calls.push({ door: "removeEntries", args: ids });
      return ids;
    },
    removeMemos: async (ids) => {
      calls.push({ door: "removeMemos", args: ids });
      return ids;
    },
  };
  return { calls, doors };
};

const specNamed = (name: string): BotToolSpec => {
  const spec = botToolSpecs.find((item) => item.name === name);
  if (spec === undefined) {
    return fail(`missing tool ${name}`);
  }
  return spec;
};

const isErrorResult = (value: unknown): value is { readonly error: string } =>
  typeof value === "object" &&
  value !== null &&
  "error" in value &&
  typeof value.error === "string" &&
  value.error.length > 0;

const assertQuiet = async (spec: BotToolSpec, input: unknown, label: string): Promise<void> => {
  const { calls, doors } = openDoors();
  const result = await runBotTool(spec, input, doors, workspace, () => "generated-id");
  if (!isErrorResult(result) || calls.length !== 0) {
    fail(`${spec.name} ${label} wrote or hid the error`);
  }
};

const assertOneDoor = async (
  spec: BotToolSpec,
  input: unknown,
  door: WriteDoor,
  label: string,
): Promise<Call> => {
  const { calls, doors } = openDoors();
  const result = await runBotTool(spec, input, doors, workspace, () => "generated-id");
  if (isErrorResult(result) || calls.length !== 1 || calls[0]?.door !== door) {
    fail(`${spec.name} ${label} did not call ${door} once`);
  }
  return calls[0];
};

const validInput: Record<string, unknown> = {
  ingest_entry: {
    trackId: "track-cursor",
    kind: "Release",
    title: "Starship",
    url: "https://example.test/a",
    publishedAt: "2026-11-03T00:00:00Z",
    summary: "A flight",
  },
  catch_up: {
    marks: [
      { id: "entry-a", caughtUp: true },
      { id: "entry-b", caughtUp: false },
    ],
  },
  save_track: { name: "Cursor", slug: "cursor" },
  save_source: { trackId: "track-cursor", label: "Changelog", url: "https://example.test/source" },
  save_memo: { entryId: "entry-a", body: "<p>note</p>" },
  remove_entries: { ids: ["entry-a", "entry-b"] },
  remove_memos: { ids: ["memo-a"] },
};

const missingField: Record<string, string> = {
  ingest_entry: "trackId",
  catch_up: "marks",
  save_track: "name",
  save_source: "trackId",
  save_memo: "body",
  remove_entries: "ids",
  remove_memos: "ids",
};

const names = botToolSpecs.map((spec) => spec.name);
if (new Set(names).size !== names.length) {
  fail("tool names are not unique");
}

const isWriteSpec = (spec: BotToolSpec): spec is BotToolSpec & { readonly door: WriteDoor } =>
  spec.door !== null;

const writeSpecs = botToolSpecs.filter(isWriteSpec);
const readSpecs = botToolSpecs.filter((spec) => spec.door === null);
if (
  readSpecs.length !== 1 ||
  readSpecs[0]?.name !== "list_workspace" ||
  readSpecs[0].readOnly !== true
) {
  fail("list_workspace is not the only read tool");
}

if (writeSpecs.length !== writeDoors.length) {
  fail("write tools and write doors differ in count");
}

for (const door of writeDoors) {
  const matched = writeSpecs.filter((spec) => spec.door === door);
  if (matched.length !== 1 || matched[0]?.readOnly !== false) {
    fail(`${door} is not exactly one writable tool`);
  }
}

const rejected: readonly unknown[] = [null, [], "no", { extra: true }];

for (const spec of botToolSpecs) {
  for (const input of rejected) {
    await assertQuiet(spec, input, `rejected ${JSON.stringify(input)}`);
  }
}

for (const spec of writeSpecs) {
  const field = missingField[spec.name];
  if (field === undefined) {
    fail(`missing invalid case for ${spec.name}`);
  }
  const input = { ...(validInput[spec.name] as Record<string, unknown>) };
  delete input[field];
  await assertQuiet(spec, input, `missing ${field}`);
  if (spec.door === null) {
    fail(`${spec.name} lost its door`);
  }
  await assertOneDoor(spec, validInput[spec.name], spec.door, "valid input");
}

const listedDoors = openDoors();
const listed = await runBotTool(specNamed("list_workspace"), {}, listedDoors.doors, workspace);
if (JSON.stringify(listed) !== JSON.stringify(workspace) || listedDoors.calls.length !== 0) {
  fail("list_workspace did not return the loaded rows");
}

const caught = await assertOneDoor(
  specNamed("catch_up"),
  validInput.catch_up,
  "catchUp",
  "two marks",
);
if (!Array.isArray(caught.args) || caught.args.length !== 2) {
  fail("catch_up split the mark list");
}

const recordId = (args: unknown): string | undefined => {
  if (typeof args !== "object" || args === null || !("id" in args)) {
    return undefined;
  }
  return typeof args.id === "string" ? args.id : undefined;
};

const created = await assertOneDoor(
  specNamed("save_track"),
  validInput.save_track,
  "saveTrack",
  "new id",
);
if (recordId(created.args) !== "generated-id") {
  fail("save_track did not use the one generated id");
}

const kept = await assertOneDoor(
  specNamed("save_track"),
  { id: "track-cursor", name: "Cursor", slug: "cursor" },
  "saveTrack",
  "existing id",
);
if (recordId(kept.args) !== "track-cursor") {
  fail("save_track replaced an id the bot sent");
}

const freshEntry = await assertOneDoor(
  specNamed("ingest_entry"),
  validInput.ingest_entry,
  "ingestEntry",
  "omitted id",
);
if (recordId(freshEntry.args) !== undefined) {
  fail("ingest_entry invented an id");
}

const blownCalls: Call[] = [];
const blownDoors: BotDoors = {
  ...openDoors().doors,
  ingestEntry: async () => {
    blownCalls.push({ door: "ingestEntry", args: null });
    throw new Error("UNIQUE constraint failed");
  },
};
const blown = await runBotTool(
  specNamed("ingest_entry"),
  validInput.ingest_entry,
  blownDoors,
  workspace,
);
if (
  !isErrorResult(blown) ||
  blown.error !== "UNIQUE constraint failed" ||
  blownCalls.length !== 1
) {
  fail("a rejected write called the door more than once or hid the message");
}

const registrar = readFileSync(
  new URL("../src/features/bots/components/bot-tools.tsx", import.meta.url),
  "utf8",
);
if (registrar.split("runBotTool(").length - 1 !== 1) {
  fail("the page registrar does not call runBotTool once");
}
for (const door of writeDoors) {
  if (registrar.split(`${door}(`).length - 1 !== 0) {
    fail(`the page registrar calls ${door} itself`);
  }
}

const routes = readdirSync(new URL("../src/app/routes", import.meta.url)).toSorted();
const expectedRoutes = ["__root.tsx", "entries", "index.tsx", "manage.tsx", "tracks"];
if (routes.join() !== expectedRoutes.join()) {
  fail(`routes changed: ${routes.join(", ")}`);
}

const start = readFileSync(new URL("../src/app/start.ts", import.meta.url), "utf8");
if (start.includes("mcp") || start.includes("modelContext")) {
  fail("start.ts handles Web MCP");
}

console.log(
  `web mcp: ${botToolSpecs.length} tools, ${rejected.length} rejected inputs each, one door per write, held`,
);
