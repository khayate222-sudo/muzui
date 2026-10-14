import {walkFetch,isNative} from './native';
import { useEffect,useRef,useState,type FormEvent } from 'react';
import type { Bootstrap } from '../shared/model';
import { places } from '../shared/worlds';
import { areas } from '../shared/model';
import { api } from './api';
import Modal from './Modal';
export function ComposePost({close,refresh,notify,openPost}:{close:()=>void;refresh:()=>Promise<unknown>;notify:(s:string)=>void;openPost:(id:string)=>void}){
  const [genre,setGenre]=useState('game');
  const [busy,setBusy]=useState(false),[attachment,setAttachment]=useState<{id:string;url:string;mime:string}|null>(null),[uploading,setUploading]=useState(false);
  const preview=useRef<string|null>(null);
  const uploaded=useRef<string|null>(null),mounted=useRef(true),submitting=useRef(false);
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;if(preview.current)URL.revokeObjectURL(preview.current);if(uploaded.current&&!submitting.current)void api('/uploads/'+uploaded.current,'DELETE').catch(()=>{});};},[]);
  async function upload(file:File){
    if(file.size>25*1024*1024){notify('画像・動画は25MB以内で選んでください');return;}
    setUploading(true);const f=new FormData();f.append('file',file);
    try{const response=await walkFetch('/api/uploads',{method:'POST',credentials:'same-origin',headers:{'X-Walk-Client':'1'},body:f});const result=await response.json();if(!response.ok)throw new Error(result.error||'アップロードできません');if(!mounted.current){await api('/uploads/'+result.id,'DELETE');return;}if(uploaded.current)await api('/uploads/'+uploaded.current,'DELETE');uploaded.current=result.id;if(preview.current)URL.revokeObjectURL(preview.current);preview.current=isNative()?URL.createObjectURL(file):null;setAttachment({...result,url:preview.current||result.url});}catch(e){notify((e as Error).message);}finally{if(mounted.current)setUploading(false);}
  }
  async function submit(e:FormEvent<HTMLFormElement>){e.preventDefault();if(busy||uploading)return;const f=new FormData(e.currentTarget);setBusy(true);submitting.current=true;try{const r=await api<{id:string}>('/posts','POST',{title:f.get('title'),body:f.get('body'),genre:f.get('genre'),worldId:f.get('world')||null,attachmentId:attachment?.id||null});uploaded.current=null;await refresh();notify('WALKに投稿しました');close();openPost(r.id);}catch(e){notify((e as Error).message);submitting.current=false;}finally{setBusy(false);}}
  return <Modal title="WALKに投稿する" close={()=>{if(!busy&&!uploading)close();}}><form className="collection-form" onSubmit={e=>void submit(e)}><h2>あなたの「好き」を、この場所へ。</h2><p>文章・画像・短い動画をWALKに直接投稿できます。広場に公開され、他の人が保存してルームに飾れます。</p><label>投稿タイトル<input name="title" required maxLength={120}/></label><label>本文<textarea name="body" maxLength={4000} placeholder="見つけたこと、つくったもの、語りたいこと。"/></label><label>ジャンル<select name="genre" value={genre} onChange={e=>setGenre(e.target.value)}>{areas.map(a=><option key={a.id} value={a.id}>{a.label}</option>)}</select></label><label>投稿する世界<select name="world" key={genre}><option value="">ジャンルの入口の世界</option>{places.filter(p=>p.genre===genre).map(p=><option key={p.id} value={p.id}>{p.title}</option>)}</select></label><label>画像・動画を添付（任意・25MBまで）<input type="file" accept="image/png,image/jpeg,image/webp,image/gif,video/mp4,video/webm" disabled={uploading||busy} onChange={e=>{const f=e.target.files?.[0];if(f)void upload(f);}}/></label>{uploading&&<p role="status">アップロードしています…</p>}{attachment&&(attachment.mime.startsWith('video/')?<video className="native-video" src={attachment.url} controls preload="metadata"/>:<img className="detail-image" src={attachment.url} alt="添付プレビュー"/>)}<p className="fineprint">自分の文章・作品や、公開する権利のあるものを投稿してください。投稿者名には現在のプロフィール名を使います。</p><button className="primary full" disabled={busy||uploading}>{busy?'公開中…':'広場に公開する'}</button></form></Modal>;
}
export function OwnPosts({data,refresh,notify,openPost,close}:{data:Bootstrap;refresh:()=>Promise<unknown>;notify:(s:string)=>void;openPost:(id:string)=>void;close:()=>void}){
  const [removing,setRemoving]=useState<string|null>(null);
  const posts=data.posts.filter(p=>p.ownerId===data.user.id&&p.origin==='walk');
  return <Modal title="自分のWALK投稿" close={close}><div className="collection-form"><h2>ここから生まれた投稿。</h2>{posts.length?posts.map(p=><article key={p.id} className="own-post"><button className="tile-title" onClick={()=>openPost(p.id)}>{p.title}</button><small>{areas.find(a=>a.id===p.genre)?.label}</small>{removing===p.id?<div className="feature-buttons"><button className="outline" onClick={()=>void api('/posts/'+p.id,'DELETE').then(async()=>{await refresh();setRemoving(null);notify('自分の投稿を削除しました');}).catch(e=>notify(e.message))}>投稿の削除を確定</button><button className="text-button" onClick={()=>setRemoving(null)}>やめる</button></div>:<button className="text-button" onClick={()=>setRemoving(p.id)}>削除する</button>}</article>):<p>最初の「好き」を投稿してみよう。</p>}</div></Modal>;
}
