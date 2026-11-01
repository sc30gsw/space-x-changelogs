---
name: verify-entry-url-identity
description: Check that one 原文 URL stays one Entry, and that an overwrite keeps its id, Caught up, and Memos. Use when changing submitEntry, overwrite, or scripts/verify-entry-url-identity.ts.
---

# 原文 URL の同一性

同じ原文 URL は Entry を 1 件だけ指す。上書きはその Entry の id、Caught up、Memo を残し、最初の Ingest は Unread である。ここが壊れると、再送が別の Entry を作り、Caught up が Unread に戻り、その Entry についていた Memo から離れる。

TypeScript を対象にした検証器はリポジトリにない。設計だけを別のモデルに書くと、`overwrite` が `caughtUp: false` を書き始めてもそのモデルは成功したままになる。このチェックは `submitEntry` そのものを libsql のファイル DB に対して生成入力で実行する。

## Run

```bash
pnpm verify:ingest
```

成功すると `entry url identity: 40 sequences of 18 operations, plus concurrent Ingest, held` と出て、終了コードは 0 である。失敗は標準エラーの 1 行で、終了コードは 1 である。依存はリポジトリの `tsx` と `@libsql/client` だけである。

## Coverage

Sync commit: `cf5003067d0adfc88a6e9ee389e50987e5e88b33`

このコミットで、チェックが次の実装をそのまま呼んでいることを確認した。対象ファイルがこのコミットより後に変わっていたら、先に `pnpm verify:ingest` を実行し、チェックがまだその実装を説明していると確認してから sync commit を進める。ずれを戻すときは `/maintain-formal-verification-skill` を使う。

| ファイル | 関数 |
| --- | --- |
| `src/lib/submit-entry.ts` | `submitEntry`, `submitInTx`, `overwrite`, `insertUnread`, `withTransaction`, `setCaughtUp`, `insertMemo` |
| `scripts/verify-entry-url-identity.ts` | 生成列、逐次の上書き、同じ URL への同時 `submitEntry` |

`overwrite` の `update` は `contentOf` だけを書く。`caughtUp` はそこには無い。`insertUnread` だけが `caughtUp: false` を書く。同じ URL の再送は `findByUrl` の行を上書きする。URL の UNIQUE で insert が負けたときも、勝った行を上書きする。

## Bounds

- 乱数は mulberry32、種は `20261101`。40 試行、各 18 操作。URL は 4 つ、Track は 2 つ、種類は Release、X Post、Bot Template、Pull Request。
- その前に、1 件を Caught up にして Memo を 1 つ付け、同じ URL を再送する。
- 同じ URL への `submitEntry` を 2 つ同時に始める。空の URL への同時 Ingest と、Caught up と Memo の後の同時上書き。
- DB は `file:` の sqlite。接続は 8、busy timeout は 0。`:memory:` は接続を 1 本しか持てず、同時 Ingest が始まらない。
- 1 プロセスの中では `withTransaction` が同じクライアントの書き込みを順番に通す。sqlite がそれでも `SQLITE_BUSY` か `TRANSACTION_ACTIVE` を返したら、スレッドを止めずに待ってから同じ関数をやり直す。libsql の busy timeout は、コミットする側のスレッドを止めてしまう。

これはこの範囲の生成入力で、関数の戻り値と読み直した行がモデルと一致することである。すべてのインターリーブや、すべての長さの列ではない。

## 壊し方

`overwrite` の `.set(contentOf(input))` を `.set({ ...contentOf(input), caughtUp: false })` に変える。`pnpm verify:ingest` は `overwrite of https://example.test/a moved id or Caught up` で失敗する。元に戻して、同じコマンドが成功することを確認する。失敗しなかったら、チェックが上書きの Caught up を見ていない。プロパティを弱めて通さない。

## 見ていないもの

画面、TanStack DB、HTTP、Basic auth、Memo の編集と削除、Entry の削除、プロセスをまたいだ書き込み、リモート Turso のトランザクション。UNIQUE と上書きの分岐はコードにあるが、1 プロセスのキューは 2 つの `submitEntry` を順番に完了させる。
