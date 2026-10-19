import {t} from './i18n';
import { useEffect, useState } from "react";
import { ExternalLink, ShieldCheck, Mail } from "lucide-react";
import type { LegalConfiguration } from "../shared/release";
import { api } from "./api";
import Modal from "./Modal";
export default function Legal({ close }: { close: () => void }) {
  const [config, setConfig] = useState<LegalConfiguration | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    void api<LegalConfiguration>("/public/legal")
      .then(setConfig)
      .catch((e) => setError(e.message));
  }, []);
  return (
    <Modal title={t("WALKについて・利用ルール")} close={close}>
      <div className="legal-panel">
        <span className="account-symbol">
          <ShieldCheck size={26} />
        </span>
        <h2>{t("安心して、好きな世界へ。")}</h2>
        {error && <p role="alert">{error}</p>}
        {!config && !error && <p>{t("案内を読み込んでいます…")}</p>}
        {config && (
          <>
            {!config.ready && (
              <p className="development-notice">{t("開発版の案内です。運営者情報と正式な規約は公開前に確定します。")}</p>
            )}
            <section>
              <h3>{t("WALKの基本ルール")}</h3>
              <p>{t("他の人の権利とプライバシーを尊重してください。嫌がらせ、なりすまし、無断転載、違法な投稿や取引は禁止です。権利を持つ写真・動画や、共有が許可されたリンクを投稿してください。")}</p>
              <p>{t("困った投稿や人は通報・ブロックできます。チャットは双方が承認した相手とだけ行えます。")}</p>
            </section>
            <section>
              <h3>{t("公開するものは、自分で選ぶ")}</h3>
              <p>{t("公開投稿は他の利用者が閲覧でき、招待リンクで共有できます。閲覧者の名前・アバター・リアクションは、閲覧アクティビティの公開に同意した人だけに表示します。非公開の人も、開いている投稿の匿名人数には含まれます。")}</p>
              <p>{t("同期視聴は別の同意が必要です。参加すると名前・アバターをそのグループ内で表示し、ホストの動画再生に合わせます。通常の閲覧公開設定は変わりません。いつでも退出して個別視聴へ戻れます。")}</p>
              <p>{t("友達への場所の招待では、送信者の名前と選んだ行き先を相手に表示します。受け取った人が確認してから移動し、現在地を継続して共有しません。招待は一時的なもので、10分で終了します。")}</p>
              <p>{t("足あとと現実の活動は非公開が基本です。共有すると名前・活動・メモ・添付写真を他の利用者が閲覧できます。活動の時刻は自己申告で、実際の活動を証明しません。GPSによる追跡は行いません。")}</p>
            </section>
            <section>
              <h3>{t("保存するデータ")}</h3>
              <p>{t("プロフィール、投稿と選んだ画像・動画、保存・リアクション、交流・メッセージ、活動と足あとをサーバーへ保存します。登録時はログインIDと、ハッシュ化したパスワード・復旧コードも保存します。パスワードや復旧コードの原文は保存しません。")}</p>
              <p>{t("建築と保存履歴、コイン・チップの記録、入手した素材、依頼と提出内容、遊びの結果も保存します。公開ルームの建築と募集した依頼は他の利用者に表示し、提出内容は依頼主と参加者だけに表示します。")}</p>
              <p>{t("チャットはエンドツーエンド暗号化ではありません。音声参加は自分でマイクを許可した時だけ開始し、退出・アプリの背景移動でマイクを止めます。音声の録音機能はありません。")}</p>
              <p>{t("YouTube・TikTokなどの埋め込みを開くと、そのサービスと通信します。各サービスの規約・プライバシー方針も適用されます。外部サービスの通信情報をWALKが管理するものではありません。")}</p>
            </section>
            <section>
              <h3>{t("自分の記録を管理する")}</h3>
              <p>{t("アカウント設定で自分のデータをJSON形式で取得できます。写真・動画のファイルはJSONには含まれないため、必要なものは別途保存してください。復旧コードは他の人へ渡さず、自分で安全に保管してください。")}</p>
              <p>{t("アカウント削除では、投稿・保存・足あと・個人ルーム・添付ファイルと、そのユーザーを含むチャット・交流関係を削除します。相手のチャット画面からも該当する会話が消えます。オフラインのバックアップに含まれるデータの保管期間と削除手順は正式なプライバシー案内で説明します。")}</p>
            </section>
            <section>
              <h3>{t("運営とお問い合わせ")}</h3>
              <p>{config.operator || t("運営者名：公開前に設定")}</p>
              {config.supportEmail ? (
                <a
                  className="source-link"
                  href={"mailto:" + config.supportEmail}
                >
                  <Mail size={16} />
                  {config.supportEmail}
                </a>
              ) : (
                <p>{t("問い合わせ先：公開前に設定")}</p>
              )}
              {config.termsUrl && (
                <a
                  className="source-link"
                  href={config.termsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >{t("利用規約")}<ExternalLink size={15} />
                </a>
              )}
              {config.privacyUrl && (
                <a
                  className="source-link"
                  href={config.privacyUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >{t("プライバシーポリシー")}<ExternalLink size={15} />
                </a>
              )}
              <small>{t("案内のバージョン：")}{config.policyVersion}</small>
            </section>
          </>
        )}
      </div>
    </Modal>
  );
}
