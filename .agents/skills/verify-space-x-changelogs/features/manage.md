# Track and Source management

Add and edit Tracks and Sources. Watchers are not created here.

## Sub-features

- One sentence: Track を増やしたあとの Watcher 作成は Grok Bot App 側です。
- Region `Track を追加` takes 名前 and slug.
- Each Track region edits 名前 and slug, saves with `Track を保存`, and adds a Source with ラベル and URL.

## How to get to it (user POV)

Nav link `Track 管理`, or `/manage`. `watcher` Basic credential.

## Driving it with e2e

`tests/manage.e2e.ts`. Locators: `getByRole('heading', 'Track 管理')`, region `Track を追加` with `getByLabel('名前')` and `getByLabel('slug')`, then region `検証用` with `getByLabel('ラベル')` and `getByLabel('URL')`. After save, `/tracks/e2e-extra` shows `getByRole('link', '公開ノート')`. Live walk: `open_session`, `navigate /manage`, `observe` the Watcher sentence.

## Proof

On screen: the new Track heading and the Source link on its Track screen. Store: a `tracks` row with slug `e2e-extra` and a `sources` row on that Track. No Watcher row exists; the app has nowhere to store one.

## Charters

```
manage|web|skeptic|Starting at /manage, read the Watcher sentence, add a Track and a Source, and open the new Track screen to see the Source link
```

## Gotchas

- 名前 and slug also appear on every existing Track. Scope to the region.
- A Source URL is only a link. Nothing is crawled.
- slug is lowercase letters, digits, and hyphens.
