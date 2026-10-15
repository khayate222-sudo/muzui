# iOS / Androidアプリ

WALKはCapacitor 8.5.3を使い、既存React / Phaserの画面をiOS・Androidアプリへ組み込みます。PWAを主な配布方法にはしません。ルートの別サイトはアプリに組み込みません。

## 現在あるもの

- `android/`: Android Studio / Gradleのプロジェクト。Java 21、SDK 36、最小SDK 24。
- `ios/`: XcodeのプロジェクトとSwift Package構成。iOS 15以上。
- `capacitor.config.ts`: アプリ名WALK、アプリID `com.khayate222.walk`、ローカルに同梱する `dist`。
- WALKのアイコン、スマホの固定地図・下部ナビ・視聴シート、ノッチ余白、キーボードの表示切替。
- Androidの戻る操作は最前面の画面を閉じ、閉じる画面がない場合はアプリを裏へ回します。
- アプリがバックグラウンドになるとSocket接続と閲覧状態を終了し、マイクを止めます。戻ると再接続します。現実の活動の分身はサーバーの終了時刻まで残ります。
- 認証はサーバー発行のランダムなゲストトークン。iOSのKeychain / Androidの暗号化ストレージを使い、localStorageやビルド内に資格情報を保存しません。APIは認証付きネイティブHTTP、Socket.IOは認証付きWebSocket。許可するWebViewのOriginは `capacitor://localhost` / `https://localhost` に限定します。
- 非公開の足あと写真は認証付きで取得します。公開用media URLに私的な写真や認証トークンを埋め込みません。

## 必須の公開サーバー

スマホにAPIやSQLiteサーバーを同梱する構成ではありません。ネイティブ版はインターネットから到達できる **WALKのHTTPSバックエンド** が必要です。既存の静的サイト公開先だけではWALKのAPI・WebSocket・DBを動かせません。

ビルド前に `VITE_WALK_SERVER_URL` にWALKバックエンドのHTTPSオリジンを設定します。これは公開情報で、秘密情報ではありません。パス・認証情報を含むURL、localhost、HTTPの接続先はリリース用として拒否します。`server.url` で任意の外部ページを表示するだけのラッパーにはしていません。

`.env` は既存内容を残し、必要な変数を追加してください。`APP_ORIGIN` はサーバーの通常のWeb画面のHTTPSオリジン、`COOKIE_SECURE=true` はWeb用の設定です。ネイティブはブラウザのクロスサイトCookieに依存しません。

現在のタスクでは公開バックエンドのURLが決まっていません。`native:sync` は接続先未設定でもソース同期の検証が可能ですが、そのまま配ると接続の準備画面が出ます。利用できるストア版が完成したことを意味しません。

## ビルド手順

```sh
cd walk
npm ci
# .envに実際のVITE_WALK_SERVER_URLを設定してから
npm run native:release:sync
npm run native:android
# macOSとXcodeがある場合
npm run native:ios
```

`native:release:sync` は公開HTTPS接続先を確認し、本番WebビルドとCapacitorの同期を行います。Android StudioではデバイスでRun、配布用には署名付きApp Bundleを作成します。iOSはmacOS / XcodeでSigning Teamを選び、実機RunとArchiveを行います。ストアのアプリIDが利用可能であることを確認し、変更時はCapacitor設定と両プラットフォームのIDをそろえてください。

アイコンを変更した場合は `node scripts/generate-native-icons.mjs` で自作SVGから画像を生成できます。この補助手順はPlaywrightとChromiumを使います。通常の利用者は実行不要です。

## データと権限

ネイティブ版とWeb版は現状別のゲストです。WebのゲストCookieを自動でアプリに移したり、新しい端末で記録を復元するアカウント認証はまだありません。ネイティブのセッションは30日です。期限切れ・不正なトークンで別ゲストを黙って作ることはせず、既存記録を保護したまま接続エラーにします。ストアの継続運用前にアカウントと復旧の仕様を決める必要があります。

写真・動画は利用者が選んだファイルをアップロードします。マイクは招待への同意後に音声参加を選んだ時だけ使用します。GPSやバックグラウンドでの録音は行いません。署名キー・ストア資格情報・管理者キー・DB・投稿・`.env` はGitに入れません。

## ストア配布に進む前の残り

- 公開HTTPSバックエンドを用意して実際のURLを設定する。
- Android / iPhone実機で認証、WebSocket、ファイル選択、私的な写真、音声の許可と終了を確認する。
- 継続ログイン・アカウント復旧を設計する。
- Apple Developer / Google Play Consoleと署名、ストア表示とプライバシー・データの申告を用意する。

今回、ストアへの提出や公開は行っていません。Linux上ではiOSのコンパイル・署名・実機動作を確認できません。

## 今回確認した範囲

- 型チェック・lint、ユニット43件、本番Webビルド: 成功。
- ブラウザワークフロー11件: 全件成功。建物の屋根・側面・看板、ズーム後の投稿・アバター、マウス／タッチ、モバイル、複数ユーザー、既存交流・投稿・活動を含みます。WebRTCはループバックTURNを使って実音声を検証しています。
- 建物の基礎・足元と追加の判定修正後に、マウス／タッチの2件を再検証し成功。
- `npm run native:sync`: AndroidとiOSのネイティブプロジェクトへの素材・プラグイン同期が成功。
- Android SDK 36 / JDK 21で `:app:assembleDebug`: 成功。デバッグAPKを生成しました。公開URL未設定のため、接続できるリリースAPKとして配布していません。
- 未設定の接続先を `native:release:sync` が拒否することを確認。iOSのコンパイル／署名／実機、ネイティブ実機でのHTTP・WebSocket・写真・マイク動作、ストア提出は未実施です。

ブラウザのタッチ検証やAPKのビルド成功を、Android / iPhone実機のすべての動作が確認できた結果とは扱いません。

## 共有機能の追加

Capacitor Share 8.0.3をiOS・Androidに同期しました。世界・投稿へのHTTPS招待リンクを標準共有シートへ渡します。リンクの受信と確認画面はブラウザで利用できます。Universal Links / Android App Linksによるアプリ直接起動は未実装です。公開ドメインと署名・関連付けファイルの設定が必要です。今回のクラウド検証では実機上の共有シートは確認していません。
