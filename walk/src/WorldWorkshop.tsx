import {t} from './i18n';
import { useState, type FormEvent } from 'react';
import { Check, Plus } from 'lucide-react';
import { landscapes, type WorldDraft, type Landscape, type Place } from './worlds';
import { api } from './api';
import { courtyardArt } from './world-layout';

const labels:Record<Landscape,string>={discovery:'発見の広場',music:'音楽の中庭',video:'小さな映画館',art:'アトリエの庭',meme:'不思議な雑貨通り',game:'冒険の工房',anime:'作画の家',garden:'花と緑の庭',japan:'木造の街角',future:'青銅の未来街',fantasy:'石造りの隠れ家'};
export default function WorldWorkshop({parent,editing,refresh,notify,done,cancel}:{parent:Place;editing?:Place;refresh:()=>Promise<unknown>;notify:(s:string)=>void;done:(id:string)=>void;cancel:()=>void}){
  const [draft,setDraft]=useState<WorldDraft>({title:editing?.title||'',description:editing?.description||'',landscape:editing?.landscape||parent.landscape||'garden'}),[busy,setBusy]=useState(false),[error,setError]=useState(''),[confirm,setConfirm]=useState(false);
  async function save(e:FormEvent){
    e.preventDefault();if(busy)return;setBusy(true);setError('');
    try{const result=await api<Place>(editing?'/worlds/'+editing.id:'/worlds',editing?'PUT':'POST',editing?{...draft,revision:editing.revision}:{...draft,parentId:parent.id});await refresh();notify(editing?t("世界の案内を更新しました"):t("新しい入口ができました"));done(result.id);}catch(e){setError((e as Error).message);}finally{setBusy(false);}
  }
  async function remove(){
    if(!editing||busy)return;setBusy(true);setError('');
    try{await api('/worlds/'+editing.id,'DELETE',{revision:editing.revision});await refresh();notify(t("空の世界を片づけました"));done(parent.id);}catch(e){setError((e as Error).message);}finally{setBusy(false);}
  }
  return <form className="world-workshop" onSubmit={e=>void save(e)} aria-label={editing?t("世界を編集"):t("世界を作る")}>
    <span className="sheet-eyebrow">A PLACE FOR YOUR LIKES</span><h2>{editing?t("この世界の、案内を整える。"):t("あなたの「好き」に、入口を。")}</h2>
    <p className="world-parent-note">{parent.title}{" "}{t("の先にある、みんなが訪問できる世界です。")}</p>
    <label>{t("世界の名前")}<input name="worldTitle" required autoFocus maxLength={48} value={draft.title} onChange={e=>setDraft({...draft,title:e.target.value})} placeholder={t("どんな「好き」を集めよう？")}/></label>
    <label>{t("世界の紹介")}<textarea name="worldDescription" maxLength={400} value={draft.description} onChange={e=>setDraft({...draft,description:e.target.value})} placeholder={t("何を楽しむ場所か、ひとこと。")}/></label>
    <fieldset className="landscape-picker"><legend>{t("この世界の風景")}</legend><div>{landscapes.map(landscape=><label key={landscape} className={draft.landscape===landscape?'chosen':''}><input type="radio" name="landscape" value={landscape} checked={draft.landscape===landscape} onChange={()=>setDraft({...draft,landscape})}/><img src={courtyardArt({theme:'garden',landscape})} alt="" loading="lazy"/><span>{t(labels[landscape])}{draft.landscape===landscape&&<Check size={15} aria-hidden="true"/>}</span></label>)}</div></fieldset>
    <p className="fineprint">{t("公開の世界です。自分の世界の名前・紹介・景観を編集でき、その先に世界を追加できます。ほかの人の投稿を編集する権限は増えません。自由なパーツ建築や住人による承認は今後の機能です。")}</p>
    {error&&<p role="alert" className="workshop-error">{t(error)}</p>}
    <div className="feature-buttons"><button type="button" className="outline" disabled={busy} onClick={cancel}>{t("案内に戻る")}</button><button className="primary" disabled={busy}>{!editing&&<Plus size={17}/>} {busy?t("保存中…"):editing?t("案内を保存"):t("世界を作って訪問")}</button></div>
    {editing&&<div className="world-remove"><p className="fineprint">{t("投稿や奥の世界がある場所は削除できません。")}</p>{confirm?<div className="feature-buttons"><button type="button" className="outline danger" disabled={busy} onClick={()=>void remove()}>{t("空の世界の削除を確定")}</button><button type="button" className="text-button" disabled={busy} onClick={()=>setConfirm(false)}>{t("取り消す")}</button></div>:<button type="button" className="text-button" disabled={busy} onClick={()=>setConfirm(true)}>{t("空の世界を片づける")}</button>}</div>}
  </form>;
}
