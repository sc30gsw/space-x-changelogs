import { cloudflare } from "@cloudflare/vite-plugin";
import stylex from "@stylexjs/unplugin";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { Features } from "lightningcss";
import { nitro } from "nitro/vite";
import { defineConfig, lazyPlugins } from "vite-plus";
import viteReact from "@vitejs/plugin-react";

type ServerHost = "nitro-node" | "cloudflare-workers";

// `pnpm start` and e2e keep Nitro so file: SQLite still opens.
// `pnpm deploy` sets SERVER_HOST=cloudflare-workers.
const serverHost = (): ServerHost =>
  process.env.SERVER_HOST === "cloudflare-workers" ? "cloudflare-workers" : "nitro-node";

const stylexPlugin = stylex.vite({
  lightningcssOptions: { exclude: Features.LightDark },
  // Append compiled StyleX rules to the app CSS entry Start already links.
  cssInjectionTarget: (fileName) => fileName.includes("stylex"),
});

// StyleX's dev server hook keeps Vitest alive after the suite finishes.
if (process.env.VITEST) {
  delete stylexPlugin.configureServer;
}

const config = defineConfig({
  fmt: {
    ignorePatterns: [
      ".agents/**",
      ".claude/**",
      ".cursor/**",
      ".mcp.json",
      "e2e.config.ts",
      "skills-lock.json",
      "src/app/routeTree.gen.ts",
      "tests/**",
    ],
  },
  lint: {
    ignorePatterns: [
      ".agents/**",
      ".claude/**",
      ".cursor/**",
      ".mcp.json",
      "e2e.config.ts",
      "skills-lock.json",
      "src/app/routeTree.gen.ts",
      "tests/**",
    ],
    jsPlugins: [{ name: "vite-plus", specifier: "vite-plus/oxlint-plugin" }],
    rules: { "vite-plus/prefer-vite-plus-imports": "error" },
    options: { typeAware: true, typeCheck: true },
  },
  resolve: { tsconfigPaths: true },
  plugins: lazyPlugins(() => {
    const start = tanstackStart({
      router: {
        routesDirectory: "app/routes",
        generatedRouteTree: "app/routeTree.gen.ts",
        entry: "app/router.tsx",
      },
      start: { entry: "app/start.ts" },
    });
    const host = serverHost();
    switch (host) {
      case "cloudflare-workers":
        return [
          cloudflare({ viteEnvironment: { name: "ssr" } }),
          start,
          stylexPlugin,
          viteReact(),
        ];
      case "nitro-node":
        return [start, nitro(), stylexPlugin, viteReact()];
      default: {
        const unreachable: never = host;
        return unreachable;
      }
    }
  }),
});

export default config;
