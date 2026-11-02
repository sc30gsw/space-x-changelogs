import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import * as ts from "typescript";

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

const globTargets = [
  "lib/db/schema.ts",
  "lib/db/write.ts",
  "api/changelog.ts",
  "stores/changelog.ts",
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

const specifierParts = (specifier: string): string[] => {
  const [pathOnly = specifier] = specifier.split("?");
  return pathOnly
    .replaceAll("\\", "/")
    .replace(/\.(?:[cm])?(?:tsx|ts|jsx|js)$/, "")
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

const sourceKind = (file: string): ts.ScriptKind | undefined => {
  if (file.endsWith(".tsx")) {
    return ts.ScriptKind.TSX;
  }
  if (file.endsWith(".mts") || file.endsWith(".cts") || file.endsWith(".ts")) {
    return ts.ScriptKind.TS;
  }
  return undefined;
};

const literalText = (node: ts.Expression): string | undefined => {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    return node.text;
  }
  if (ts.isParenthesizedExpression(node)) {
    return literalText(node.expression);
  }
  if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    const left = literalText(node.left);
    const right = literalText(node.right);
    if (left === undefined || right === undefined) {
      return undefined;
    }
    return left + right;
  }
  if (ts.isTemplateExpression(node)) {
    let value = node.head.text;
    for (const span of node.templateSpans) {
      const part = literalText(span.expression);
      if (part === undefined) {
        return undefined;
      }
      value += part + span.literal.text;
    }
    return value;
  }
  return undefined;
};

const globMatches = (pattern: string, candidate: string): boolean => {
  const normalized = pattern
    .replaceAll("\\", "/")
    .replace(/^@\//, "")
    .replace(/^\/src\//, "")
    .replace(/^src\//, "")
    .replace(/^\.\//, "");
  let expression = "^";
  let index = 0;
  while (index < normalized.length) {
    if (normalized.startsWith("**/", index)) {
      expression += "(?:.*/)?";
      index += 3;
      continue;
    }
    if (normalized.startsWith("**", index)) {
      expression += ".*";
      index += 2;
      continue;
    }
    const char = normalized[index] ?? "";
    if (char === "*") {
      expression += "[^/]*";
    } else if (char === "?") {
      expression += "[^/]";
    } else if (/[.+^${}()|[\]\\]/.test(char)) {
      expression += `\\${char}`;
    } else {
      expression += char;
    }
    index += 1;
  }
  return new RegExp(`${expression}$`).test(candidate);
};

const hasModifier = (node: ts.Node, kind: ts.SyntaxKind): boolean => {
  if (!ts.canHaveModifiers(node)) {
    return false;
  }
  return ts.getModifiers(node)?.some((modifier) => modifier.kind === kind) ?? false;
};

const hasExport = (node: ts.Node): boolean => hasModifier(node, ts.SyntaxKind.ExportKeyword);

const hasDefault = (node: ts.Node): boolean => hasModifier(node, ts.SyntaxKind.DefaultKeyword);

const collectBindingNames = (name: ts.BindingName, into: string[]): void => {
  if (ts.isIdentifier(name)) {
    into.push(name.text);
    return;
  }
  for (const element of name.elements) {
    if (ts.isBindingElement(element)) {
      collectBindingNames(element.name, into);
    }
  }
};

const declarationName = (name: ts.DeclarationName | undefined): string | undefined => {
  if (name === undefined) {
    return undefined;
  }
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) {
    return name.text;
  }
  return undefined;
};

type SourceScan = {
  specifiers: string[];
  importedCollections: string[];
  changelogNamespace: boolean;
  dynamic: boolean;
  exportStar: boolean;
  exported: string[];
};

const scanSource = (file: string, text: string): SourceScan => {
  const kind = sourceKind(file) ?? ts.ScriptKind.TS;
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, kind);
  const specifiers: string[] = [];
  const importedCollections: string[] = [];
  const exported: string[] = [];
  let changelogNamespace = false;
  let dynamic = false;
  let exportStar = false;

  const noteCollection = (name: string) => {
    if (collectionNames.has(name)) {
      importedCollections.push(name);
    }
  };

  const noteModule = (specifier: string, namespace: boolean) => {
    specifiers.push(specifier);
    if (namespace && tailMatches(specifier, changelogTail)) {
      changelogNamespace = true;
    }
  };

  const noteGlob = (pattern: string) => {
    if (!/[*?{]/.test(pattern)) {
      noteModule(pattern, tailMatches(pattern, changelogTail));
      return;
    }
    for (const target of globTargets) {
      if (globMatches(pattern, target)) {
        noteModule(target, tailMatches(target, changelogTail));
      }
    }
  };

  const noteGlobArgument = (node: ts.Expression) => {
    if (ts.isArrayLiteralExpression(node)) {
      for (const element of node.elements) {
        if (ts.isSpreadElement(element)) {
          dynamic = true;
          continue;
        }
        noteGlobArgument(element);
      }
      return;
    }
    const pattern = literalText(node);
    if (pattern === undefined) {
      dynamic = true;
      return;
    }
    noteGlob(pattern);
  };

  const noteImportSpecifier = (element: ts.ImportSpecifier) => {
    if (element.propertyName !== undefined) {
      noteCollection(element.propertyName.text);
    }
    noteCollection(element.name.text);
  };

  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node)) {
      const specifier =
        node.moduleSpecifier === undefined ? undefined : literalText(node.moduleSpecifier);
      if (specifier === undefined) {
        dynamic = true;
      } else {
        const bindings = node.importClause?.namedBindings;
        const namespace = bindings !== undefined && ts.isNamespaceImport(bindings);
        noteModule(specifier, namespace);
        if (bindings !== undefined && ts.isNamedImports(bindings)) {
          for (const element of bindings.elements) {
            noteImportSpecifier(element);
          }
        }
      }
      const local = node.importClause?.name;
      if (local !== undefined) {
        noteCollection(local.text);
      }
    } else if (ts.isImportEqualsDeclaration(node)) {
      const reference = node.moduleReference;
      if (ts.isExternalModuleReference(reference) && reference.expression !== undefined) {
        const specifier = literalText(reference.expression);
        if (specifier === undefined) {
          dynamic = true;
        } else {
          noteModule(specifier, false);
        }
      }
      noteCollection(node.name.text);
    } else if (ts.isExportDeclaration(node)) {
      const star = node.exportClause === undefined || ts.isNamespaceExport(node.exportClause);
      if (star) {
        exportStar = true;
      }
      if (node.moduleSpecifier === undefined) {
        if (node.exportClause !== undefined && ts.isNamedExports(node.exportClause)) {
          for (const element of node.exportClause.elements) {
            exported.push(element.name.text);
          }
        }
      } else {
        const specifier = literalText(node.moduleSpecifier);
        if (specifier === undefined) {
          dynamic = true;
        } else {
          noteModule(specifier, star);
        }
        if (node.exportClause !== undefined && ts.isNamedExports(node.exportClause)) {
          for (const element of node.exportClause.elements) {
            exported.push(element.name.text);
            noteCollection(element.name.text);
            if (element.propertyName !== undefined) {
              noteCollection(element.propertyName.text);
            }
          }
        }
      }
    } else if (ts.isExportAssignment(node)) {
      exported.push("default");
    } else if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      const argument = node.arguments[0];
      if (argument === undefined) {
        dynamic = true;
      } else {
        const specifier = literalText(argument);
        if (specifier === undefined) {
          dynamic = true;
        } else {
          noteModule(specifier, true);
        }
      }
    } else if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      const meta = node.expression.expression;
      const called = node.expression.name.text;
      if (
        (called === "glob" || called === "globEager") &&
        ts.isMetaProperty(meta) &&
        meta.keywordToken === ts.SyntaxKind.ImportKeyword &&
        meta.name.text === "meta"
      ) {
        const argument = node.arguments[0];
        if (argument === undefined) {
          dynamic = true;
        } else {
          noteGlobArgument(argument);
        }
      }
    } else if (
      hasExport(node) &&
      (ts.isFunctionDeclaration(node) ||
        ts.isClassDeclaration(node) ||
        ts.isInterfaceDeclaration(node) ||
        ts.isEnumDeclaration(node) ||
        ts.isTypeAliasDeclaration(node) ||
        ts.isModuleDeclaration(node))
    ) {
      const name = declarationName(node.name);
      if (name !== undefined) {
        exported.push(name);
      }
      if (hasDefault(node)) {
        exported.push("default");
      }
    } else if (hasExport(node) && ts.isVariableStatement(node)) {
      for (const declaration of node.declarationList.declarations) {
        collectBindingNames(declaration.name, exported);
      }
    }
    ts.forEachChild(node, visit);
  };

  visit(source);
  return {
    specifiers,
    importedCollections,
    changelogNamespace,
    dynamic,
    exportStar,
    exported,
  };
};

const occurrences = (line: string, needle: string): number => line.split(needle).length - 1;

const guardedFile = (file: string): boolean =>
  sourceKind(file) !== undefined && guardedTrees.some((tree) => file.startsWith(tree));

if (!existsSync(sourceRoot)) {
  console.error(`missing ${sourceRoot}`);
  process.exit(1);
}

const files = filesUnder(sourceRoot);
const failures: string[] = [];
const innerHtml: string[] = [];

for (const file of files) {
  const text = readFileSync(join(sourceRoot, file), "utf8");
  if (sourceKind(file) !== undefined) {
    const scan = scanSource(file, text);
    if (guardedFile(file)) {
      for (const specifier of scan.specifiers) {
        const label = moduleLabel(specifier);
        if (label !== undefined) {
          failures.push(`src/${file} imports ${label}`);
        }
      }
      if (scan.dynamic) {
        failures.push(`src/${file} imports a dynamic path`);
      }
    }
    if (!shellFiles.has(file)) {
      for (const name of scan.importedCollections) {
        failures.push(`src/${file} imports ${name}`);
      }
      if (scan.changelogNamespace) {
        failures.push(`src/${file} imports changelogCollections`);
      }
      if (scan.dynamic && !guardedFile(file)) {
        failures.push(`src/${file} imports a dynamic path`);
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
if (!existsSync(changelog)) {
  failures.push("missing src/stores/changelog.ts");
} else {
  const scan = scanSource("stores/changelog.ts", readFileSync(changelog, "utf8"));
  if (scan.exportStar) {
    failures.push("src/stores/changelog.ts exports *");
  }
  for (const name of scan.exported) {
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
