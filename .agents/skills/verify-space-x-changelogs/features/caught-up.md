# Caught up

Unread or Caught up. Caught up happens only from an explicit control.

## Sub-features

- A new Entry is Unread.
- Opening the detail does not change it.
- The list checkbox, the detail switch, and 「全部 Caught up にする」 do.
- The nav name is `<Track> <n> Unread` while n is at least 1. No badge reads `0`.

## How to get to it (user POV)

`/tracks/cursor` for the list and the catch-all. `/entries/$entryId` for the switch. `watcher` Basic credential.

## Driving it with e2e

`tests/caught-up.e2e.ts`. Locators: `getByRole('button', '全部 Caught up にする')`, `getByRole('link', 'Cursor 1 Unread')`, `getByRole('checkbox', 'Caught up <title>')`, `getByText('Unread')` on the detail. Live walk: `open_session`, `navigate /tracks/cursor`, `observe` the nav name before and after opening a detail.

## Proof

On screen: after one new Entry and a catch-all of anything older, the nav link is `Cursor 1 Unread`. After opening the detail and coming back, the row still says Unread. After the checkbox, the nav link is `Cursor` and the row says Caught up. Store: `entries.caught_up` flips only on those writes.

## Charters

```
caught-up|web|skeptic|Starting at /tracks/cursor, add an Entry, open it, go back, and check it is still Unread; then use the list checkbox and check the nav badge drops
```

## Gotchas

- The detail switch and the list checkbox are different controls. The detail one is the label `Caught up` without the title.
- Catch-all is disabled when the Track has no Unread Entry.
- Optimistic updates land in TanStack DB before Turso answers. A reload that lost the check is a failed write.
