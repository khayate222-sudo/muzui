import {useEffect,useRef,useState} from 'react';
import {Copy,Link2,Share2} from 'lucide-react';
import type {Bootstrap} from '../shared/model';
import {watchLinkUrl,type WatchLinkPreview} from '../shared/watch-links';
import {api} from './api';
import {shareInvitation,shareOrigin} from './sharing';
import Modal from './Modal';
import Avatar from './Avatar';

export type CreatedWatchLink={token:string;expiresAt:number};
export function HostWatchLink({value,change,title}:{value:CreatedWatchLink|null;change:(link:CreatedWatchLink|null)=>void;title:string}){
  const [consent,setConsent]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[status,setStatus]=useState('');
  const input=useRef<HTMLInputElement>(null),url=value?watchLinkUrl(shareOrigin(),value.token):'';
  useEffect(()=>{if(!value)return;const timer=setTimeout(()=>{change(null);setConsent(false);setStatus('招待の期限が切れました。内容を確認して、新しいリンクを作れます。');},Math.max(0,value.expiresAt-Date.now()));return()=>clearTimeout(timer);},[value,change]);
  async function create(){setBusy(true);setError('');setStatus('');try{change(await api<CreatedWatchLink>('/watch-links','POST',{consent:true}));}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
  async function revoke(){if(!value)return;setBusy(true);setError('');try{await api('/watch-links/'+value.token,'DELETE');change(null);setStatus('リンクを取り消しました');}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
  return <section className="watch-link-share"><h3><Link2 size={18}/>初めての友達も、この時間へ。</h3><p>15分間の招待リンク。相手が交流を申し込み、あなたが承認して同期視聴に誘います。相手の参加同意も必要です。</p>{!value?<><label className="watch-link-consent"><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)}/><span>リンクを持つ人に、自分の名前・アバターと動画のタイトルを見せる</span></label><button className="outline full" disabled={busy||!consent} onClick={()=>void create()}>初めての友達へのリンクを作る</button></>:<><label>一緒に見る招待リンク<input ref={input} aria-label="一緒に見る招待リンク" value={url} readOnly onClick={e=>e.currentTarget.select()}/></label><p className="fineprint">{new Date(value.expiresAt).toLocaleTimeString('ja',{hour:'2-digit',minute:'2-digit'})}まで。ホストが同期視聴を終えると無効になります。</p>{['localhost','127.0.0.1','[::1]'].includes(new URL(url).hostname)&&<p className="fineprint">このリンクはこの端末用です。別の端末への招待には公開サーバーのURLが必要です。</p>}<div className="feature-buttons"><button className="outline" onClick={()=>void navigator.clipboard.writeText(url).then(()=>setStatus('リンクをコピーしました')).catch(()=>{input.current?.focus();input.current?.select();setStatus('リンクを選択しました。コピーして送れます。');})}><Copy size={16}/>コピー</button><button className="primary" onClick={()=>void shareInvitation(title,url).then(result=>{if(result!=='cancelled')setStatus(result==='copied'?'リンクをコピーしました':'共有メニューを開きました');}).catch(()=>setError('共有できませんでした。リンクをコピーして送れます。'))}><Share2 size={16}/>共有する</button><button className="text-button" disabled={busy} onClick={()=>void revoke()}>この招待リンクを取り消す</button></div></>}{status&&<p role="status">{status}</p>}{error&&<p role="alert">{error}</p>}</section>;
}

export default function WatchLinkLanding({token,data,connected,refresh,open,close}:{token:string;data:Bootstrap;connected:boolean;refresh:()=>Promise<Bootstrap>;open:(preview:WatchLinkPreview)=>Promise<void>;close:()=>void}){
  const [preview,setPreview]=useState<WatchLinkPreview|null>(null),[error,setError]=useState(''),[previewError,setPreviewError]=useState(''),[consent,setConsent]=useState(false),[busy,setBusy]=useState(false);
  const mounted=useRef(true);
  useEffect(()=>{let active=true,generation=0;mounted.current=true;const load=()=>{const request=++generation;void api<WatchLinkPreview>('/watch-links/'+token).then(p=>{if(active&&request===generation){setPreview(p);setPreviewError('');}}).catch(e=>{if(active&&request===generation){setPreview(null);setPreviewError(e.message);}});};load();const timer=setInterval(load,5000);return()=>{active=false;mounted.current=false;clearInterval(timer);};},[token]);
  const friendship=data.friendships.find(f=>f.user.id===preview?.from.id),incoming=friendship?.status==='pending'&&friendship.receiverId===data.user.id;
  const self=preview?.from.id===data.user.id,outgoing=friendship?.status==='pending'&&!incoming;
  async function proceed(){if(!preview)return;setBusy(true);setError('');try{
    const current=await api<WatchLinkPreview>('/watch-links/'+token);
    if(!mounted.current)return;
    if(incoming)await api('/friendships/'+friendship!.id,'PATCH',{action:'accept'});
    else if(!friendship)await api('/friendships','POST',{targetId:current.from.id});
    if(!mounted.current)return;await refresh();if(mounted.current)await open(current);
  }catch(e){if(mounted.current)setError((e as Error).message);}finally{if(mounted.current)setBusy(false);}}
  return <Modal title="友達と一緒に見る招待" close={close}><div className="watch-link-landing"><p className="eyebrow">A LITTLE TIME TOGETHER</p><h2>同じ一本を、<br/>同じ時間に。</h2>{preview?<><div className="watch-link-person"><Avatar color={preview.from.color} style={preview.from.style}/><div><strong>{preview.from.displayName}</strong><p>この動画で待ち合わせ</p></div></div><h3>{preview.post.title}</h3><ol><li>交流を申し込む・承認する</li><li>招待者が同期視聴へ誘う</li><li>内容に同意して、一緒に見る</li></ol>{self?<p>これはあなたの招待リンクです。友達に送ってください。</p>:<><p>{friendship?.status==='accepted'?'交流は承認済みです。動画を開いて、同期視聴の招待を待てます。':incoming?'招待者から届いた交流リクエストを承認して、動画へ進めます。':outgoing?'交流の申込みは送信済みです。動画を開いて承認を待てます。':'動画を開く前に、招待者へ交流リクエストを送ります。相手の承認が必要です。'}</p><label className="watch-link-consent"><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)}/><span>{data.user.displayName}の名前・アバターを招待者に見せ、{incoming?'交流を承認する':friendship?.status==='accepted'||outgoing?'この動画を開く':'交流を申し込む'}ことに同意する</span></label><button className="primary full" disabled={!consent||busy||!connected} onClick={()=>void proceed()}>{busy?'確認しています…':friendship?.status==='accepted'?'動画を開いて招待を待つ':incoming?'交流を承認して動画へ':outgoing?'動画を開いて承認を待つ':'交流を申し込んで動画へ'}</button></>}<p className="fineprint">この確認だけで動画は開きません。同期視聴やマイクを自動で開始せず、通常の閲覧公開設定も変えません。</p></>:!error&&!previewError&&<p role="status">招待の内容を確認しています…</p>}{(error||previewError)&&<p className="watch-link-error" role="alert">{error||previewError}</p>}</div></Modal>;
}

export function WatchLinkWaiting({name,accepted,close}:{name:string;accepted:boolean;close:()=>void}){
  return <section className="watch-link-waiting" role="status"><strong>{accepted?'交流は承認済みです。同期視聴の招待を待てます。':'交流の承認を待っています。'}</strong><p>{name}が同期視聴に誘うと、参加の確認が届きます。今は自分のペースで動画を見られます。</p><button className="text-button" onClick={close}>この案内を閉じる</button></section>;
}
