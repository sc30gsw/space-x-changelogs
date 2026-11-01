# Delete Entry

A confirmed delete removes the Entry and its Memos.

## Sub-features

- `削除` opens a dialog titled `Entry を削除します`.
- `削除する` removes it. `キャンセル` leaves it.

## How to get to it (user POV)

Entry detail, button `削除`. `watcher` Basic credential.

## Driving it with e2e

`tests/delete-entry.e2e.ts`. Locators: `getByRole('button', '削除')`, `getByRole('button', '削除する')`, then `getByRole('heading', 'Entry')` and `getByText('この Entry はありません。')`. Live walk: `open_session`, open an Entry, `tap` `削除`, `observe` the dialog, `tap` `削除する`.

## Proof

On screen: the detail says the Entry is gone, the Track list has no link for that title, and Spotlight does not find the Memo. Store: no `entries` row for that URL and no `memos` row for that Entry.

## Charters

```
delete-entry|web|skeptic|Starting from an Entry that has a Memo, open the delete dialog, cancel, confirm the Entry remains, then confirm delete and confirm both are gone
```

## Gotchas

- The missing-Entry heading is the word `Entry`, not the old title.
- Cancel is the proof that the dialog does not delete by opening. The scripted test pins the confirm path.
