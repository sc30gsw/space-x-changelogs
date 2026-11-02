# Entry and 原文 URL overwrite

Adding an Entry from the Track screen. The same 原文 URL updates that Entry instead of adding another.

## Sub-features

- The form in the region `Entry を追加` asks for Track, 種類, 原文タイトル, 原文 URL, 公開日時, 要約, and 本文.
- A new Ingest is Unread.
- Submitting an existing 原文 URL keeps the Entry id, Caught up, and Memo, and replaces the title and summary.

## How to get to it (user POV)

`/tracks/cursor`, section `Entry を追加`. Same form for a person and a Watcher. `watcher` Basic credential.

## Driving it with e2e

`tests/entry-url.e2e.ts`. Locators, from the region `Entry を追加`: `getByLabel('原文タイトル')`, `getByLabel('原文 URL')`, `getByLabel('要約')`, `getByRole('button', 'Entry を追加')`. The list is `getByRole('list', 'Entry')`. On a detail, the Track link in the page and the one in `navigation` are both named `Cursor`; the way back is `getByRole('navigation').getByRole('link', 'Cursor')`. On the detail, Caught up is `getByRole('switch', 'Caught up')` (the status text repeats that name). The Memo field is `getByRole('region', 'Memo').getByRole('textbox')`. Live walk: `open_session`, `navigate /tracks/cursor`, `locate` the region, `type` the three fields, `tap` the button, `observe`.

## Proof

On screen: one link for the new title, zero links for the old title, the checkbox `Caught up <new title>` stays checked, and the Memo text is still on the detail. Store: one `entries` row for that URL, `caught_up` still 1, the Memo row still pointing at that Entry id.

## Charters

```
entry-url|web|skeptic|Starting at /tracks/cursor, add an Entry, mark it Caught up, add a Memo, submit the same 原文 URL with a new title, and check there is still one Entry, the Memo remains, and it stays Caught up
```

## Gotchas

- 公開日時 is a JST wall clock. The form defaults to today at 00:00. An unknown time is 00:00.
- The second submit is an overwrite, so the list does not grow. A second row is the bug.
- Summary and body are plain text areas. The detail renders 本文 as Markdown.
