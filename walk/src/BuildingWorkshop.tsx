import {useEffect,useRef,useState} from 'react';
import {z} from 'zod';
import {cosmeticCatalog,type EconomyState} from '../shared/economy';
import type {Room} from '../shared/community';
import {buildingKinds,buildingColors,buildingLabels,colorLabels,buildingPalette,buildingPiecesSchema,buildingCellPoint,buildingPolygons,canonicalPieces,emptyBuilding,protectedCell,type Building,type BuildingPiece,type BuildingSnapshot} from '../shared/building';
import {api,ApiError} from './api';
import {t,tr,localeTag} from './i18n';
import {saveDataExport} from './native';
import Modal from './Modal';
import './building.css';

function Preview({pieces}:{pieces:BuildingPiece[]}){
 return <svg className="building-preview" viewBox="150 100 1700 1100" role="img" aria-label={t('建築の立体プレビュー')}><path d="M 1000 260 L 1840 680 L 1140 1030 L 300 610 Z" fill="#e4ddc8" stroke="#b6aa8e" strokeWidth="4"/>{canonicalPieces(pieces).map(p=>{const at=buildingCellPoint(p.x,p.y);return <g key={`${p.x}:${p.y}:${p.z}`} transform={`translate(${at.x},${at.y})`}>{buildingPolygons(p).map((f,i)=><polygon key={i} points={f.points.map(v=>v.join(',')).join(' ')} fill={f.color} stroke="#71634f" strokeWidth="1.5"/>)}</g>;})}</svg>;
}
export default function BuildingWorkshop({room,close,reload,shop}:{shop:()=>void;room:Room;close:()=>void;reload:()=>Promise<unknown>}){
 const initial=room.build||emptyBuilding(),[base,setBase]=useState(initial),[pieces,setPieces]=useState(initial.pieces),[past,setPast]=useState<BuildingPiece[][]>([]),[future,setFuture]=useState<BuildingPiece[][]>([]);
 const [kind,setKind]=useState<BuildingPiece['kind']>('wall'),[color,setColor]=useState<BuildingPiece['color']>('cream'),[level,setLevel]=useState(0),[rotation,setRotation]=useState(0),[erase,setErase]=useState(false);
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[history,setHistory]=useState<BuildingSnapshot[]>([]),[confirmClose,setConfirmClose]=useState(false),[confirmReload,setConfirmReload]=useState(false),[restoreId,setRestoreId]=useState<string|null>(null);
 const [pending,setPending]=useState<{requestId:string;revision:number;pieces:BuildingPiece[]}|null>(null),[pendingRestore,setPendingRestore]=useState<{requestId:string;revision:number;snapshotId:string}|null>(null);
 const [owned,setOwned]=useState<string[]>([]);
 const lock=useRef(false),mounted=useRef(true),dirty=JSON.stringify(canonicalPieces(pieces))!==JSON.stringify(canonicalPieces(base.pieces));
 useEffect(()=>{mounted.current=true;void api<BuildingSnapshot[]>('/rooms/'+room.id+'/build/history').then(setHistory).catch(e=>setError(e.message));return()=>{mounted.current=false;};},[room.id]);
 useEffect(()=>{let active=true;const load=()=>void api<EconomyState>('/economy').then(data=>{if(active)setOwned(data.owned);}).catch(e=>{if(active)setError(e.message);});load();window.addEventListener('walk:inventory',load);return()=>{active=false;window.removeEventListener('walk:inventory',load);};},[]);
 const lockedKind=(k:BuildingPiece['kind'])=>cosmeticCatalog.find(item=>'kind'in item&&item.kind===k&&!owned.includes(item.id));
 const disabled=busy||!!pending||!!pendingRestore;
 function change(next:BuildingPiece[]){if(disabled)return;setPast(p=>[...p.slice(-39),pieces]);setFuture([]);setPieces(next);setError('');}
 async function sync(build:Building){setBase(build);setPieces(build.pieces);setPast([]);setFuture([]);setPending(null);setPendingRestore(null);setRestoreId(null);setHistory(await api<BuildingSnapshot[]>('/rooms/'+room.id+'/build/history'));await reload();}
 async function save(){
  if(lock.current||pendingRestore)return;lock.current=true;setBusy(true);setError('');
  const request=pending||{requestId:crypto.randomUUID(),revision:base.revision,pieces};setPending(request);
  try{const result=await api<Building>('/rooms/'+room.id+'/build','PUT',request);if(mounted.current)await sync(result);}
  catch(e){if(mounted.current){setError((e as Error).message);if(e instanceof ApiError&&!e.outcomeUnknown&&[400,403,409,429].includes(e.status))setPending(null);}}
  finally{lock.current=false;if(mounted.current)setBusy(false);}
 }
 async function restore(){
  if(lock.current||pending||(!restoreId&&!pendingRestore))return;lock.current=true;setBusy(true);setError('');
  const request=pendingRestore||{requestId:crypto.randomUUID(),revision:base.revision,snapshotId:restoreId!};setPendingRestore(request);
  try{const result=await api<Building>('/rooms/'+room.id+'/build/restore','POST',request);if(mounted.current)await sync(result);}
  catch(e){if(mounted.current){setError((e as Error).message);if(e instanceof ApiError&&!e.outcomeUnknown&&[400,403,404,409,429].includes(e.status))setPendingRestore(null);}}
  finally{lock.current=false;if(mounted.current)setBusy(false);}
 }
 async function loadLatest(){if(busy||lock.current)return;if(!confirmReload){setConfirmReload(true);return;}setBusy(true);setError('');try{const latest=await api<Room>('/rooms/'+room.id);await sync(latest.build||emptyBuilding());setConfirmReload(false);}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 async function importFile(file:File){if(file.size>100000){setError(t('設計図は100KB以内のJSONを選んでください'));return;}try{const data=z.object({format:z.literal('walk-blueprint-1'),pieces:buildingPiecesSchema}).strict().parse(JSON.parse(await file.text()));change(data.pieces);}catch{setError(t('WALKの基本パーツで作った設計図JSONを選んでください'));}}
 function leave(){if(busy)return;if(dirty||pending||pendingRestore)setConfirmClose(true);else close();}
 return <Modal title={t('小さな建築工房')} close={leave} wide><div className="building-workshop"><header><small>BUILD A LITTLE PLACE</small><h2>{room.title}</h2><p>{t('床・壁・屋根と家具を組み合わせよう。基本パーツは無料です。保存するまで部屋には反映されません。')}</p></header><Preview pieces={pieces}/><button className="outline" type="button" onClick={shop}>{t("素材のお店")}</button>
  <fieldset disabled={disabled}><legend>{t('使うパーツ')}</legend><div className="building-tools">{buildingKinds.map(k=><button type="button" className="outline" key={k} disabled={!!lockedKind(k)} aria-label={t(buildingLabels[k])} title={lockedKind(k)?t('コインのお店で解放できます'):undefined} aria-pressed={!erase&&kind===k} onClick={()=>{setKind(k);setErase(false);if(k==='floor')setLevel(0);}}>{t(buildingLabels[k])}{lockedKind(k)&&<small> · {lockedKind(k)!.cost}</small>}</button>)}<button type="button" className="outline" aria-pressed={erase} onClick={()=>setErase(true)}>{t('パーツを消す')}</button></div>
   <div className="building-options"><label>{t('素材の色')}<select aria-label={t("素材の色")} value={color} onChange={e=>setColor(e.target.value as BuildingPiece['color'])}>{buildingColors.map(c=><option key={c} value={c} disabled={cosmeticCatalog.some(item=>'color'in item&&item.color===c&&!owned.includes(item.id))}>{t(colorLabels[c])}</option>)}</select></label><label>{t('建築の高さ')}<select aria-label={t("建築の高さ")} value={level} onChange={e=>setLevel(Number(e.target.value))}>{[0,1,2].map(n=><option key={n} value={n}>{n}</option>)}</select></label><button className="outline" type="button" onClick={()=>setRotation(r=>(r+1)%4)}>{t('向きを回す')} · {rotation*90}°</button></div>
   <p>{t('マスをタップして配置・置き換え。色の付いた入口の通路は保護されています。表は横にもスクロールできます。')}</p>
   <div className="building-grid-scroll"><div className="building-grid" role="grid" aria-label={t('建築の配置マス')}>{Array.from({length:10},(_,y)=><div role="row" key={y}>{Array.from({length:12},(_,x)=>{const part=pieces.find(p=>p.x===x&&p.y===y&&p.z===level),protectedPath=protectedCell(x,y);return <button type="button" role="gridcell" disabled={protectedPath} key={x} aria-label={tr('マス {x}, {y}・高さ {z}',{x:x+1,y:y+1,z:level})} aria-selected={!!part} style={part?{background:buildingPalette[part.color][2]}:undefined} onClick={()=>{const next=pieces.filter(p=>!(p.x===x&&p.y===y&&p.z===level));if(!erase)next.push({x,y,z:level,kind,color,rotation});const checked=buildingPiecesSchema.safeParse(next);if(!checked.success){setError(t(checked.error.issues[0].message));return;}change(checked.data);}}>{protectedPath?t('道'):part?t(buildingLabels[part.kind]):'·'}</button>;})}</div>)}</div></div>
  </fieldset>
  <div className="building-tools"><button type="button" className="outline" disabled={disabled||!past.length} onClick={()=>{setFuture(f=>[pieces,...f]);setPieces(past.at(-1)!);setPast(p=>p.slice(0,-1));}}>{t('ひとつ戻す')}</button><button type="button" className="outline" disabled={disabled||!future.length} onClick={()=>{setPast(p=>[...p,pieces]);setPieces(future[0]);setFuture(f=>f.slice(1));}}>{t('やり直す')}</button><button type="button" className="outline" onClick={()=>void saveDataExport({format:'walk-blueprint-1',pieces}).catch(e=>setError(e.message))}>{t('設計図を保存')}</button><label className="outline blueprint-import">{t('設計図を読み込む')}<input type="file" accept="application/json,.json" disabled={disabled} onChange={e=>{const f=e.target.files?.[0];e.currentTarget.value='';if(f)void importFile(f);}}/></label></div>
  <p>{tr('配置したパーツ {count} / 180',{count:pieces.length})} · {dirty?t('未保存の変更があります'):t('保存した建築です')}</p>{error&&<p className="discovery-error" role="alert">{error}</p>}{(pending||pendingRestore)&&!busy&&<p role="status">{t('保存結果を確認できていません。同じ内容で再試行するか、最新版を確認してください。')}</p>}
  <div className="building-tools"><button className="primary" disabled={busy||!!pendingRestore} onClick={()=>void save()}>{busy?t('保存中…'):t('建築を保存')}</button><button className="outline" disabled={busy} onClick={()=>void loadLatest()}>{confirmReload?t('入力を破棄して最新版を開く'):t('最新版を確認')}</button></div>
  {confirmReload&&<p>{t('現在の入力を破棄します。残したい場合は先に設計図を保存してください。')}</p>}
  <section className="building-history"><h3>{t('建築の保存履歴')}</h3><p>{t('直近8回の保存前の状態を残します。復元しても、さらに前の状態へ戻れます。')}</p>{history.map(h=><button type="button" className="outline" disabled={busy||!!pending||!!pendingRestore} key={h.id} onClick={()=>setRestoreId(h.id)} aria-pressed={restoreId===h.id}>{new Date(h.createdAt).toLocaleString(localeTag())} · {tr('パーツ {count} 個',{count:h.pieceCount})}</button>)}{!history.length&&<p>{t('保存すると履歴が残ります。')}</p>}{(restoreId||pendingRestore)&&<><p>{t('選んだ履歴で建築を置き換えます。未保存の入力は先に設計図へ保存してください。')}</p><button className="outline" disabled={busy||!!pending} onClick={()=>void restore()}>{t('この履歴へ復元')}</button></>}</section>
  {confirmClose&&<section className="discovery-error"><p>{t('未保存の入力が失われます。保存結果が不明な場合、部屋には反映済みの可能性があります。')}</p><button className="outline" onClick={close}>{t('保存せずに閉じる')}</button><button className="text-button" onClick={()=>setConfirmClose(false)}>{t('編集を続ける')}</button></section>}
 </div></Modal>;
}
