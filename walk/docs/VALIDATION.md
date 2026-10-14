# 検証結果

2026-10-14、Node.js 24 / Linux、システムChromiumを使用。

| 検証 | 結果 |
| --- | --- |
| TypeScript `npm run typecheck` | 成功 |
| ESLint `npm run lint` | 成功 |
| Vitest `npm test` | 23件成功、失敗・スキップなし（ローカル起動の事前確認3件を含む） |
| 本番ビルド `npm run build` | 成功 |
| Playwright `npm run test:e2e:relay` | 5件成功、失敗・スキップなし。実WebRTC音声はローカルTCP TURN経由 |
| `npm audit --audit-level=moderate` | 前回の基盤検証では脆弱性0件。今回、依存バージョンの変更なし |
| `npm run docker:build -- --cloud` | 前回の基盤検証で成功、TLS・integrity検証有効。今回の追加機能を含むDocker再検証は未実施 |
| Dockerコンテナ（前回の基盤検証） | HTTP・SQLite native binding・初期25投稿・再起動後のプロフィールと保存保持、最終イメージの実ブラウザ上のマップ移動・投稿閲覧・リアクションを確認 |
| `docker compose config --quiet` | 成功 |

サーバーテストは不透明なCookie、CSRF、管理認可、入力・URL検証、不正Socket認証、タブ重複除外、切断・退出、非公開閲覧者、移動速度制限、保存・リアクションの重複除外、両者同意時のみの共通点、承認前チャット拒否、送信頻度制限、重複メッセージ除外、ブロック後の権限剥奪、通報、管理CRUD、DB再オープンを検証しました。

ローカル起動の事前確認では、日本語と空白を含むパス、起動ファイルだけがある不完全な展開、ロックファイルの欠落・不正JSON・別プロジェクトのファイル混在を検証しています。正常なロックファイルは変更しません。Windowsのバッチファイル自体の実機実行は未検証です。

E2Eは独立した一時DBで**本番ビルド**を起動し、2つのブラウザコンテキストと追加タブを使用。同一投稿2人→同一ゲストの追加タブでも2人→タブ退出後1人、他ユーザーの位置反映、保存・設定のリロード保持、承認・チャット・XSS入力の文字表示・ブロック・通報・管理編集を確認しました。スマートフォンはタップ移動・エリア移動・390pxと320pxの横はみ出しなしを確認しています。

追加検証では、ワンタップの次投稿と他ブラウザのアバター移動、実際のカードドラッグと座標保存、ルーム公開・他ユーザーの訪問・非公開化による退出、編集権限・競合、URL正規化・重複除外・登録者以外の削除拒否、パーティ招待と承認、関係のない相手への音声シグナル拒否、ブロック後の音声権限剥奪、旧DBからのマイグレーションと再起動後のデータ保持を確認しました。

音声E2Eはブラウザの本物のRTCPeerConnectionとテスト用マイクを使用し、両ブラウザのinbound audio RTPの受信バイトが増えること、マイクのmute/unmute、音声退出・パーティ退出後のtrack endedを検証しました。システムChromiumには `WebRtcIPHandling=disable_non_proxied_udp` の管理ポリシーがあるため、直接接続テストはICE候補が作れず失敗しました。ポリシーは変更せず、署名検証したDebian coturn 4.6.1をローカルに展開し、TCP TURN中継で全5件を成功させました。テスト用TURNと一時資格情報は `scripts/test-with-turn.mjs` が起動・終了・削除します。実際の人間のマイク音声や別ネットワーク間のNAT越えは未検証です。

画像は `artifacts/walk-next-and-import.png`、`walk-party.png`、`walk-desktop.png`、`walk-mobile.png`、`walk-welcome-mobile.png`、`walk-chat.png`。ローカル生成物のためGit管理対象外です。

**未検証：** 実YouTube動画の再生・実在外部SNSの公式プレーヤーの再生成功・本番公開・新規クラウドタスクへのスナップショット復元・大人数負荷試験。初期YouTubeは設定用サンプルのため、再生成功を示すものではありません。DockerのベースOSの脆弱性スキャンはnpm auditとは別途必要です。
