---
name: verify-entry-lifecycle
description: Check that one 原文 URL stays one Entry, Caught up writes only Caught up, and deleteEntries removes that Entry and its Memos. Use when changing submitEntry, setCaughtUp, insertMemo, deleteEntries, or scripts/verify-entry-lifecycle.ts.
---

# Entry のライフサイクル

同じ原文 URL は Entry を 1 件だけ指す。上書きはその id、Caught up、Memo を残し、最初の Ingest は Unread である。Caught up の更新は `caughtUp` と `updatedAt` だけを変える。Entry の削除は、その Entry とそれについていた Memo だけを消し、他の Entry と Memo を残す。ここが壊れると、再送が別の Entry を作り、Caught up が Unread に戻り、削除した Entry の Memo が検索に残り、残すつもりの Memo が消える。

TypeScript を対象にした検証器はリポジトリにない。このチェックは `submitEntry`、`setCaughtUp`、`insertMemo`、`deleteEntries` そのものを libsql のファイル DB に対して、画面の操作順と生成入力で実行する。画面そのものは `pnpm exec e2e` と `verify-space-x-changelogs` が見る。原文 URL の同時 Ingest の長い生成列は `verify-entry-url-identity` が見る。このチェックはその性質に、Caught up の列の固定と削除の範囲を足す。

## Run

```bash
pnpm verify:lifecycle
```

成功すると `entry lifecycle: 24 sequences of 12 operations, plus the screen cascade, held` と出て、終了コードは 0 である。失敗は標準エラーの 1 行で、終了コードは 1 である。依存はリポジトリの `tsx` と `@libsql/client` だけである。

## Coverage

Sync commit: `cf5003067d0adfc88a6e9ee389e50987e5e88b33`

このコミットで、チェックが次の実装をそのまま呼んでいることを確認した。対象ファイルがこのコミットより後に変わっていたら、先に `pnpm verify:lifecycle` を実行し、チェックがまだその実装を説明していると確認してから sync commit を進める。ずれを戻すときは `/maintain-formal-verification-skill` を使う。

| ファイル | 関数 |
| --- | --- |
| `src/lib/submit-entry.ts` | `submitEntry`, `submitInTx`, `overwrite`, `insertUnread`, `withTransaction`, `setCaughtUp`, `insertMemo`, `deleteEntries` |
| `scripts/verify-entry-lifecycle.ts` | 画面の操作順、同じ URL への同時上書き、24 列の生成 |

`overwrite` の `update` は `contentOf` だけを書く。`caughtUp` はそこには無い。`setCaughtUp` は `caughtUp` と `updatedAt` だけを書く。`deleteEntries` は対象 id の Memo を消してから、その Entry を消す。空の id 配列は何もしない。

画面順の前に、Cursor の Source を 1 件入れ、Drizzle の関係型 `TrackWithSources`、`SourceWithTrack`、`EntryWithMemos`、`MemoWithEntry` で読み戻す。行の型は `tracks`、`sources`、`entries`、`memos` の `$inferSelect` である。

## Bounds

- 乱数は mulberry32、種は `20261102`。24 試行、各 12 操作。URL は 4 つ、Track は 2 つ、種類は `entryKinds`。
- 操作は Ingest（新規、同じ URL の上書き、空いている URL への id 付き編集）、Caught up、Memo の追加、Entry の削除。
- その前の画面順は、Unread のままの読み直し、Caught up、Memo、同じ URL の上書き、残す Entry への Memo、同じ URL への同時上書き、対象 Entry の削除、空の削除。
- DB は `file:` の sqlite。外部キーは ON。これはアプリの `prepare` と同じである。
- 同時上書きは 1 プロセスの `withTransaction` の中で順番に終わる。すべてのインターリーブではない。

これはこの範囲の生成入力で、関数の戻り値と読み直した行がモデルと一致することである。すべての長さの列ではない。

## 壊し方

`setCaughtUp` の `.set` に `title: "scratch"` を足す。`pnpm verify:lifecycle` は `setCaughtUp of … changed title` で失敗する。

`overwrite` の `.set(contentOf(input))` を `.set({ ...contentOf(input), caughtUp: false })` に変える。失敗は `overwrite of https://example.test/a moved id or Caught up` である。

`deleteEntries` のトランザクション本体を空にする。失敗は `deleted Entry … is still present` である。Memo の削除条件を外して全 Memo を消すと、`delete removed Memo of an Entry that was kept` で失敗する。トランザクションの前に `PRAGMA foreign_keys = OFF` を実行し、Memo の削除を省くと、`deleted Entry … left Memo memo-target` で失敗する。外部キーが ON のまま Memo の明示削除だけを省いても、`ON DELETE CASCADE` が Memo を消すので、このチェックは成功したままである。その成功は、削除後に Memo 行が残っていないことであり、明示削除の行がまだあることではない。

いずれの変更も元に戻して、同じコマンドが成功することを確認する。失敗しなかったら、チェックがその性質を見ていない。プロパティを弱めて通さない。

## 見ていないもの

画面、TanStack DB、HTTP、Basic auth、検索の本文、Memo 単体の編集と削除、`insertTracks` と `insertSources`、プロセスをまたいだ書き込み、リモート Turso。詳細を開いても Unread のまま、という画面の操作は e2e が見る。ここでの読み直しは `select` が行を変えないことだけである。
