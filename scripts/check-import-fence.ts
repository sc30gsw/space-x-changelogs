import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const projectRoot = process.argv[2] ?? process.cwd();
const sourceRoot = join(projectRoot, "src");

const allowedExports = new Set([
  "ingestEntry",
  "catchUp",
  "saveTrack",
  "saveSource",
  "saveMemo",
  "removeEntries",
  "removeMemos",
  "DataProvider",
  "WorkspaceProvider",
  "useWorkspace",
  "changelogCollections",
  "createChangelogClient",
]);

const forbiddenModules = [
  { tail: ["lib", "db", "schema"], label: "src/lib/db/schema.ts" },
  { tail: ["lib", "db", "write"], label: "src/lib/db/write.ts" },
  { tail: ["api", "changelog"], label: "src/api/changelog.ts" },
] as const;

const filesUnder = (directory: string): string[] => {
  const found: string[] = [];
  for (const name of readdirSync(directory)) {
    const path = join(directory, name);
    if (statSync(path).isDirectory()) {
      found.push(...filesUnder(path));
      continue;
    }
    found.push(relative(sourceRoot, path).replaceAll("\\", "/"));
  }
  return found;
};

const moduleLabel = (specifier: string): string | undefined => {
  const [pathOnly = specifier] = specifier.split("?");
  const parts = pathOnly
    .replaceAll("\\", "/")
    .replace(/\.(?:tsx|ts|jsx|js)$/, "")
    .split("/")
    .filter((part) => part !== "" && part !== "." && part !== "..");
  for (const item of forbiddenModules) {
    if (parts.length < item.tail.length) {
      continue;
    }
    const start = parts.length - item.tail.length;
    const matched = item.tail.every((segment, index) => parts[start + index] === segment);
    if (matched) {
      return item.label;
    }
  }
  return undefined;
};

const specifiersIn = (source: string): string[] => {
  const found: string[] = [];
  const patterns = [
    /\b(?:import|export)\s+(?:type\s+)?[^"'`;]*?\bfrom\s*["']([^"']+)["']/g,
    /\bimport\s*["']([^"']+)["']/g,
    /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,
  ];
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      const specifier = match[1];
      if (specifier !== undefined) {
        found.push(specifier);
      }
    }
  }
  return found;
};

const exportedNames = (source: string): string[] => {
  const names = new Set<string>();
  const declarations =
    /\bexport\s+(?:declare\s+)?(?:async\s+)?(?:function|const|let|var|class|enum|interface|type)\s+([A-Za-z_$][\w$]*)/g;
  for (const match of source.matchAll(declarations)) {
    const name = match[1];
    if (name !== undefined) {
      names.add(name);
    }
  }
  const groups = /\bexport\s+(?:type\s+)?\{([^}]+)\}/g;
  for (const match of source.matchAll(groups)) {
    for (const piece of (match[1] ?? "").split(",")) {
      const trimmed = piece.trim().replace(/^type\s+/, "");
      if (trimmed.length === 0) {
        continue;
      }
      const parts = trimmed.split(/\s+as\s+/);
      const name = (parts[1] ?? parts[0] ?? "").trim();
      if (/^[A-Za-z_$][\w$]*$/.test(name)) {
        names.add(name);
      }
    }
  }
  if (/\bexport\s+default\b/.test(source)) {
    names.add("default");
  }
  return [...names];
};

const occurrences = (line: string, needle: string): number => line.split(needle).length - 1;

if (!existsSync(sourceRoot)) {
  console.error(`missing ${sourceRoot}`);
  process.exit(1);
}

const files = filesUnder(sourceRoot);
const failures: string[] = [];
const innerHtml: string[] = [];

for (const file of files) {
  const text = readFileSync(join(sourceRoot, file), "utf8");
  if (file.startsWith("features/") && /\.(?:ts|tsx)$/.test(file)) {
    for (const specifier of specifiersIn(text)) {
      const label = moduleLabel(specifier);
      if (label !== undefined) {
        failures.push(`src/${file} imports ${label}`);
      }
    }
  }
  for (const [index, line] of text.split("\n").entries()) {
    for (let hit = 0; hit < occurrences(line, "dangerouslySetInnerHTML"); hit += 1) {
      innerHtml.push(`src/${file}:${index + 1}`);
    }
    if (file.startsWith("lib/") && line.includes("throw new Error")) {
      failures.push(`src/${file}:${index + 1} throws new Error`);
    }
  }
}

if (innerHtml.length > 1) {
  for (const hit of innerHtml) {
    failures.push(`${hit} uses dangerouslySetInnerHTML`);
  }
}

const changelog = join(sourceRoot, "stores/changelog.ts");
if (existsSync(changelog)) {
  for (const name of exportedNames(readFileSync(changelog, "utf8"))) {
    if (!allowedExports.has(name)) {
      failures.push(`src/stores/changelog.ts exports ${name}`);
    }
  }
}

if (failures.length > 0) {
  for (const failure of new Set(failures)) {
    console.error(failure);
  }
  process.exit(1);
}

console.log(`import fence: ${files.length} files`);
