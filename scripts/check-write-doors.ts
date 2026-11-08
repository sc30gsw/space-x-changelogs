import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const bannedNames = ["pickTrackChanges", "setCaughtUpFn", "entrySchema", "submitEntryFn"] as const;

const allowedClientFile = "lib/db/database.ts";
const parallelKey = /^\s*["']?parallel["']?\s*:/u;

export type WriteDoorReport = {
  readonly failures: readonly string[];
  readonly files: number;
};

const filesUnder = (directory: string, root: string): string[] => {
  const found: string[] = [];
  for (const name of readdirSync(directory)) {
    const path = join(directory, name);
    if (statSync(path).isDirectory()) {
      found.push(...filesUnder(path, root));
      continue;
    }
    found.push(relative(root, path).replaceAll("\\", "/"));
  }
  return found;
};

const lineHits = (text: string, needle: string): number[] => {
  const lines: number[] = [];
  for (const [index, line] of text.split("\n").entries()) {
    if (line.includes(needle)) {
      lines.push(index + 1);
    }
  }
  return lines;
};

const dependsOnZod = (value: unknown): boolean =>
  typeof value === "object" && value !== null && "zod" in value;

const own = (value: object, key: string): unknown => {
  if (!Object.hasOwn(value, key)) {
    return undefined;
  }
  return Object.getOwnPropertyDescriptor(value, key)?.value;
};

const storeWriteNames = [
  "catchUp",
  "ingestEntry",
  "removeEntries",
  "removeMemos",
  "saveMemo",
  "saveSource",
  "saveTrack",
] as const;

const bindingsOf = (body: string): string[] =>
  body
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .toSorted();

const registrarFailures = (projectRoot: string): string[] => {
  const path = join(projectRoot, "src/features/bots/components/bot-tools.tsx");
  if (!existsSync(path)) {
    return ["missing src/features/bots/components/bot-tools.tsx"];
  }
  const text = readFileSync(path, "utf8");
  const imported = text.match(
    /import\s*\{([^}]+)\}\s*from\s*"\.\.\/\.\.\/\.\.\/stores\/changelog"/u,
  );
  const names = imported?.[1] === undefined ? undefined : bindingsOf(imported[1]);
  const expected = [...storeWriteNames].toSorted();
  if (names === undefined || names.join() !== expected.join()) {
    return ["src/features/bots/components/bot-tools.tsx does not import the seven store writes"];
  }
  const doors = text.match(/const doors = \{([\s\S]*?)\};/u);
  const bound = doors?.[1] === undefined ? undefined : bindingsOf(doors[1]);
  if (bound === undefined || bound.join() !== expected.join()) {
    return ["src/features/bots/components/bot-tools.tsx does not pass the seven store writes"];
  }
  const optionsAt = text.indexOf('import "../utils/web-model-context"');
  const globalAt = text.indexOf('import "@mcp-b/global"');
  if (optionsAt === -1 || globalAt === -1 || optionsAt > globalAt) {
    return ["src/features/bots/components/bot-tools.tsx loads @mcp-b/global before its options"];
  }
  return [];
};

const packageFailures = (projectRoot: string): string[] => {
  const path = join(projectRoot, "package.json");
  if (!existsSync(path)) {
    return ["missing package.json"];
  }
  const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
  if (typeof parsed !== "object" || parsed === null) {
    return ["package.json is not an object"];
  }
  const sections = ["dependencies", "devDependencies", "optionalDependencies", "peerDependencies"];
  if (sections.some((section) => dependsOnZod(own(parsed, section)))) {
    return ["package.json depends on zod"];
  }
  return [];
};

const workflowFailures = (projectRoot: string): string[] => {
  const directory = join(projectRoot, ".github/workflows");
  if (!existsSync(directory)) {
    return ["missing .github/workflows"];
  }
  const failures: string[] = [];
  for (const name of readdirSync(directory)) {
    if (!name.endsWith(".yml") && !name.endsWith(".yaml")) {
      continue;
    }
    const text = readFileSync(join(directory, name), "utf8");
    for (const [index, line] of text.split("\n").entries()) {
      const code = line.replace(/#.*$/u, "");
      if (parallelKey.test(code)) {
        failures.push(`.github/workflows/${name}:${index + 1} uses parallel:`);
      }
    }
  }
  return failures;
};

export const scanWriteDoors = (projectRoot: string): WriteDoorReport => {
  const sourceRoot = join(projectRoot, "src");
  if (!existsSync(sourceRoot)) {
    return { failures: [`missing ${sourceRoot}`], files: 0 };
  }
  const files = filesUnder(sourceRoot, sourceRoot);
  const failures: string[] = [];
  for (const file of files) {
    const text = readFileSync(join(sourceRoot, file), "utf8");
    for (const name of bannedNames) {
      for (const line of lineHits(text, name)) {
        failures.push(`src/${file}:${line} contains ${name}`);
      }
    }
    if (file !== allowedClientFile) {
      for (const line of lineHits(text, "createClient")) {
        failures.push(`src/${file}:${line} contains createClient`);
      }
    }
  }
  failures.push(
    ...registrarFailures(projectRoot),
    ...packageFailures(projectRoot),
    ...workflowFailures(projectRoot),
  );
  return { failures, files: files.length };
};

const entry = process.argv[1];
if (entry !== undefined && entry.endsWith("check-write-doors.ts")) {
  const projectRoot = process.argv[2] ?? process.cwd();
  const report = scanWriteDoors(projectRoot);
  if (report.failures.length > 0) {
    for (const failure of report.failures) {
      console.error(failure);
    }
    process.exit(1);
  }
  console.log(`write doors: ${report.files} files`);
}
