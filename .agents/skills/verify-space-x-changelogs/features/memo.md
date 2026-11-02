# Memo

Rich text attached to one Entry. It is deleted with that Entry.

## Sub-features

- Add from the Memo editor on the detail.
- Edit and delete a Memo that is already there.
- A Memo is not its own screen.

## How to get to it (user POV)

Open an Entry from a Track. The region is `Memo`. `watcher` Basic credential.

## Driving it with e2e

`tests/entry-url.e2e.ts` adds `上書きしても残る学び` and reads it after the overwrite. `tests/delete-entry.e2e.ts` adds `一緒に消えるメモ` and checks Spotlight no longer finds it after a confirmed delete. Locator: `getByRole('region', 'Memo').getByRole('textbox')`, `getByRole('button', 'Memo を追加')`. The label `Memo` also names the region, the heading, and the toolbar, so it is not a single field. Live walk: `open_session`, open an Entry, `locate` the Memo textbox, `type`, `tap` `Memo を追加`.

## Proof

On screen: the Memo's plain text is in the list under Memo, and it is still there after an 原文 URL overwrite. After a confirmed Entry delete, Spotlight says `一致する Entry はありません` for that text. Store: a `memos` row whose `entry_id` is the Entry, removed when the Entry is removed.

## Charters

```
memo|web|skeptic|Starting from an Entry detail, add a Memo, edit it, delete it, and check the list matches each step
```

## Gotchas

- The editor is TipTap. `fill` on the textbox labelled `Memo` is the drive. An empty Memo is refused with `Memo を入力してください`.
- Memo HTML is sanitized before it is shown. The proof reads the text, not the tags.
