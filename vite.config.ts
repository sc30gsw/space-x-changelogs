import stylex from "@stylexjs/unplugin";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { Features } from "lightningcss";
import { nitro } from "nitro/vite";
import { defineConfig, lazyPlugins } from "vite-plus";
import viteReact from "@vitejs/plugin-react";

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
      "src/routeTree.gen.ts",
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
      "src/routeTree.gen.ts",
      "tests/**",
    ],
    jsPlugins: [{ name: "vite-plus", specifier: "vite-plus/oxlint-plugin" }],
    rules: { "vite-plus/prefer-vite-plus-imports": "error" },
    options: { typeAware: true, typeCheck: true },
  },
  resolve: { tsconfigPaths: true },
  plugins: lazyPlugins(() => [tanstackStart(), nitro(), stylexPlugin, viteReact()]),
});

export default config;
