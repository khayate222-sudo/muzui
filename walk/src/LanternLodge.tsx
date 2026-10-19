import {useCallback,useEffect,useRef,useState} from 'react';
import type {Socket} from 'socket.io-client';
import {Sun,Moon,Armchair,Lamp,ArrowRight} from 'lucide-react';
import {lanternWorld,type LanternState,type LanternChoice} from '../shared/lantern';
import type {EconomyState} from '../shared/economy';
import type {Friendship} from './model';
import {api} from './api';
import {t,tr} from './i18n';
import Avatar from './Avatar';
import Modal from './Modal';
import {FriendDestinationSend} from './Meetups';
import './lantern.css';
export function useLanternTable(socket:Socket|null,userId:string|undefined){
 const [state,setState]=useState<LanternState>({enabled:false,table:null});
 const send=useCallback(async(event:string,payload:object={})=>{if(!socket?.connected)throw new Error(t('接続が戻ってから操作してください'));const emitter=event==='get'?socket.timeout(5000):socket.timeout(5000).volatile;const r=await emitter.emitWithAck('lantern:'+event,payload).catch(()=>{throw new Error(t('操作を確認できませんでした。テーブルの現在の状態を確認してください。'));}) as {ok:boolean;error?:string};if(!r.ok)throw new Error(t(r.error||'操作を確認できませんでした'));},[socket]);
 useEffect(()=>{if(!socket||!userId)return;const receive=(s:LanternState)=>setState(s),reset=()=>setState({enabled:false,table:null}),load=()=>void send('get').catch(()=>{});socket.on('lantern:state',receive);socket.on('disconnect',reset);socket.on('connect',load);if(socket.connected)load();return()=>{socket.off('lantern:state',receive);socket.off('disconnect',reset);socket.off('connect',load);socket.volatile.emit('lantern:leave',{});};},[socket,userId,send]);
 return {state,send};
}
export function LanternEntry({light,enter,inside=false}:{light:'afternoon'|'evening';enter:()=>void;inside?:boolean}){
 return <section className={'lantern-entry '+light}><div><small>THE LANTERN LODGE</small><h3><Lamp size={18}/>{t('灯りの遊戯館')}</h3><p>{t(light==='evening'?'駅の奥に、灯りがともりました。':'昼は静かな庭。夕方には、窓に灯りがともります。')}</p></div><button className="outline" onClick={enter}>{t(inside?'同じ卓を囲む':'駅の奥へ')}<ArrowRight size={16}/></button></section>;
}
export function LanternLodge({game,userId,friends,worldId,light,travel,close,notify}:{game:ReturnType<typeof useLanternTable>;userId:string;friends:Friendship[];worldId:string;light:'afternoon'|'evening';travel:()=>Promise<unknown>;close:()=>void;notify:(s:string)=>void}){
 const [consent,setConsent]=useState(false),[tableId,setTableId]=useState<'moon'|'sun'>('moon'),[choice,setChoice]=useState<LanternChoice>('sun'),[bet,setBet]=useState(5),[busy,setBusy]=useState(false),[error,setError]=useState(''),[wallet,setWallet]=useState<EconomyState|null>(null),locked=useRef(false),live=useRef(true);
 const table=game.state.table,me=table?.members.find(m=>m.user.id===userId),version=table?{roundId:table.roundId,revision:table.revision}:{};
 const refresh=useCallback(async()=>{const w=await api<EconomyState>('/economy');if(live.current)setWallet(w);},[]);
 useEffect(()=>{live.current=true;void refresh().catch(e=>setError(e.message));return()=>{live.current=false;};},[refresh,table?.roundId,table?.result]);
 async function run(action:()=>Promise<unknown>){if(locked.current)return;locked.current=true;setBusy(true);setError('');try{await action();}catch(e){if(live.current)setError((e as Error).message);}finally{locked.current=false;if(live.current)setBusy(false);}}
 const act=(event:string,payload:object=version)=>run(()=>game.send(event,payload));
 const leave=()=>void run(async()=>{await game.send('leave');close();});
 return <Modal title={t('灯りの遊戯館')} close={()=>{if(!busy){if(table)leave();else close();}}} wide><div className={'lantern-lodge '+light}>
  <header className="lantern-hero"><span>THE LANTERN LODGE</span><h2>{t('同じ灯り、同じ一回。')}</h2><p>{t('席につくのも、遊ぶのも、自分で決める。友達と同じ結果を眺める、小さな寄り道。')}</p></header>
  <div className="lantern-body"><p className="lantern-rules">{t('無料チップ専用。購入・換金・コインとの交換はできません。太陽か月を選び、当たりは使った枚数だけ増え、外れは同じ枚数だけ減ります。確率は2分の1です。')}</p>
  <div className="economy-balances"><b>{tr('遊び用チップ {count}',{count:wallet?.chips||0})}</b><span>{t('ゲーム参加者と動画の閲覧者は別です')}</span></div>
  {error&&<div className="discovery-error" role="alert"><p>{error}</p><button className="outline" disabled={busy} onClick={()=>void run(async()=>{await game.send('get');await refresh();})}>{t('テーブルの状態を確認')}</button></div>}
  {(!wallet||!game.state.enabled)&&<p>{t('この遊びは公開準備中です')}</p>}
  {!table?<>
   <div className="lantern-table-choice"><button className="outline" aria-pressed={tableId==='moon'} onClick={()=>setTableId('moon')}><Moon/>{t('月の卓')}</button><button className="outline" aria-pressed={tableId==='sun'} onClick={()=>setTableId('sun')}><Sun/>{t('太陽の卓')}</button></div>
   <p>{t('一卓は最大6人。同じ卓の参加者に名前とアバターを表示します。場所への招待だけでは着席せず、マイクもオンにしません。')}</p><label className="inline-check"><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)}/>{t('名前とアバターを同じ卓の人に表示して参加する')}</label>
   <button className="primary" disabled={busy||!consent||!wallet?.arcadeEnabled||!game.state.enabled} onClick={()=>void run(async()=>{if(worldId!==lanternWorld)await travel();await game.send('join',{tableId,consent:true});setConsent(false);})}>{t('同意してこの卓につく')}</button>
  </>:<>
   <h3>{t(table.id==='moon'?'月の卓':'太陽の卓')} · {tr('{count}人が着席中',{count:table.members.length})}</h3>
   <div className="lantern-felt" aria-label={t('同じ卓の参加者')}><div className="lantern-wheel" aria-hidden="true"><Sun/><Moon/></div><div className="lantern-seats">{Array.from({length:6},(_,i)=>{const m=table.members[i];return <div key={m?.user.id||'empty'+i} className={'lantern-seat '+(!m?'is-empty':'')}>
    {m?<><Avatar color={m.user.color} style={m.user.style} size={36}/><strong>{m.user.displayName}</strong><small>{m.ready?tr('{choice} · {count}枚で準備済み',{choice:t(m.ready.choice==='sun'?'太陽':'月'),count:m.ready.bet}):t('準備を待っています')}</small></>:<><Armchair size={30}/><small>{t('空席')}</small></>}
   </div>;})}</div></div>
   {table.result?<section className="lantern-result" role="status"><h3>{tr('今回の結果は {choice}',{choice:t(table.result.outcome==='sun'?'太陽':'月')})}</h3><p>{tr('あなたのチップの増減 {count}',{count:table.result.results.find(r=>r.userId===userId)?.net||0})}</p><button className="primary" disabled={busy} onClick={()=>void act('next')}>{t('次の一回を用意する')}</button><p>{t('次も各自の準備が必要です。自動で続けません。')}</p></section>:<section>
    <fieldset disabled={busy||!!me?.ready}><legend>{t('この一回の選択')}</legend><div className="economy-actions"><button className="outline" aria-pressed={choice==='sun'} onClick={()=>setChoice('sun')}><Sun size={18}/>{t('太陽')}</button><button className="outline" aria-pressed={choice==='moon'} onClick={()=>setChoice('moon')}><Moon size={18}/>{t('月')}</button></div><label>{t('使うチップ（1〜20）')}<input aria-label={t('使うチップ（1〜20）')} type="number" min={1} max={20} value={bet} onChange={e=>setBet(Number(e.target.value))}/></label></fieldset>
    <div className="economy-actions">{me?.ready?<button className="outline" disabled={busy} onClick={()=>void act('unready')}>{t('準備を取り消す')}</button>:<button className="primary" disabled={busy||!Number.isInteger(bet)||bet<1||bet>20||(wallet?.chips||0)<bet} onClick={()=>void act('ready',{...version,choice,bet})}>{t('この一回の準備ができた')}</button>}<button className="primary" disabled={busy||!table.members.every(m=>m.ready)} onClick={()=>void act('resolve')}>{t('全員でこの一回を回す')}</button></div>
    <p className="fineprint">{t('全員の準備後、誰かが回すと同じ結果が届きます。準備中の退出は無料。人数が変わると準備をやり直します。')}</p>
   </section>}
   <button className="outline" disabled={busy} onClick={leave}>{t('席を離れる')}</button>
  </>}
  {wallet?.arcadeEnabled&&<button className="outline lantern-claim" disabled={busy||wallet.chipClaimed} onClick={()=>void run(async()=>{await api('/economy/chips/claim','POST',{});await refresh();})}>{wallet.chipClaimed?t('今日のチップは受取済み'):t('今日の100チップを受け取る')}</button>}
  <FriendDestinationSend target={{kind:'world',id:lanternWorld}} friends={friends} notify={notify}/><p className="fineprint">{t('友達には卓の名前も伝えてください。切断・移動で席を離れ、勝手に再参加しません。結果は暮らし・コインの記録でも確認できます。')}</p>
  </div></div></Modal>;
}
