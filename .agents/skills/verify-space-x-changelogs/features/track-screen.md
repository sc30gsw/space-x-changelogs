# Track screen

The newest Entries of one Track, its Source links, and the add form.

## Sub-features

- Heading is the Track name. Entries are newest `publishedAt` first.
- Source labels are links. They are not fetched.
- Filter by 種類 and by Unread. The list checkbox and 「全部 Caught up にする」 are the Caught up feature.

## How to get to it (user POV)

Nav link with the Track name, or `/tracks/cursor`. The home page redirects there. The `watcher` Basic credential is sent by the browser.

## Driving it with e2e

`tests/smoke.e2e.ts` pins the landmark. Locators: `screen.getByRole('heading', 'Cursor')`, `screen.getByRole('link', 'Cursor changelog')`. Live walk: `open_session`, `navigate /tracks/cursor`, `observe`.

## Proof

On screen: the `Cursor` heading and the `Cursor changelog` link. Store: the seed row in `tracks` / `sources` inside `file:./.data/e2e.db`, written on the first read of an empty file.

## Charters

```
track-screen|web|skeptic|Starting at /tracks/cursor, confirm the heading, the Source links, and that the Entry list is only this Track
```

## Gotchas

- A badge that reads `0` is not rendered. No Unread means the nav link's name is `Cursor`.
- The first load can say 読み込み中 until the collections arrive. That is not a failed launch.
- `pnpm dev` compiles the route on first visit. The verification command serves the production build.
