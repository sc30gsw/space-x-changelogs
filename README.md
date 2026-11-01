# SpaceX Changelogs

SpaceXAI 関連のプロダクト（Cursor・Grok Bot・pstack）の更新情報を、Grok Bot 上の Watcher が集めて登録し、ユーザー（1人）が UI でキャッチアップしてメモを残すためのアプリ。

用語は [GLOSSARY.md](./GLOSSARY.md)、設計上の決定は [docs/adr/](./docs/adr/) を参照。

## 誰が何をするか

| 役割 | すること |
| --- | --- |
| **ユーザー**（1人） | Track 画面で Entry を読み、Caught up にし、Memo を書く。必要なら Entry を手で追加・編集・削除する。Track と Source を増やす。 |
| **Watcher**（Grok Bot 上に Track ごと1体） | Source を監視し、更新を見つけたら Entry フォームを操作して Ingest する。毎日ではなく更新を見つけたときに動く。 |

現在の Watcher:

- **Cursor Changelog** → Track: Cursor
- **Grok Bot Changelog** → Track: Grok Bot
- **pstack Watch** → Track: pstack

## Track と Source

| Track | Source |
| --- | --- |
| **Cursor** | [Cursor changelog](https://cursor.com/changelog) / [日本語版](https://cursor.com/ja/changelog) / [page 2 以降](https://cursor.com/changelog/page/2) / [@cursor_ai](https://x.com/cursor_ai) |
| **Grok Bot** | [Grok Bot changelog](https://x.ai/changelog/bot)（RSS あり）/ [Bot Marketplace](https://x.ai/bot/marketplace) / [@bot](https://x.com/bot) / X 上で共有された Grok Bot（`https://x.ai/bot/<id>`） |
| **pstack** | [cursor/plugins](https://github.com/cursor/plugins) の `pstack/` 配下を変更した PR |

Track と Source はアプリの UI から追加・編集できる。**Track を増やす手順**:

1. アプリで Track（名前・slug）と Source（ラベル・URL）を登録する。Track 画面が1つ増える。
2. Grok Bot App でその Track を見張る Watcher を作る。アプリは Watcher を管理しない。

## Entry

Track について登録される情報の最小単位。種類は4つ:

| 種類 | 中身 |
| --- | --- |
| **Release** | changelog の1項目 |
| **X Post** | X の投稿1本 |
| **Bot Template** | Bot Marketplace のボット、または X で共有されたボット1つ |
| **Pull Request** | `cursor/plugins` の `pstack/` 配下を変更した PR 1件 |

Entry フォームの項目（ユーザーも Watcher も同じフォームを使う）:

| 項目 | 必須 | 備考 |
| --- | --- | --- |
| Track | ✓ | 選択 |
| 種類 | ✓ | 選択 |
| 原文タイトル | ✓ | |
| 原文 URL | ✓ | **同一性キー**。同じ URL なら新規作成ではなく上書き更新 |
| 公開日時 | ✓ | JST。時刻が不明なら 00:00 |
| 要約 | ✓ | テキストエリア（1〜3文、日本語） |
| 本文 | | テキストエリア。Markdown として表示 |

ルール:

- Entry は **原文 URL で同一性を判断**する。Watcher が同じ更新を二度見つけても重複しない。
- 上書き更新されても **Memo と Caught up は維持**される。
- Ingest された Entry は **常に Unread**。初回の履歴取り込みはしない（使い始めた時点以降の更新だけを追う）。
- ユーザーも Watcher も Entry を追加・編集・削除できる。削除すると付いていた Memo も消える（削除前に確認）。
- 本文の入力はリッチテキストではなく素のテキストエリア（Watcher が確実に入力できるようにするため）。

## キャッチアップ

- Entry は **Unread** か **Caught up** のどちらかの状態を持つ。
- Caught up にするのは **明示的な操作のみ**（詳細画面のトグル、一覧のチェック、Track 単位の「全部 Caught up にする」）。詳細を開いただけでは変わらない。
- ナビの各 Track 名に Unread 件数のバッジが出る。

## Memo

- ユーザーが Entry に対して書く学び・所感。1つの Entry に複数付けられ、編集・削除できる。
- リッチテキスト（Mantine RichTextEditor / TipTap）で書く。
- Entry にだけ紐づく。独立した Memo はない。

## 画面

| 画面 | 内容 |
| --- | --- |
| **Track 画面**（Track ごとに1つ） | その Track の Entry を公開日時の新しい順に表示。種類・Unread で絞り込み。上部に Source を参考リンクとして表示。「Entry を追加」フォーム、「全部 Caught up にする」ボタン。 |
| **Entry 詳細** | 本文・原文リンク・Caught up トグル・Memo 一覧と追加・編集・削除。 |
| **Track 管理** | Track と Source の追加・編集。 |
| **Spotlight**（⌘K） | 全 Track 横断のキーワード検索（原文タイトル・要約・本文・Memo が対象）。結果を選ぶと Entry 詳細へ。Track 画面への移動もアクションとして並ぶ。 |

横断タイムラインは持たない。Track 画面が入口。

## 認証

- Basic 認証。ID/パスワードは1組だけで環境変数から読む。
- 環境変数が未設定なら認証なし（開発時）。設定されていれば Watcher が使うフォームを含む全ページに掛かる。
- Watcher にはユーザーと同じ ID/パスワードを渡す。

## スコープ外

- Ingest 用の HTTP API（[ADR 0001](./docs/adr/0001-ingest-via-ui-not-api.md)）
- 日次ダイジェスト
- pstack の X 投稿ドラフト（Watcher 側に残す）
- 複数ユーザー
- Watcher の作成・設定

## 技術

| 領域 | 選択 |
| --- | --- |
| フレームワーク | TanStack Start（file-based router、typed server functions） |
| ツールチェーン | Vite+（`vp`） |
| ドメイン層 | Effect v4（`Effect.fn`、`Schema.TaggedError`） |
| UI | Mantine 9 + StyleX、`@mantine/tiptap`（Memo）、`@mantine/spotlight`（検索） |
| バリデーション / フォーム | Valibot + formisch |
| DB | Turso。サーバー側は Drizzle ORM（`drizzle-kit` でマイグレーション）を Effect サービスとして包み、クライアント側は TanStack DB のコレクションとして扱う（[ADR 0002](./docs/adr/0002-tanstack-db-for-client-state.md)） |
| 日時 | Temporal API、JST |
| デプロイ | Cloudflare Workers（Nitro `cloudflare` プリセット） |
| パッケージマネージャ | pnpm |

## 開発

```bash
pnpm install
pnpm dev
```

開発サーバーは http://localhost:3000 で動く。

```bash
pnpm typecheck
pnpm build
pnpm start
```

```bash
pnpm test:e2e
```
