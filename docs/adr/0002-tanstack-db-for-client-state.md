# クライアント側のデータは TanStack DB のコレクションで持つ

単一ユーザーのアプリなので、TanStack Start の route loader + server function だけでも画面は作れる。
それでも TanStack DB（採用時点で 1.0 RC）を入れたのは、Spotlight の横断検索をメモリ上の全 Entry に対して走らせたいのと、Caught up のトグルや Unread バッジを楽観的更新で即時に反映したいからである。
サーバー側の Turso アクセスは Drizzle を Effect サービスとして包んだ層が担い、TanStack DB のコレクションは server function を呼ぶだけなので、クライアント層を外したくなっても サーバー層はそのまま残せる。
