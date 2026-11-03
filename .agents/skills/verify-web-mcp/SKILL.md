---
name: verify-web-mcp
description: Check that each Web MCP tool calls one changelog write door, and that a bad input calls none. Use when changing runBotTool, botToolSpecs, BotTools, or scripts/verify-web-mcp.ts.
---

# Web MCP の書き込み口

ページに載る Web MCP ツールは、画面と同じ 7 つの書き込み関数を 1 回だけ呼ぶ。壊れた入力はどの関数も呼ばない。`catch_up` は印の配列を 1 回の `catchUp` に渡す。`list_workspace` は読み込み済みの行を返し、何も書かない。ここが壊れると、ボットが画面と別の書き込み口を通り、無い id の Caught up が途中の行だけを Caught up にし、拒否した入力が行を変える。

TypeScript を対象にした検証器はリポジトリにない。このチェックは `runBotTool` そのものを、扉の代わりに呼び出しを数える関数へ、決まった入力で実行する。画面の見出しと `document.modelContext` への登録はブラウザで見る。原文 URL と Caught up の巻き戻しは `verify-entry-url-identity` と `verify-entry-lifecycle` が、本物の `commitIngest` と `commitCatchUp` に対して見る。これは TLA+ のモデルではない。`/statechart` は使わない。

## Run

```bash
pnpm verify:web-mcp
```

成功すると `web mcp: 8 tools, 4 rejected inputs each, one door per write, held` と出て、終了コードは 0 である。失敗は標準エラーの 1 行で、終了コードは 1 である。依存はリポジトリの `tsx` だけである。

## Coverage

Sync commit: `c394877802edff07fd204839e996a352e731ffba`

このコミットで、チェックが次の実装をそのまま呼んでいることを確認した。対象ファイルがこのコミットより後に変わっていたら、先に `pnpm verify:web-mcp` を実行し、チェックがまだその実装を説明していると確認してから sync commit を進める。ずれを戻すときは `/maintain-formal-verification-skill` を使う。

| ファイル | 関数 |
| --- | --- |
| `src/features/bots/utils/bot-tools.ts` | `botToolSpecs`, `runBotTool` |
| `src/features/bots/components/bot-tools.tsx` | `BotTools`, `BotTool` |
| `scripts/verify-web-mcp.ts` | 拒否入力、1 回の扉、登録ファイルと経路の確認 |

`runBotTool` は `door` が `null` のとき読み取り結果だけを返す。書き込みは `switch` の 1 枝が、対応する扉を 1 回呼ぶ。`ingest_entry` は id が無いとき id を作らない。`save_track`、`save_source`、`save_memo` は id が無いとき渡された `createId` を 1 回使う。`BotTools` は `botToolSpecs` を `useWebMCP` に渡し、`execute` は `runBotTool` だけを呼ぶ。

## Bounds

- ツールは 8 個。名前は一意。読み取りは `list_workspace` だけ。
- 書き込みの扉は `ingestEntry`、`catchUp`、`saveTrack`、`saveSource`、`saveMemo`、`removeEntries`、`removeMemos`。各扉はツール 1 個で、`readOnly` は false。
- 拒否する形は `null`、`[]`、`"no"`、`{ extra: true }`。各書き込みは、必須項目を 1 つ消したオブジェクトも拒否する。
- 妥当な入力はツールごとに 1 つ。`catch_up` の印は 2 件で、呼び出し引数の長さは 2。
- `save_track` が id を省略すると、渡した `createId` の `generated-id` を 1 回使う。id を渡すとその文字列を残す。
- `ingest_entry` が id を省略すると、扉へ渡すオブジェクトに id は無い。
- 扉が `UNIQUE constraint failed` を投げると、呼び出しは 1 回で、戻り値の `error` はその文である。
- `bot-tools.tsx` の `runBotTool(` は 1 箇所。扉名に `(` を付けた呼び出しは 0。
- `src/app/routes` は `__root.tsx`、`entries`、`index.tsx`、`manage.tsx`、`tracks`。`src/app/start.ts` に `mcp` と `modelContext` は無い。

これはこの入力の集合で、`runBotTool` の戻り値と扉の呼び出し回数が一致することである。すべての文字列ではない。ブラウザの登録タイミングでもない。

## 壊し方

`catch_up` の `doors.catchUp(parsed.marks)` を、印ごとに `doors.catchUp([mark])` するループに変える。`pnpm verify:web-mcp` は `catch_up valid input did not call catchUp once` で失敗する。同じ変更で `pnpm verify:lifecycle` は `a failed bot catch_up left an earlier row Caught up` で失敗する。

元に戻して、両方のコマンドが成功することを確認する。失敗しなかったら、チェックが 1 回の `catchUp` を見ていない。プロパティを弱めて通さない。

## 見ていないもの

ブラウザ、`useWebMCP` の再登録、Basic auth、HTTP、本物の Turso、画面の見出し。`ingest_entry` が同じ URL の id と Caught up を残すことは `verify-entry-url-identity` が見る。
