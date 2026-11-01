import { defineConfig } from "drizzle-kit";

// drizzle-kit runs outside Vite, so load `.env` here. Missing file is fine (CI, Workers).
try {
  process.loadEnvFile();
} catch {
  // No .env file; rely on the environment.
}

export default defineConfig({
  dialect: "turso",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    url: process.env.TURSO_DATABASE_URL ?? "",
    authToken: process.env.TURSO_AUTH_TOKEN,
  },
});
