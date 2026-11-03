# Web MCP

Bots on the open page call the same seven write functions the screens use. The tools are `document.modelContext` entries. They add no control, route, or heading.

## Sub-features

- `list_workspace` returns the Tracks, Sources, Entries, and Memos already loaded. It writes nothing.
- `ingest_entry`, `catch_up`, `save_track`, `save_source`, `save_memo`, `remove_entries`, and `remove_memos` each call one of `ingestEntry`, `catchUp`, `saveTrack`, `saveSource`, `saveMemo`, `removeEntries`, and `removeMemos`.
- A rejected input returns `{ error }` and calls no write.
- `catch_up` sends the whole mark list in one `catchUp`. A missing id rolls the earlier marks back.
- `ingest_entry` for a URL that already exists keeps that Entry id and Caught up.

## How to get to it (user POV)

Any page after the client bundle loads, including `/tracks/cursor`. There is no new nav item. Basic auth is the same gate as the page. When both `BASIC_AUTH_USER` and `BASIC_AUTH_PASSWORD` are unset or empty, the page is open.

## Driving it with e2e

No screen test. `pnpm verify:web-mcp` checks `runBotTool`. `pnpm verify:lifecycle` checks one bot `catch_up` against `commitCatchUp`. `pnpm verify:ingest` checks one bot overwrite against `commitIngest`. Live walk: open `/tracks/cursor`, wait until the heading `Cursor` is visible, then in the page:

```js
const tools = await document.modelContext.getTools();
const listed = tools.find((tool) => tool.name === "list_workspace");
const ingest = tools.find((tool) => tool.name === "ingest_entry");
await document.modelContext.executeTool(listed, {});
await document.modelContext.executeTool(ingest, {});
```

Expect eight names. In Chrome 156, `executeTool` returns a JSON string. Parse it and read `structuredContent`. The list result has `tracks`, `sources`, `entries`, `memos`, `isLoading`, and `isError`. The empty ingest result has `error` `trackId is required.`. The heading stays `Cursor`, and the Entry count stays 0.

## Proof

On screen: the Cursor heading and the `Cursor changelog` link, same as the track screen. Beside that, `getTools()` lists `list_workspace`, `ingest_entry`, `catch_up`, `save_track`, `save_source`, `save_memo`, `remove_entries`, `remove_memos`. Store: a bad `ingest_entry` leaves the seed rows unchanged.

## Charters

```
web-mcp|web|skeptic|Starting at /tracks/cursor, confirm the Cursor heading is unchanged and that document.modelContext lists the eight changelog tools
```

## Gotchas

- `document.modelContext` comes from `@mcp-b/global` after the client module loads. The first HTML response does not list the tools.
- `src/app/start.ts` does not handle MCP. A request to `/mcp` is not this feature.
- The registrar renders nothing. A missing heading is the track screen, not a missing tool.
- In Chrome 156, `executeTool` returns a JSON string. `structuredContent` is inside that string. `{ error: "trackId is required." }` is that field.
