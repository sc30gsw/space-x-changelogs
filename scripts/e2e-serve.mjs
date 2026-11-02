import { spawn } from "node:child_process";
import { existsSync, mkdirSync, rmSync } from "node:fs";

mkdirSync(".data", { recursive: true });
for (const suffix of ["", "-wal", "-shm"]) {
  rmSync(`.data/e2e.db${suffix}`, { force: true });
}

if (!existsSync(".output/server/index.mjs")) {
  const build = spawn("pnpm", ["build"], { stdio: "inherit", env: process.env });
  const code = await new Promise((resolve) => {
    build.on("exit", resolve);
  });
  if (code !== 0) {
    process.exit(code ?? 1);
  }
}

const child = spawn(process.execPath, ["--env-file-if-exists=.env", ".output/server/index.mjs"], {
  stdio: "inherit",
  env: process.env,
});

const stop = (signal) => {
  child.kill(signal);
};

process.on("SIGTERM", () => {
  stop("SIGTERM");
});
process.on("SIGINT", () => {
  stop("SIGINT");
});

child.on("exit", (code) => {
  process.exit(code ?? 0);
});
