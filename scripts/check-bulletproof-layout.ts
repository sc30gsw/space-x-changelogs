import { readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const sourceRoot = join(process.cwd(), "src");

const appFiles = new Set([
  "app/router.tsx",
  "app/provider.tsx",
  "app/start.ts",
  "app/routeTree.gen.ts",
]);

const featureBucket = String.raw`features\/[^/]+\/(?:api|assets|components|hooks|stores|types|utils)\/.+\.(?:ts|tsx)$`;

const allowed =
  (pattern: RegExp) =>
  (file: string): boolean =>
    pattern.test(file);

const rules: readonly { readonly area: string; readonly holds: (file: string) => boolean }[] = [
  { area: "src/app/routes", holds: allowed(/^app\/routes\/.+\.tsx$/) },
  { area: "src/app", holds: (file) => appFiles.has(file) },
  { area: "src/api", holds: allowed(/^api\/.+\.ts$/) },
  { area: "src/components", holds: allowed(/^components\/.+\.tsx$/) },
  { area: "src/config", holds: allowed(/^config\/.+\.ts$/) },
  {
    area: "src/features/<feature>/{api,assets,components,hooks,stores,types,utils}",
    holds: allowed(new RegExp(`^${featureBucket}`)),
  },
  { area: "src/hooks", holds: allowed(/^hooks\/.+\.(?:ts|tsx)$/) },
  { area: "src/lib", holds: allowed(/^lib\/.+\.ts$/) },
  { area: "src/stores", holds: allowed(/^stores\/.+\.(?:ts|tsx)$/) },
  { area: "src/styles", holds: allowed(/^styles\/.+$/) },
  { area: "src/testing", holds: allowed(/^testing\/.+$/) },
  { area: "src/types", holds: allowed(/^types\/.+\.ts$/) },
  { area: "src/utils", holds: allowed(/^utils\/.+\.ts$/) },
];

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

const misplaced = filesUnder(sourceRoot).filter((file) => !rules.some((rule) => rule.holds(file)));

if (misplaced.length > 0) {
  const areas = rules.map((rule) => rule.area).join(", ");
  for (const file of misplaced) {
    console.error(
      `src/${file} is outside the bulletproof-react layout. Move it into one of: ${areas}.`,
    );
  }
  process.exit(1);
}

console.log(`bulletproof layout: ${filesUnder(sourceRoot).length} files sit in an assigned folder`);
