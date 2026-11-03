# Spotlight

Search 原文タイトル, 要約, 本文, and Memo text in the collections already on screen.

## Sub-features

- Button `検索`, or ⌘K / Ctrl+K.
- A result opens the Entry detail.
- Track names are navigation actions in the same dialog.

## How to get to it (user POV)

Any screen, button `検索`. `watcher` Basic credential.

## Driving it with e2e

`tests/spotlight.e2e.ts`. Locators: `getByRole('button', '検索')`, `getByLabel('検索')`, then `getByRole('button', { name: '<title>', exact: false })`. The result is a button. Its label is the title and its description is `<Track> <kind>` with a space between them. The Memo field filled before the search is `getByRole('region', 'Memo').getByRole('textbox')`. Live walk: `open_session`, add a Memo, `tap` `検索`, `type` the Memo text, `tap` the result button, `observe` the detail heading.

## Proof

On screen: the detail heading is the Entry whose Memo contained the query. Store: the search reads TanStack DB; it does not write. The Memo row was written by the add.

## Charters

```
spotlight|web|skeptic|Starting at /tracks/cursor, add an Entry and a Memo, open 検索, query the Memo text, and check the result opens that Entry
```

## Gotchas

- The button and the dialog field are both named 検索. The button is a `button`; the field is a label.
- An empty result says `一致する Entry はありません`.
- The index is whatever the collections have loaded. A Memo that is not on the client yet will not match.
