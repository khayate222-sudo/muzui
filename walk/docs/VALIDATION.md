# 検証結果

2026-10-14、Node.js 24 / Linux、システムChromiumを使用。

| 検証 | 結果 |
| --- | --- |
| TypeScript `npm run typecheck` | 成功 |
| ESLint `npm run lint` | 成功 |
| Vitest `npm test` | 11件成功、失敗・スキップなし |
| 本番ビルド `npm run build` | 成功 |
| Playwright `npm run test:e2e` | 3件成功、失敗・スキップなし |
| `npm audit --audit-level=moderate` | 脆弱性0件 |
| `npm run docker:build -- --cloud` | 成功、TLS・integrity検証有効 |
| Dockerコンテナ | HTTP・SQLite native binding・初期25投稿・再起動後のプロフィールと保存保持、最終イメージの実ブラウザ上のマップ移動・投稿閲覧・リアクションを確認 |
| `docker compose config --quiet` | 成功 |

サーバーテストは不透明なCookie、CSRF、管理認可、入力・URL検証、不正Socket認証、タブ重複除外、切断・退出、非公開閲覧者、移動速度制限、保存・リアクションの重複除外、両者同意時のみの共通点、承認前チャット拒否、送信頻度制限、重複メッセージ除外、ブロック後の権限剥奪、通報、管理CRUD、DB再オープンを検証しました。

E2Eは独立した一時DBで**本番ビルド**を起動し、2つのブラウザコンテキストと追加タブを使用。同一投稿2人→同一ゲストの追加タブでも2人→タブ退出後1人、他ユーザーの位置反映、保存・設定のリロード保持、承認・チャット・XSS入力の文字表示・ブロック・通報・管理編集を確認しました。スマートフォンはタップ移動・エリア移動・390pxと320pxの横はみ出しなしを確認しています。

画像は `artifacts/walk-desktop.png`、`walk-mobile.png`、`walk-welcome-mobile.png`、`walk-chat.png`。ローカル生成物のためGit管理対象外です。

**未検証：** 実YouTube動画の再生・実在外部SNSの公式埋め込み・本番公開・新規クラウドタスクへのスナップショット復元・大人数負荷試験。初期YouTubeは設定用サンプルのため、再生成功を示すものではありません。DockerのベースOSの脆弱性スキャンはnpm auditとは別途必要です。
