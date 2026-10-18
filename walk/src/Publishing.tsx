import {t} from './i18n';
import {isNative} from './native';
import { useEffect,useRef,useState,type FormEvent } from 'react';
import type { Bootstrap, Genre } from './model';
import { places,findPlace } from './worlds';
import { areas } from './model';
import { api,apiRequest,ApiError } from './api';
import './connection.css';
import Modal from './Modal';
import {readPostDraft,writePostDraft,removePostDraft,type PostDraft} from './post-draft';
export function ComposePost({ownerId,worldId,close,refresh,notify,openPost}:{ownerId:string;worldId?:string;close:()=>void;refresh:()=>Promise<unknown>;notify:(s:string)=>void;openPost:(id:string)=>Promise<void>}){
  const [draft,setDraft]=useState<PostDraft>(()=>readPostDraft(ownerId)||{
    version:1,requestId:crypto.randomUUID(),title:'',body:'',genre:findPlace(worldId||'')?.genre||'game',
    worldId:findPlace(worldId||'')?.genre?worldId||'':'',attachment:null,attempted:false,savedPostId:null,
  });
  const [busy,setBusy]=useState(false),[uploading,setUploading]=useState(false),[error,setError]=useState('');
  const [storageFailed,setStorageFailed]=useState(false),[discarding,setDiscarding]=useState(false);
  const preview=useRef<string|null>(null),mounted=useRef(true),submitting=useRef(false),completed=useRef(false);
  useEffect(()=>{
    if(completed.current)return;
    if(draft.title||draft.body||draft.attachment||draft.attempted)setStorageFailed(!writePostDraft(ownerId,draft));
    else{removePostDraft(ownerId);setStorageFailed(false);}
  },[ownerId,draft]);
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;if(preview.current)URL.revokeObjectURL(preview.current);};},[]);
  async function upload(file:File){
    if(submitting.current||draft.attempted)return;
    if(file.size>25*1024*1024){notify(t("画像・動画は25MB以内で選んでください"));return;}
    setUploading(true);const f=new FormData();f.append('file',file);
    try{
      const result=await apiRequest<NonNullable<PostDraft['attachment']>>('/uploads',{method:'POST',body:f},120000);
      if(!mounted.current){await api('/uploads/'+result.id,'DELETE');return;}
      const previous=draft.attachment?.id;
      if(preview.current)URL.revokeObjectURL(preview.current);
      preview.current=isNative()?URL.createObjectURL(file):null;
      setDraft(d=>({...d,attachment:result}));
      if(previous)void api('/uploads/'+previous,'DELETE').catch(()=>{});
    }catch(e){notify((e as Error).message);}finally{if(mounted.current)setUploading(false);}
  }
  async function finish(id:string){
    await refresh();await openPost(id);
    completed.current=true;removePostDraft(ownerId);notify(t('WALKに投稿しました'));close();
  }
  async function showSaved(){
    if(!draft.savedPostId||submitting.current)return;
    submitting.current=true;setBusy(true);setError('');
    try{await finish(draft.savedPostId);}catch(e){setError((e as Error).message);}finally{submitting.current=false;if(mounted.current)setBusy(false);}
  }
  async function submit(e:FormEvent<HTMLFormElement>){
    e.preventDefault();if(submitting.current||uploading)return;
    if(draft.savedPostId){await showSaved();return;}
    const pending={...draft,attempted:true};
    // Persist the exact request before sending: an OS termination can happen before its acknowledgement.
    setDraft(pending);setStorageFailed(!writePostDraft(ownerId,pending));
    setBusy(true);setError('');submitting.current=true;
    try{
      const r=await api<{id:string}>('/posts','POST',{requestId:pending.requestId,title:pending.title,body:pending.body,genre:pending.genre,worldId:pending.worldId||null,attachmentId:pending.attachment?.id||null});
      if(!r?.id)throw new ApiError(t('結果を確認できませんでした。保存されている可能性があります。接続が戻ったら状態を確認してから操作してください。'),200,true);
      const confirmed={...pending,savedPostId:r.id};
      setDraft(confirmed);setStorageFailed(!writePostDraft(ownerId,confirmed));await finish(r.id);
    }catch(e){
      setError((e as Error).message);
      // Only a definite rejection permits edits. An uncertain result keeps the original request intact.
      if(!draft.attempted&&e instanceof ApiError&&!e.outcomeUnknown&&[400,403,413,429].includes(e.status))setDraft(d=>({...d,attempted:false,requestId:crypto.randomUUID()}));
    }finally{submitting.current=false;if(mounted.current)setBusy(false);}
  }
  function discard(){
    if(busy||uploading)return;
    if(!discarding){setDiscarding(true);return;}
    completed.current=true;removePostDraft(ownerId);
    // The server refuses to delete files used by a published post.
    if(draft.attachment)void api('/uploads/'+draft.attachment.id,'DELETE').catch(()=>{});
    close();
  }
  const attachment=draft.attachment,previewUrl=preview.current||(!isNative()?attachment?.url:null);
  return <Modal title={t("WALKに投稿する")} close={()=>{if(!busy&&!uploading)close();}}>
    <form className="collection-form" onSubmit={e=>void submit(e)}>
      <h2>{t("あなたの「好き」を、この場所へ。")}</h2>
      <p>{t("文章・画像・短い動画をWALKに直接投稿できます。広場に公開され、他の人が保存してルームに飾れます。")}</p>
      <p className="fineprint" role="status">{t('下書きはこの端末に保存します。ログアウトやアカウントの切り替えで消去されます。共有端末では使い終わったら下書きを破棄してください。')}</p>
      {storageFailed&&<p className="discovery-error" role="alert">{t('この端末に下書きを保存できません。画面を閉じると入力が失われる可能性があります。')}</p>}
      <fieldset className="publish-fields" disabled={busy||draft.attempted}>
        <label>{t("投稿タイトル")}<input name="title" aria-label={t('投稿タイトル')} required maxLength={120} value={draft.title} onChange={e=>setDraft(d=>({...d,title:e.target.value}))}/></label>
        <label>{t("本文")}<textarea name="body" aria-label={t('本文')} maxLength={4000} value={draft.body} onChange={e=>setDraft(d=>({...d,body:e.target.value}))} placeholder={t("見つけたこと、つくったもの、語りたいこと。")}/></label>
        <label>{t("ジャンル")}<select aria-label={t("ジャンル")} name="genre" value={draft.genre} onChange={e=>setDraft(d=>({...d,genre:e.target.value as Genre,worldId:''}))}>{areas.map(a=><option key={a.id} value={a.id}>{a.label}</option>)}</select></label>
        <label>{t("投稿する世界")}<select aria-label={t("投稿する世界")} name="world" value={draft.worldId} onChange={e=>setDraft(d=>({...d,worldId:e.target.value}))}><option value="">{t("ジャンルの入口の世界")}</option>{places.filter(p=>p.genre===draft.genre).map(p=><option key={p.id} value={p.id}>{p.title}</option>)}</select></label>
        <label>{t("画像・動画を添付（任意・25MBまで）")}<input type="file" accept="image/png,image/jpeg,image/webp,image/gif,video/mp4,video/webm" disabled={uploading||busy} onChange={e=>{const f=e.target.files?.[0];e.currentTarget.value='';if(f)void upload(f);}}/></label>
        {uploading&&<p role="status">{t("アップロードしています…")}</p>}
        {attachment&&(previewUrl?(attachment.mime.startsWith('video/')?<video className="native-video" src={previewUrl} controls preload="metadata"/>:<img className="detail-image" src={previewUrl} alt={t("添付プレビュー")}/>):<p>{t('添付ファイルも下書きに保存されています。')}</p>)}
      </fieldset>
      <p className="fineprint">{t("自分の文章・作品や、公開する権利のあるものを投稿してください。投稿者名には現在のプロフィール名を使います。")}</p>
      {error&&<p className="discovery-error" role="alert">{error}</p>}
      {draft.savedPostId?<section className="publish-recovery" role="status"><p>{t('投稿は保存されています。一覧を読み直して開けます。再投稿はしません。')}</p><button type="button" className="primary full" disabled={busy} onClick={()=>void showSaved()}>{busy?t('接続を確認中…'):t('保存済みの投稿を開く')}</button></section>:<>
        {draft.attempted&&<p className="fineprint">{t('同じ内容で再試行できます。保存済みならその投稿を開きます。内容を変える場合は下書きを破棄してください。')}</p>}
        <button className="primary full" disabled={busy||uploading}>{busy?t("公開中…"):t("広場に公開する")}</button>
      </>}
      {discarding&&<p>{t('下書きだけを破棄します。すでに公開された投稿は削除されません。')}</p>}
      <button type="button" className="text-button full" disabled={busy||uploading} onClick={discard}>{discarding?t('下書きの破棄を確定'):t('下書きを破棄')}</button>
      {discarding&&<button type="button" className="text-button full" onClick={()=>setDiscarding(false)}>{t('やめる')}</button>}
    </form>
  </Modal>;
}
export function OwnPosts({data,refresh,notify,openPost,close}:{data:Bootstrap;refresh:()=>Promise<unknown>;notify:(s:string)=>void;openPost:(id:string)=>void;close:()=>void}){
  const [removing,setRemoving]=useState<string|null>(null);
  const posts=data.posts.filter(p=>p.ownerId===data.user.id&&p.origin==='walk');
  return <Modal title={t("自分のWALK投稿")} close={close}><div className="collection-form"><h2>{t("ここから生まれた投稿。")}</h2>{posts.length?posts.map(p=><article key={p.id} className="own-post"><button className="tile-title" onClick={()=>openPost(p.id)}>{p.title}</button><small>{areas.find(a=>a.id===p.genre)?.label}</small>{removing===p.id?<div className="feature-buttons"><button className="outline" onClick={()=>void api('/posts/'+p.id,'DELETE').then(async()=>{await refresh();setRemoving(null);notify(t("自分の投稿を削除しました"));}).catch(e=>notify(e.message))}>{t("投稿の削除を確定")}</button><button className="text-button" onClick={()=>setRemoving(null)}>{t("やめる")}</button></div>:<button className="text-button" onClick={()=>setRemoving(p.id)}>{t("削除する")}</button>}</article>):<p>{t("最初の「好き」を投稿してみよう。")}</p>}</div></Modal>;
}
