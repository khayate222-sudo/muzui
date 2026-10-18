import {RefreshCw,WifiOff} from 'lucide-react';
import {t} from './i18n';
import './connection.css';
export default function ConnectionNotice({message,busy,retry}:{message:string;busy:boolean;retry:()=>Promise<void>}){
  return <section className="connection-notice" role="status" aria-live="polite"><WifiOff size={20}/><div><strong>{t('接続を確認してください')}</strong><p>{message}</p><small>{t('開いている画面と入力内容を保っています。保存操作は自動でやり直しません。')}</small></div><button className="outline" disabled={busy} onClick={()=>void retry()}><RefreshCw size={16}/>{busy?t('接続を確認中…'):t('もう一度接続する')}</button></section>;
}
