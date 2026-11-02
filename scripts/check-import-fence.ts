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
  "changelogCollections",
  "createChangelogClient",
]);

const collectionNames = new Set(["changelogCollections", "createChangelogClient"]);

const shellFiles = new Set(["app/provider.tsx", "stores/workspace.tsx"]);

const guardedTrees = ["features/", "app/", "components/"];

const forbiddenModules = [
  { tail: ["lib", "db", "schema"], label: "src/lib/db/schema.ts" },
  { tail: ["lib", "db", "write"], label: "src/lib/db/write.ts" },
  { tail: ["api", "changelog"], label: "src/api/changelog.ts" },
] as const;

const changelogTail = ["stores", "changelog"];

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

const specifierParts = (specifier: string): string[] => {
  const [pathOnly = specifier] = specifier.split("?");
  return pathOnly
    .replaceAll("\\", "/")
    .replace(/\.(?:tsx|ts|jsx|js)$/, "")
    .split("/")
    .filter((part) => part !== "" && part !== "." && part !== "..");
};

const tailMatches = (specifier: string, tail: readonly string[]): boolean => {
  const parts = specifierParts(specifier);
  if (parts.length < tail.length) {
    return false;
  }
  const start = parts.length - tail.length;
  return tail.every((segment, index) => parts[start + index] === segment);
};

const moduleLabel = (specifier: string): string | undefined => {
  for (const item of forbiddenModules) {
    if (tailMatches(specifier, item.tail)) {
      return item.label;
    }
  }
  return undefined;
};

const withoutComments = (source: string): string => {
  let out = "";
  let index = 0;
  let quote: string | null = null;
  while (index < source.length) {
    const char = source[index] ?? "";
    const next = source[index + 1] ?? "";
    if (quote !== null) {
      out += char;
      if (char === "\\" && quote !== "`") {
        out += next;
        index += 2;
        continue;
      }
      if (char === quote) {
        quote = null;
      }
      index += 1;
      continue;
    }
    if (char === "'" || char === '"' || char === "`") {
      quote = char;
      out += char;
      index += 1;
      continue;
    }
    if (char === "/" && next === "/") {
      index += 2;
      while (index < source.length && source[index] !== "\n") {
        index += 1;
      }
      out += " ";
      continue;
    }
    if (char === "/" && next === "*") {
      index += 2;
      while (index < source.length && !(source[index] === "*" && source[index + 1] === "/")) {
        index += 1;
      }
      index += 2;
      out += " ";
      continue;
    }
    out += char;
    index += 1;
  }
  return out;
};

const quote = "[`\"']";

const specifiersIn = (source: string): string[] => {
  const found: string[] = [];
  const patterns = [
    new RegExp(
      `\\b(?:import|export)\\s*(?:type\\s*)?[^"'\`;]*?\\bfrom\\s*${quote}([^"'\`]+)${quote}`,
      "g",
    ),
    new RegExp(`\\bimport\\s*${quote}([^"'\`]+)${quote}`, "g"),
    new RegExp(`\\bimport\\s*\\(\\s*${quote}([^"'\`]+)${quote}`, "g"),
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

const importedCollectionNames = (source: string): string[] => {
  const names: string[] = [];
  const groups = new RegExp(
    `\\b(?:import|export)\\s*(?:type\\s*)?\\{([^}]+)\\}\\s*from\\s*${quote}`,
    "g",
  );
  for (const match of source.matchAll(groups)) {
    for (const piece of (match[1] ?? "").split(",")) {
      const trimmed = piece.trim().replace(/^type\s+/, "");
      if (trimmed.length === 0) {
        continue;
      }
      const parts = trimmed.split(/\s+as\s+/);
      for (const name of parts) {
        const cleaned = name.trim();
        if (collectionNames.has(cleaned)) {
          names.push(cleaned);
        }
      }
    }
  }
  return names;
};

const importsChangelogModule = (source: string): boolean => {
  const patterns = [
    new RegExp(
      `\\bimport\\s*\\*\\s*as\\s+[A-Za-z_$][\\w$]*\\s*from\\s*${quote}([^"'\`]+)${quote}`,
      "g",
    ),
    new RegExp(`\\bexport\\s*\\*\\s*from\\s*${quote}([^"'\`]+)${quote}`, "g"),
    new RegExp(
      `\\bexport\\s*\\*\\s*as\\s+[A-Za-z_$][\\w$]*\\s*from\\s*${quote}([^"'\`]+)${quote}`,
      "g",
    ),
    new RegExp(`\\bimport\\s*\\(\\s*${quote}([^"'\`]+)${quote}`, "g"),
  ];
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      const specifier = match[1];
      if (specifier !== undefined && tailMatches(specifier, changelogTail)) {
        return true;
      }
    }
  }
  return false;
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
      if (trimmed.length === 0 || trimmed.includes("from ")) {
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

const guardedFile = (file: string): boolean =>
  /\.(?:ts|tsx)$/.test(file) && guardedTrees.some((tree) => file.startsWith(tree));

if (!existsSync(sourceRoot)) {
  console.error(`missing ${sourceRoot}`);
  process.exit(1);
}

const files = filesUnder(sourceRoot);
const failures: string[] = [];
const innerHtml: string[] = [];

for (const file of files) {
  const text = readFileSync(join(sourceRoot, file), "utf8");
  const scanned = withoutComments(text);
  if (guardedFile(file)) {
    for (const specifier of specifiersIn(scanned)) {
      const label = moduleLabel(specifier);
      if (label !== undefined) {
        failures.push(`src/${file} imports ${label}`);
      }
    }
  }
  if (/\.(?:ts|tsx)$/.test(file) && !shellFiles.has(file)) {
    for (const name of importedCollectionNames(scanned)) {
      failures.push(`src/${file} imports ${name}`);
    }
    if (importsChangelogModule(scanned)) {
      failures.push(`src/${file} imports changelogCollections`);
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
if (!existsSync(changelog)) {
  failures.push("missing src/stores/changelog.ts");
} else {
  const source = withoutComments(readFileSync(changelog, "utf8"));
  if (/\bexport\s*\*/.test(source)) {
    failures.push("src/stores/changelog.ts exports *");
  }
  for (const name of exportedNames(source)) {
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
