import type { E2EConfig } from "e2e";
import { web } from "@e2e-dev/web";
import { gateway } from "ai";

const basicUser = "watcher";
const basicPassword = "watcher-e2e";

export default {
  tests: "tests/**/*.e2e.ts",
  workers: 1,
  assertionTimeout: 15000,
  targets: [
    {
      engine: web({
        basicAuth: { username: basicUser, password: basicPassword },
      }),
      app: {
        url: "http://127.0.0.1:3000",
        command: {
          executable: "node",
          args: ["scripts/e2e-serve.mjs"],
          startupTimeout: 180000,
          log: ".e2e/logs/app.log",
          env: {
            PORT: "{port}",
            NITRO_PORT: "{port}",
            HOST: "127.0.0.1",
            NITRO_HOST: "127.0.0.1",
            NODE_ENV: "production",
            TURSO_DATABASE_URL: "file:./.data/e2e.db",
            BASIC_AUTH_USER: basicUser,
            BASIC_AUTH_PASSWORD: basicPassword,
          },
        },
      },
    },
  ],
  agents: {
    default: {
      model: gateway("openai/gpt-6-luna-fast"),
      system: "You are a thorough QA agent. Verify every outcome on screen.",
    },
  },
  credentials: {
    watcher: { username: basicUser, password: basicPassword },
  },
} satisfies E2EConfig;
