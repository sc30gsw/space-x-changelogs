# SpaceX changelogs

TanStack Start development environment. The product UI is not in this tree yet.

Package manager: pnpm. Toolchain: Vite+ (`vp`). Formatter: oxfmt. Linter: oxlint. Deployment target: Nitro on Node.js.

```bash
pnpm install
pnpm dev
```

The dev server listens on http://localhost:3000.

```bash
pnpm typecheck
pnpm format
pnpm lint
pnpm build
pnpm start
```

`pnpm format` runs `vp fmt` (oxfmt). `pnpm lint` runs `vp lint` (oxlint). Configuration for both lives in `vite.config.ts`. `pnpm start` runs `node .output/server/index.mjs`.

## Data layer

TanStack DB 1.0 RC (`@tanstack/db` and `@tanstack/react-db` `1.0.0-rc.1.1`) models projects and changelog entries as collections. Turso is reached only from server modules with `@tursodatabase/serverless`.

Copy `.env.example` and set:

- `TURSO_DATABASE_URL` — database URL from `turso db show --url`
- `TURSO_AUTH_TOKEN` — token from `turso db tokens create`

Do not commit a real token. The dev shell does not query Turso until a collection is used.
