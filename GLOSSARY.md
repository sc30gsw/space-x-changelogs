# SpaceX Changelogs

SpaceXAI 関連のプロダクトの更新情報を、Grok Bot 上の Watcher が集めて登録し、ユーザー（1人）が UI でキャッチアップしてメモを残すためのアプリ。

## Language

### 追跡対象

**Track**:
追いかける対象のプロダクト。現時点では Cursor・Grok Bot・pstack の3つ。
_Avoid_: スタック, Stack, Product, Target

**Source**:
ある Track の情報を得るために参照する個々の URL（changelog ページ、X アカウント、GitHub リポジトリなど）。
_Avoid_: 参考URL, Reference, Feed

**Watcher**:
Track を監視し、更新を見つけたら Entry を Ingest するエージェント。Grok Bot 上に Track ごとに1体ある（Cursor Changelog / Grok Bot Changelog / pstack Watch）。
_Avoid_: Bot（Track の「Grok Bot」や Bot Template と紛らわしい）, Agent, Crawler

### 取り込み

**Entry**:
Track について登録される情報の最小単位。原文 URL で同一性を判断し、同じ URL の Entry は1つしか存在しない。
_Avoid_: Item, Update, Changelog（Cursor 固有のニュアンスが強い）, 記事

**Ingest**:
Watcher が Entry をアプリに登録する行為。
_Avoid_: 登録, Import, Sync, Post

**Release**:
Entry の種類。changelog の1項目（Cursor changelog / Grok Bot changelog）。
_Avoid_: Changelog, Version, リリースノート

**X Post**:
Entry の種類。X の投稿1本（@cursor_ai / @bot など）。
_Avoid_: Post, Tweet, ツイート

**Bot Template**:
Entry の種類。Bot Marketplace に並ぶボット、または X で共有されたボット（`https://x.ai/bot/<id>`）1つ。
_Avoid_: Marketplace Bot, Bot, ボット

**Pull Request**:
Entry の種類。`cursor/plugins` の `pstack/` 配下を変更した PR 1件。
_Avoid_: PR, Commit, コミット

### キャッチアップ

**Memo**:
ユーザーが Entry に対して書き残す、学びや所感。1つの Entry に複数付けられる。
_Avoid_: Note, Comment, コメント, 感想

**Unread**:
ユーザーがまだ目を通していない Entry の状態。Ingest 直後の Entry は常にこの状態。
_Avoid_: 未読, New

**Caught up**:
ユーザーが目を通した Entry の状態。Entry が上書き更新されても維持される。
_Avoid_: Read（動詞と紛らわしい）, 既読, Done
