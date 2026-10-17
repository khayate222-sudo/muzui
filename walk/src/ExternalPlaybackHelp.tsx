import {t} from './i18n';
import {RefreshCw,Flag,ExternalLink} from 'lucide-react';

export default function ExternalPlaybackHelp({url,provider,retry,report}:{url:string;provider:string;retry:()=>void;report?:()=>void}){
  return <details className="playback-help"><summary>{t("再生できないとき")}</summary><p>{t("中央の再生ボタンを押しても始まらない場合は、読み直すか元のSNSでお試しください。通信・ログイン・地域・公開設定によって見られないことがあります。")}</p><div><button className="outline" onClick={retry}><RefreshCw size={16}/>{t("プレーヤーを読み直す")}</button><a className="outline" href={url} target="_blank" rel="noopener noreferrer"><ExternalLink size={16}/>{provider}{t("で試す")}</a>{report&&<button className="outline" onClick={report}><Flag size={16}/>{t("再生の問題を知らせる")}</button>}</div><small>{t("読み直すと再生位置が最初に戻ります。報告の内容は運営が確認します。")}</small></details>;
}
