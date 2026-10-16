# 外部SNSの投稿をWALKへ持ち込む方法

作成日：2026-10-17（日本時間）。対象コード：`a91ba22`。

## この資料の確認範囲

WALKの現在のコードは確認した。外部の公式資料はこの環境から接続を試みたが、YouTubeの資料はプロキシの403、他の資料も通信制限・接続エラーで取得できなかった。この資料は既知の公式連携方式を整理した開発候補で、2026年10月時点の料金・審査・権限をオンラインで再確認した調査結果ではない。リンク先の提供元資料で最終確認する。各サービスに対する実取得・実再生を今回成功したとは扱わない。

## 「取ってくる」の三つの意味

1. **URLを登録し、公式埋め込みを表示する。** メディア本体は元のサービスから配信される。WALK側では投稿の場所、実際に見ている人、感想・交流を提供する。最初の拡張に適する。
2. **APIや公式フィードで新着の情報を取得する。** 投稿ID、URL、題名、投稿者等を、認められた範囲で取得する。APIが返す情報、保存期間、権限、取得枠はサービスごとに異なる。誰かのおすすめ欄や非公開投稿を自由に取得できるという意味ではない。
3. **動画ファイルをWALKへ保存して配信する。** 埋め込みやAPI利用とは別。投稿者の提供・ライセンスとサービスの条件を確認した素材だけを対象にする。公開投稿であることだけを根拠に複製・再配信しない。

## サービス別の候補

「埋め込み」は公開され、投稿者が埋め込みを許可し、地域・年齢・ログイン等の条件を満たす投稿が対象。利用できないときは元投稿へのリンクへ戻す。

| サービス | 入口と取得方法 | WALKでの使い道・制約 |
| --- | --- | --- |
| YouTube／Shorts | URL＋公式IFrame。Data APIで動画・チャンネルの情報、アップロード一覧等。既存のAtomフィード実装もある | 最初の動画供給源。登録チャンネルを中心に収集し、公式プレーヤーで再生。APIのキー・割当・データ保存条件、埋め込み可否を確認。Shortsも動画IDを持つが、縦表示を別途検証する |
| Instagram／Reels | 公開投稿の公式埋め込み／oEmbed。アカウント連携はInstagram Platformの対応する認証・権限を使う | 作家の制作・日常・作品展示に合う。APIは主に認証したプロアカウントを中心とする仕組みで、一般ユーザーの全投稿やExploreを横断取得する前提にしない。審査・権限・現行oEmbed条件は再確認が必要 |
| TikTok | URL＋公式Embed Player。Display APIは利用者が認証・許可したアカウントのプロフィール・動画等 | 短い動画に合う。「おすすめ」の自由な自動収集とは区別する。Research APIは研究用途の資格・条件があり、一般の商用WALKの収集手段として前提にしない |
| X | 投稿URL＋公式埋め込み。検索・投稿情報はX APIの利用範囲・プランによる | ゲーム・アニメの公式告知や会話の入口。動画本体を抽出して独自プレーヤーへ入れる方式にはしない。現行のAPI料金・取得枠は未確認 |
| Bluesky | 公開投稿の公式埋め込み、AppView／AT Protocolの公開投稿・投稿者フィード等 | イラスト・作品・海外の趣味コミュニティの候補。多くの公開読み取りAPIは認証なしで利用できるが、実際のエンドポイント・制限と動画の表示方法を確認する。APIが公開されていても作品の再配信許諾を意味しない |
| Mastodon | サーバーごとのREST API、公開タイムライン、投稿者の公開投稿、投稿の埋め込み等 | 趣味のサーバーと相性がよい。世界共通の全投稿一覧を取る仕組みではない。サーバーの設定によって認証や取得範囲が異なる |
| Reddit | 投稿の公式埋め込み。Data APIによるコミュニティ・投稿情報 | ゲーム・アニメなどの話題発見に合う。商用API利用は承認・契約等の確認が必要で、無料の大量収集を前提にしない |
| Twitch | ライブ・VOD・クリップの公式プレーヤー。Helix APIで対応する情報 | ゲーム世界の観戦に合う。認証・parentドメイン指定・モバイルの再生条件等を確認。ライブとVODの同期を同じ方式と考えない |
| Vimeo | 公式プレーヤー、oEmbed、認証したアカウント等のAPI | クリエイターによる短編・制作映像の候補。投稿者の公開範囲・埋め込み先の制限・契約プランを確認 |
| Dailymotion | 公式プレーヤー／SDK、Platform API | 動画供給源の追加候補。公開条件、商用の利用条件と提供枠を確認 |
| PeerTube | インスタンスごとの公開動画APIと公式プレーヤー | 参加を希望する動画コミュニティとの連携候補。インスタンスの運用条件と各動画のライセンスを確認。ソフトがオープンソースであることと、動画を再配信できることは別 |
| Pinterest／Tumblr | Pin・投稿の公式埋め込み、権限に応じたAPI | イラスト・部屋づくり・作品への入口。主に画像・投稿の発見用途。APIで全体のおすすめを自由に取得する前提にしない |

中国圏にもbilibili、抖音（Douyin）、快手、小紅書、微博などがある。TikTokと抖音は同じ連携で扱わない。これらは公開リンクを入口にする候補として挙げる段階で、対応可能なSDK・契約・地域要件を調べる前に、自動収集やWALK内再生を約束しない。

## WALKで現在できること

- `shared/community.ts`：YouTube、TikTok、XのURLの形式を検査し、正規化する。Instagram等は未対応。
- `server/community.ts`：URLと利用者が入力した題名・作者等を投稿として保存。URL登録が自動メタデータ取得を意味するわけではない。
- `src/PostMedia.tsx`：YouTubeは公式のプライバシー強化モードのIFrame、TikTokは公式Embed Player。Xは元の投稿を開くリンク。Instagram等の埋め込みは未実装。
- `server/collector.ts`：登録したYouTubeチャンネルのAtomフィードを定期取得し、重複除外・公開前確認へ送る。実YouTubeからの取得成功は以前から未確認で、今回も成功扱いにしない。
- `shared/discovery.ts`：同期視聴はWALKの直接投稿動画と同梱オリジナル映像だけ。YouTube・TikTok等を同じ投稿で見ていても、現在は個別再生。
- `server/app.ts`：外部フレームの許可先も現在はYouTubeとTikTokだけ。新しいサービスはURL判定だけ追加しても表示できない。

## 同期視聴の扱い

公式埋め込みができることと、同期視聴ができることは別。YouTube IFrame Player APIには再生・停止・シーク・時刻取得等があり、将来の同期の検証候補になる。ほかもプレーヤーAPIや対応するメッセージ機能の提供範囲に応じて検討する。通常の投稿埋め込みには再生操作を提供しないものもある。

同期にはサービス条件、広告、年齢制限・地域制限、認証、各端末の自動再生制限、再生できない参加者の表示を含めて検証する。単に映像のURLを抽出したり、広告を消したり、他の人の画面を再配信したりすることを、公式連携の代わりにしない。外部動画の視聴に通貨を付ける構想も、対象サービスの条件を確認してから別途設計する。

## 実装する順番の提案

1. **YouTubeの実取得を確かめる。** 公開HTTPS環境で、運営が選んだ少数の公式・協力クリエイターのチャンネルを取得し、出典・埋め込み可否・削除時の挙動を確認する。フィードだけで足りない情報はData APIを検討する。未確認のURLを再生可能な実績として数えない。
2. **共通のURL登録を整える。** 「URLを貼る→プレビュー→世界を選ぶ→配置」。提供元・投稿ID・元URLと、取得根拠・必要な確認日時を持つ。現在対応するYouTube／TikTokの表示を固め、InstagramとBluesky等を段階的に追加する。Xは元投稿リンクを維持し、公式埋め込みを別途検証する。
3. **本人が連携したアカウントの新着を取り込む。** 対応サービスのOAuthと権限を使う。APIトークンをクライアントや共有URLに出さず、期限・解除・削除・重複・取得失敗を扱う。検索APIやおすすめ欄の横断収集とは分ける。
4. **同期は対応する公式プレーヤーごとに検証する。** まずYouTubeを候補に、公開HTTPS上のWebと両OS実機で確認する。無理なものは個別再生とし、WALK内で同じ場所にいること・会話できることに価値を置く。

外部の再生回数・フォロワー数と、WALKで実際に開いている人数は別に扱う。公開同意のあるWALKの閲覧者だけを名前付きで表示する。外部投稿を読み込めなくてもWALKの移動や交流を止めず、元投稿を開けるようにする。

## 提供元の参照先（今回、本文のオンライン取得は未完了）

- YouTube：[Data API](https://developers.google.com/youtube/v3)、[IFrame Player API](https://developers.google.com/youtube/iframe_api_reference)、[開発者ポリシー](https://developers.google.com/youtube/terms/developer-policies)
- Instagram：[Instagram Platform](https://developers.facebook.com/docs/instagram-platform/)、[oEmbed](https://developers.facebook.com/docs/instagram-platform/oembed/)
- TikTok：[Embed Player](https://developers.tiktok.com/doc/embed-player/)、[Display API](https://developers.tiktok.com/doc/display-api-overview/)、[Research API](https://developers.tiktok.com/products/research-api/)
- X：[埋め込み投稿](https://developer.x.com/en/docs/twitter-for-websites/embedded-tweets/overview)、[開発者資料](https://docs.x.com/)
- Bluesky：[投稿の埋め込み](https://docs.bsky.app/docs/advanced-guides/embedding)、[API](https://docs.bsky.app/docs/category/http-reference)
- Mastodon：[公開タイムライン](https://docs.joinmastodon.org/methods/timelines/)、[投稿者](https://docs.joinmastodon.org/methods/accounts/)
- Reddit：[開発者向け案内](https://www.redditinc.com/policies/developer-terms)、[Data API条件](https://www.redditinc.com/policies/data-api-terms)
- Twitch：[埋め込み](https://dev.twitch.tv/docs/embed/)、[API](https://dev.twitch.tv/docs/api/)
- Vimeo：[開発者向け案内](https://developer.vimeo.com/)
- Dailymotion：[開発者向け案内](https://developers.dailymotion.com/)
- PeerTube：[API](https://docs.joinpeertube.org/api-rest-reference.html)
- Pinterest：[開発者向け案内](https://developers.pinterest.com/)
- Tumblr：[API](https://www.tumblr.com/docs/en/api/v2)

これは連携方式の検討資料。外部アカウントへの接続、APIの契約、投稿の公開、自動収集の開始、アプリの機能変更は行っていない。
