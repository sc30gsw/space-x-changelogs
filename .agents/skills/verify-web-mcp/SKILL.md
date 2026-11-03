---
name: verify-web-mcp
description: Check that each Web MCP tool calls one of the seven changelog write functions, and that the stored rows match that function. Use when changing runBotTool, botToolSpecs, BotTools, the write schemas, the write effects, or scripts/verify-web-mcp.ts.
---

# Web MCP の 8 ツールと 7 つの書き込み

ページの `document.modelContext` に載るツールは 8 個である。`list_workspace` は読み込み済みの行を返し、何も書かない。残りの 7 個は、画面と同じ書き込み関数を 1 回だけ呼ぶ。`catch_up` は印の配列を 1 回の `catchUp` に渡し、無い id があると先の行も Caught up にしない。`ingest_entry` は同じ URL の id と Caught up を残す。`save_memo` は script を保存しない。`remove_memos` は Memo だけを消し、`remove_entries` はその Entry とそれについていた Memo だけを消す。ここが壊れると、ボットが別の書き込みを通り、無い id の Caught up が途中の行だけを Caught up にし、消したつもりのない行が消える。

TypeScript を対象にした検証器はリポジトリにない。書き込みの順番を別の TLA+ モデルにすると、`commitCatchUp` が無い id を無視して先の行を保存しても、そのモデルは成功したままになる。このチェックは `runBotTool` そのものを実行する。扉は `ingestEntryEffect`、`catchUpEffect`、`saveTrackEffect`、`saveSourceEffect`、`saveMemoEffect`、`removeEntriesEffect`、`removeMemosEffect` で、libsql のファイル DB に書く。ページは同じ名前の store 関数を渡す。store 関数はブラウザのコレクションとサーバ関数を通るので、ここではサーバ関数の handler が呼ぶ Effect を直接渡す。`/statechart` は使わない。

## Run

```bash
pnpm verify:web-mcp
```

成功すると次の 2 行が出て、終了コードは 0 である。

```text
web mcp: 8 tools, 4 rejected inputs each, one door per write, held
web mcp writes: 8 tools, 7 write functions, one call each, stored rows held
```

失敗は標準エラーの 1 行で、終了コードは 1 である。依存はリポジトリの `tsx`、`effect`、`drizzle-orm`、`@libsql/client` である。

## Coverage

Sync commit: `db514ae12cdc811f2ed452c79f7a46aba6957718`

このコミットで、チェックが次の実装をそのまま呼んでいることを確認した。対象ファイルがこのコミットより後に変わっていたら、先に `pnpm verify:web-mcp` を実行し、チェックがまだその実装を説明していると確認してから sync commit を進める。ずれを戻すときは `/maintain-formal-verification-skill` を使う。

| ファイル | 関数 |
| --- | --- |
| `src/types/writes.ts` | `ingestEntrySchema`, `catchUpSchema`, `trackSaveSchema`, `sourceSaveSchema`, `memoSaveSchema`, `removeIdsSchema` |
| `src/features/bots/utils/web-model-context.ts` | `window.__webModelContextOptions` |
| `src/features/bots/utils/bot-tools.ts` | `botToolSpecs`, `runBotTool` |
| `src/features/bots/components/bot-tools.tsx` | `BotTools`, `BotTool`, `doors` |
| `src/lib/db/write.ts` | `ingestEntryEffect`, `catchUpEffect`, `saveTrackEffect`, `saveSourceEffect`, `saveMemoEffect`, `removeEntriesEffect`, `removeMemosEffect` |
| `src/stores/changelog.ts` | `ingestEntry`, `catchUp`, `saveTrack`, `saveSource`, `saveMemo`, `removeEntries`, `removeMemos` |
| `scripts/check-write-doors.ts` | 7 つの store 名、options の import が `@mcp-b/global` より前 |
| `scripts/verify-web-mcp.ts` | 拒否入力、1 回の扉、生成 id、既存 id、省略した ingest id、大文字 slug |
| `scripts/verify-web-mcp-writes.ts` | 8 ツールの仕様表、7 Effect の保存結果 |

`bot-tools.tsx` の `doors` は、上の 7 つの store 関数を別名なしで渡す。その名前と、`import "../utils/web-model-context"` が `import "@mcp-b/global"` より前であることは `pnpm check:fence` が 1 回見る。`runBotTool` は `door` が `null` のとき `list_workspace` の空オブジェクトを parse し、読み取り結果だけを返す。書き込みは `writes` の 1 行が、`src/types/writes.ts` の schema を parse してから対応する Effect を 1 回呼ぶ。`catch_up` と削除は `{ marks }` と `{ ids }` を外してから、サーバと同じ配列 schema を通す。`saveTrack`、`saveSource`、`saveMemo` は、入力が id を持たないオブジェクトのときだけ `createId` を足してから schema を通す。`ingest_entry` は省略した id を作らない。`catchUpEffect` は `commitCatchUp` を 1 つのトランザクションで呼ぶ。無い id があると `RecordNotFound` でそのトランザクションが戻る。`saveMemoEffect` は `sanitizeMemo` を通した本文を書く。

## Bounds

仕様表の順は `list_workspace`、`ingest_entry`、`catch_up`、`save_track`、`save_source`、`save_memo`、`remove_entries`、`remove_memos`。読み取りは最初の 1 個だけ。書き込みの扉は `writeDoors` の 7 個で、各扉はツール 1 個。

`scripts/verify-web-mcp.ts` は扉の代わりに回数を数える。拒否する形は `null`、`[]`、`"no"`、`{ extra: true }` と、必須項目を 1 つ消したオブジェクト。妥当な入力はツールごとに 1 つ。`catch_up` の印は 2 件で、引数の長さは 2。`save_track` は省略した id を `generated-id` にし、渡した id はそのまま残す。`ingest_entry` は省略した id を作らない。`{ name: "Cursor", slug: "Cursor" }` は slug の schema で拒否され、`saveTrack` を呼ばない。経路ファイル、`src/app/start.ts` の文字、registrar のカンマと改行は見ない。

`scripts/verify-web-mcp-writes.ts` は同じ `runBotTool` を、上の 7 Effect に対して 1 回ずつ実行する。store 名の受け渡しはここでは見ない。

- 各ツールに `null` を渡すと、呼び出しは 0 で、行は変わらない。
- `save_track` は同じ id の 2 回目で名前を変え、行は 1 件のまま。
- `save_source` は Track の最初の Source を position 0 で作り、2 回目は position を残して label を変える。
- `ingest_entry` は本文を空にした Unread を 1 件作る。同じ URL の再送は id と Caught up を残し、title を変える。
- `catch_up` は存在する id の `caughtUp` を true にし、title は残す。存在する id と無い id を同じ配列で渡すと、戻り値は `error`、呼び出しは 1 回、先の行は Unread のまま。
- `save_memo` の `<script>alert(1)</script><p>ok</p>` は `<p>ok</p>` として 1 件保存する。
- `remove_memos` はその Memo を消し、Entry は残す。
- `remove_entries` はその Entry を消し、別の Entry とその Memo は残す。
- `list_workspace` は渡したスナップショットを返し、行を変えない。

これはこの入力の集合である。すべての文字列、`createServerFn` の呼び出し、ブラウザの楽観更新、同時の 2 ツール、ではない。書き込みの schema はサーバ関数と同じオブジェクトで、このチェックは `runBotTool` の parse を見る。生成列の Caught up と URL は `verify-entry-lifecycle` と `verify-entry-url-identity` が見る。ボットの複製はそこには無い。

## 壊し方

`catch_up` の `doors.catchUp(marks)` を、印ごとに `doors.catchUp([mark])` するループに変える。`pnpm verify:web-mcp` は `catch_up valid input did not call catchUp once` で失敗する。writes だけを実行すると `catch_up with a missing id called catchUp 2 times` で失敗する。

元に戻す。次に `commitCatchUp` から、無い id の `RecordNotFound` を外し、見つかった行だけを返す。`pnpm verify:web-mcp` は `a failed catch_up left an earlier row Caught up` で失敗する。回数だけの前半は、この変更では成功したままになる。

どちらも元に戻して、コマンドが成功することを確認する。失敗しなかったら、チェックがそのプロパティを見ていない。プロパティを弱めて通さない。

## 見ていないもの

ブラウザ、`useWebMCP` の再登録、Basic auth、HTTP、本物の Turso、画面の見出し、store 関数の楽観更新、`createServerFn` の呼び出し。iframe の無効化は `pnpm check:fence` が import 順で見る。実行中の `window.__webModelContextOptions` は見ない。
