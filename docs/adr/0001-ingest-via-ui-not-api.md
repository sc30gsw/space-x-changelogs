# Ingest は API ではなく、ユーザーと同じ UI フォームで行う

Entry を登録するのは Grok Bot 上で動く Watcher であり、Watcher は computer use でブラウザを操作できる。
そのため Ingest 用の HTTP API や API キーは用意せず、ユーザーが Entry を手で追加・編集するのと同じフォームを Watcher にも使わせ、Basic 認証もユーザーと同じ ID/パスワードを渡す。
API を作るより Watcher 側の設定が単純で、認証経路も登録画面も1本で済むことを優先した。
フォームのラベルは Watcher が迷わないよう固定の文言にし、Entry の要約・本文は（リッチテキストではなく）素のテキストエリアにする。
