# Feature map

What a person can operate on the SpaceX changelogs screen. There is no cross-track timeline.

| Feature | Route | Test | Status |
| --- | --- | --- | --- |
| [Track screen](track-screen.md) | `/tracks/$slug` | `tests/smoke.e2e.ts` | tested |
| [Entry and 原文 URL overwrite](entry-url.md) | `/tracks/$slug` | `tests/entry-url.e2e.ts` | tested |
| [Caught up](caught-up.md) | `/tracks/$slug`, `/entries/$entryId` | `tests/caught-up.e2e.ts` | tested |
| [Memo](memo.md) | `/entries/$entryId` | `tests/entry-url.e2e.ts`, `tests/delete-entry.e2e.ts` | tested |
| [Delete Entry](delete-entry.md) | `/entries/$entryId` | `tests/delete-entry.e2e.ts` | tested |
| [Track and Source management](manage.md) | `/manage` | `tests/manage.e2e.ts` | tested |
| [Spotlight](spotlight.md) | any screen, then `/entries/$entryId` | `tests/spotlight.e2e.ts` | tested |
| [Basic auth](basic-auth.md) | every page | `tests/basic-auth.e2e.ts` | tested |
| [Web MCP](web-mcp.md) | every page, `document.modelContext` | `pnpm verify:web-mcp` | tested |
