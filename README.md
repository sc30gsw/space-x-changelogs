# SpaceX changelogs

TanStack Start scaffold for later product work. The demo shell uses Mantine styled with StyleX, Valibot for search params and the formisch form, and Effect for the API and its typed errors.

Package manager: pnpm. Toolchain: Vite+ (`vp`). Deployment target: Nitro on Node.js.

```bash
pnpm install
pnpm dev
```

The dev server listens on http://localhost:3000.

```bash
pnpm typecheck
pnpm build
pnpm start
```

`pnpm start` runs `node .output/server/index.mjs`.
