import {t,getLocale} from './i18n';
import {useEffect,useRef,useState} from 'react';
import {ArrowRight,Armchair,Bookmark,Home,Play} from 'lucide-react';
import type {Bootstrap,Post} from './model';
import type {Room} from '../shared/community';
import {discoverableVideo} from '../shared/discovery';
import {starterShort,shortPoster} from '../shared/starter-shorts';
import {api} from './api';
import Modal from './Modal';

export function SoloWelcome({open}:{open:()=>void}){
  return <button type="button" className="welcome-solo" onClick={open}><Armchair size={24}/><span><b>{t("ひとりで寄り道を始める")}</b><small>{t("名前はあとで。一本見つけて、自分の窓辺へ。")}</small></span><ArrowRight size={18}/></button>;
}

export function SoloEntry({open}:{open:()=>void}){
  return <button className="solo-entry" onClick={open}><span className="solo-entry-art" aria-hidden="true"/><span><small>YOUR OWN LITTLE TIME</small><b>{t("ひとりの寄り道。")}</b><span>{t("好きな一本を、自分の窓辺へ。")}</span></span><ArrowRight size={19}/></button>;
}

export default function SoloTime({data,rooms,busy,leavesTogether,close,shelf,watch,home}:{data:Bootstrap;rooms:Room[];busy:boolean;leavesTogether:boolean;close:()=>void;shelf:()=>void;watch:(id:string)=>Promise<void>;home:(room:Room)=>Promise<void>}){
  const [opening,setOpening]=useState(false),[error,setError]=useState('');
  const mine=rooms.filter(r=>r.ownerId===data.user.id&&!r.isPublic),saved=data.posts.filter(p=>data.favorites.includes(p.id)&&discoverableVideo(p));
  async function go(fn:()=>Promise<void>){if(opening)return;setOpening(true);setError('');try{await fn();}catch(e){setError((e as Error).message);}finally{setOpening(false);}}
  return <Modal title={t("ひとりの寄り道")} close={close} wide><div className="solo-time"><div className="solo-hero"><p className="eyebrow">A LITTLE TIME, JUST FOR YOU.</p><h2>{t("ひとりの時間に、")}<br/>{t("小さな寄り道を。")}</h2><p>{t("一本の動画。窓の向こうの夕暮れ。")}<br/>{t("今日は、あなたのペースで過ごそう。")}</p></div><ol className="solo-route"><li><span>01</span><Play size={19}/><b>{t("一本を見つける")}</b><p>{t("気分を選んでも、選ばなくても。")}</p></li><li><span>02</span><Bookmark size={19}/><b>{t("窓辺に持ち帰る")}</b><p>{t("保存して、自分だけの部屋へ。")}</p></li><li><span>03</span><Armchair size={19}/><b>{t("また、ここで")}</b><p>{t("置いた動画は、次に来たときも。")}</p></li></ol><button className="primary full solo-find" onClick={shelf}><Play size={18}/>{t("今日の一本を探す")}<ArrowRight size={17}/></button>{leavesTogether&&<p className="fineprint">{t("自分の窓辺へ移動すると、参加中の同期視聴から退出します。")}</p>}
    <section className="solo-homes" aria-label={t("自分の非公開の窓辺")}><h3><Home size={18}/>{t("あなたの窓辺")}</h3>{mine.length?mine.map(r=><button key={r.id} className="solo-return" disabled={busy||opening} onClick={()=>void go(()=>home(r))}><Armchair size={22}/><span><b>{r.title}</b><small>{t("自分だけの部屋 ·")}{" "}{r.items.length}{t("投稿")}</small></span><span>{t("窓辺へ戻る")}<ArrowRight size={16}/></span></button>):<p>{t("気に入った動画の「自分の窓辺に置く」から、非公開の部屋を用意できます。部屋は勝手には作りません。")}</p>}</section>
    {!!saved.length&&<section className="solo-saved" aria-label={t("保存した動画")}><h3><Bookmark size={18}/>{t("大切にした、一本。")}</h3>{saved.slice(0,4).map(p=><button key={p.id} disabled={busy||opening} onClick={()=>void go(()=>watch(p.id))}><Play size={17}/><span>{p.title}</span><ArrowRight size={16}/></button>)}</section>}{error&&<p role="alert" className="discovery-error">{error}</p>}<p className="solo-note">{t("登録や友達への招待をせずに楽しめます。投稿を開いている人の表示は、通常の公開設定に従います。")}</p></div></Modal>;
}

export function SoloRetreat({post,data,rooms,connected,leavesTogether,close,reload,enter}:{post:Post;data:Bootstrap;rooms:Room[];connected:boolean;leavesTogether:boolean;close:()=>void;reload:()=>Promise<unknown>;enter:(room:Room)=>Promise<void>}){
  const mine=rooms.filter(r=>r.ownerId===data.user.id&&!r.isPublic),[roomId,setRoomId]=useState(()=>mine[0]?.id||''),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const mounted=useRef(true);useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
  const short=starterShort(post);
  async function prepare(){if(busy)return;setBusy(true);setError('');try{const room=await api<Room>('/solo/room','POST',{postId:post.id,locale:getLocale(),...roomId?{roomId}:{}});await reload();if(mounted.current)await enter(room);}catch(e){if(mounted.current)setError((e as Error).message);}finally{if(mounted.current)setBusy(false);}}
  return <Modal title={t("自分の窓辺に置く")} close={close}><div className="solo-retreat"><p className="eyebrow">TAKE A LITTLE FAVOURITE HOME.</p><h2>{t("この一本の、")}<br/>{t("帰る場所を。")}</h2><div className="solo-picked"><img src={short?shortPoster(short.slug):'/art/world-'+post.genre+'.webp'} alt=""/><div><small>{short?'WALK SHORTS':t("気に入った動画")}</small><h3>{post.title}</h3></div></div>{mine.length?<label>{t("置く部屋")}<select aria-label={t("動画を置く非公開の部屋")} value={roomId} onChange={e=>{setRoomId(e.target.value);setError('');}}>{mine.map(r=><option key={r.id} value={r.id}>{r.title}{t("（自分だけ）")}</option>)}</select></label>:<div className="solo-new-room"><Armchair size={22}/><div><b>{t("わたしの窓辺")}</b><p>{t("非公開の小さな部屋を用意します。花とベンチ、置いた動画から始めよう。")}</p></div></div>}<p>{t("この動画をお気に入りに保存し、自分の非公開の部屋に置きます。すでに置いた動画は重複しません。")}</p><p className="fineprint">{t("部屋は非公開です。投稿を開いている人数と、あなたが許可した閲覧者表示は通常どおりです。公開設定やマイクは変更しません。")}{leavesTogether?t("移動すると同期視聴から退出します。"):''}</p>{error&&<p role="alert" className="discovery-error">{error}</p>}<button className="primary full" disabled={busy||!connected} onClick={()=>void prepare()}>{busy?t("窓辺を用意しています…"):t("保存して窓辺で開く")}<ArrowRight size={17}/></button><button className="text-button full" onClick={close}>{t("今はここで見る")}</button></div></Modal>;
}
