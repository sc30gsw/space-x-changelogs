---
name: verify-space-x-changelogs
description: Launch, check, drive, prove, and bug bash the SpaceX changelogs web app with e2e. Use before claiming a screen change works, when asked to verify a Track, Entry, Memo, Spotlight, or Basic auth flow, or to bug bash this app.
---

# Verify SpaceX changelogs

Read the e2e skill first (`npx e2e guide` prints it). This skill only says what is true of this app. The config is `e2e.config.ts` (target `web`, tests `tests/**/*.e2e.ts`). The bug bash uses `e2e.bugbash.config.ts`, which is gitignored.

## Launch

The target's `app.command` runs `node scripts/e2e-serve.mjs`. The runner starts it, waits for `http://127.0.0.1:3000`, and stops it after the run. The script deletes `file:./.data/e2e.db` and, when `.output/server/index.mjs` is missing, runs `pnpm build` first. The server reads `PORT`, `TURSO_DATABASE_URL=file:./.data/e2e.db`, and Basic auth from the command env. Seed Tracks and Sources are inserted the first time a read opens an empty database. Nothing to start by hand. A server you already left on port 3000 stops the run with `APP_ALREADY_RUNNING`. `pnpm dev` is the hand server on the same port; do not treat its first-visit compile as a broken app. Prefer this production command.

## Doctor

```bash
npx e2e list
npx e2e run tests/smoke.e2e.ts
```

`list` loads the config and prints every test-target pair without starting the app. Exit 0 means the config loads. `run` starts the app, opens `/tracks/cursor` with the `watcher` Basic credential, and pins the `Cursor` heading and the `Cursor changelog` Source. Exit 0 means the server, the engine, and that landmark work. `APP_ALREADY_RUNNING` is a server of yours on port 3000. `LOCATOR_NOT_FOUND` on the heading is the app. Run Doctor first whenever anything looks off.

## Drive

Live, over the registered `e2e mcp` server: `open_session`, then `observe`, the verbs, and `locate` before writing any locator (topic `mcp`). The catalog offers `type_secret` for the `watcher` credential. The browser answers Basic auth from `web({ basicAuth })`; a test does not type the password. Scripted: a test under `tests/`, `screen` for the labelled controls in [features/](features/). `agent.act` only when the flow varies (topic `writing-tests`). Signed-in driving starts from the `watcher` credential in `e2e.config.ts`. There is no saved session: every attempt is a fresh browser, and the sqlite file lives for the whole run.

## Evidence

Every run writes `.e2e/report.json`. A failed test gets `.e2e/results/<test>/trace.md`. `--trace on` writes one for passing tests too. `--video` records the attempt. `app.screenshot('<name>')` saves a named frame (topic `writing-tests` and topic `running`). The next run clears `.e2e/results/`, Doctor included, so a proof that must outlive it runs with `--output .e2e/proof/<name>`. A proof uses the nav or the route, the labelled control, and the state after the action. Side effects are rows in `file:./.data/e2e.db`: one Entry per 原文 URL, Memo rows on that Entry, `caughtUp` staying set across an overwrite. The screen shows that as one title link, the Memo text, and `Caught up`. Basic auth is the 401 from `fetch` without the browser's header. Sources are links only; the app does not crawl them.

## Bug bash

`e2e.bugbash.config.ts` (gitignored) spreads `e2e.config.ts`, points `tests` at `tests/bugbash/**/*.e2e.ts`, and adds the `skeptic` persona on the same gateway model. Its context is the seed Tracks, the `watcher` Basic account, a single sqlite file, and no Watcher process. Charters are the `slug|target|agent|charter` lines in [features/](features/). `.e2e/bugbash/` is gitignored. One explorer at a time uses the command as written. Several at once need the app started once and `reuseExisting: true`, because the port is fixed and the file database is wiped when the command starts. A finding is a bug only once `tests/bugbash/<slug>.e2e.ts` fails with `ASSERTION_FAILED` on the assertion that encodes it.

## Cleanup

The runner stops the app it started. `close_session` stops one a session started. A `pnpm dev` you started is yours to stop by its pid. Never kill by process name. The command already deletes `.data/e2e.db` on the next start. Remove `.e2e/bugbash/<slug>/` when every finding there was rejected. Keep `.e2e/results/`, `.e2e/proof/`, `.e2e/report.json`, and videos. That is the proof, and it is gitignored.

## Helpers

`scripts/e2e-serve.mjs` is the app command above. `tests/support.ts` opens the Cursor Track, catches it up, and submits an Entry. The e2e CLI is the other helper.
