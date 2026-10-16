import {useCallback,useEffect,useState,useRef} from 'react';
import type {Socket} from 'socket.io-client';
import {Leaf,Moon,Star,House,Music,Ticket,Sparkles} from 'lucide-react';
import type {PlayState,PlaySymbol} from '../shared/play';
import Modal from './Modal';
import Avatar from './Avatar';

export function useCooperativePlay(socket:Socket|null,userId:string|undefined){
  const [state,setState]=useState<PlayState>({table:null});
  const send=useCallback(async(event:string,payload:object={})=>{
    if(!socket?.connected)throw new Error('接続が戻ってから操作してください');
    const result=await socket.timeout(5000).emitWithAck('play:'+event,payload).catch(()=>{throw new Error('操作を確認できませんでした。接続と現在のカードを確認してください。');}) as {ok:boolean;error?:string;state?:PlayState};
    if(!result.ok)throw new Error(result.error||'操作を確認できませんでした');
    // State events are ordered by the socket. Do not overwrite a newer event
    // with the snapshot from an earlier action's acknowledgement.
    return result;
  },[socket]);
  useEffect(()=>{
    if(!socket||!userId)return;
    const receive=(next:PlayState)=>setState(next),reset=()=>setState({table:null}),load=()=>void send('get').catch(()=>{});
    socket.on('play:state',receive);socket.on('disconnect',reset);socket.on('connect',load);if(socket.connected)load();
    return()=>{socket.off('play:state',receive);socket.off('disconnect',reset);socket.off('connect',load);socket.emit('play:leave',{},()=>{});};
  },[socket,userId,send]);
  return {state,send};
}
const names:Record<PlaySymbol,string>={leaf:'葉っぱ',moon:'月',star:'星',house:'家',note:'音符',ticket:'切符'};
const icons={leaf:Leaf,moon:Moon,star:Star,house:House,note:Music,ticket:Ticket};
export function PlayTogether({game,worldId,setup,closeSetup,entered,notify}:{game:ReturnType<typeof useCooperativePlay>;worldId:string;setup:boolean;closeSetup:()=>void;entered:()=>void;notify:(message:string)=>void}){
  const [consent,setConsent]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const table=game.state.table,wasSeated=useRef(false);
  useEffect(()=>{if(table&&!wasSeated.current){entered();closeSetup();setConsent(false);setError('');}wasSeated.current=!!table;},[table,entered,closeSetup]);
  useEffect(()=>{if(setup){setConsent(false);setError('');}},[setup,worldId]);
  async function act(event:string,payload:object={}){
    if(busy)return;setBusy(true);setError('');
    try{await game.send(event,payload);if(event==='join'){closeSetup();setConsent(false);}}catch(e){setError((e as Error).message);}finally{setBusy(false);}
  }
  function close(){void game.send('leave').catch(e=>notify(e.message));}
  if(!table&&!setup)return null;
  return <Modal title={table?'星の切符あわせ':'遊びのテーブルへ'} close={table?close:closeSetup} wide={!!table}>
    <div className="play-table">
      <div className="play-story"><span className="sheet-eyebrow"><Sparkles size={15}/> A LITTLE GAME TOGETHER</span><h2>{table?.complete?'星の切符が、そろった。':'窓辺の、星の切符あわせ。'}</h2><p>12枚の切符に隠れた、6つのペア。ひとりでも、居合わせた人とも、順番を決めずに協力できます。</p></div>
      {table?<>
        <div className="play-members" aria-label="ゲーム参加者">{table.members.map(m=><span key={m.id}><Avatar color={m.color} style={m.style} size={28}/>{m.displayName}</span>)}</div>
        <div className="play-progress" role="status"><b>{table.matched.length/2} / 6 ペア</b><span>{table.turns}回の組み合わせ · {table.members.length}/6人</span></div>
        <div className="play-cards" aria-label="切符のカード">{table.cards.map((symbol,index)=>{const Icon=symbol?icons[symbol]:Star,matched=table.matched.includes(index);return <button key={index} className={'play-card'+(symbol?' revealed':'')+(matched?' matched':'')} aria-label={`${index+1}枚目・${matched?'そろった・':''}${symbol?names[symbol]:'裏向き'}`} disabled={busy||!!symbol||table.revealed.length===2} onClick={()=>void act('flip',{roundId:table.roundId,revision:table.revision,index})}><Icon aria-hidden="true" size={32}/><small>{symbol?names[symbol]:'WALK'}</small></button>;})}</div>
        {table.complete&&<div className="play-complete"><Sparkles size={23}/><p>同じ時間を、少しだけ一緒に。もう一局でも、次の寄り道でも。</p><button className="primary" disabled={busy} onClick={()=>void act('restart',{roundId:table.roundId,revision:table.revision})}>もう一局あそぶ</button></div>}
        <p className="fineprint">カードは参加者全員に同時に反映されます。閲覧者数や同期視聴グループとは別の参加です。進み具合は今回の一局だけのものです。全員が席を離れると終了します。</p>
        <button className="outline full" disabled={busy} onClick={close}>テーブルから退出する</button>
      </>:<>
        <div className="play-preview" aria-hidden="true"><Ticket/><Moon/><Leaf/><Music/></div><p>同じ場所の人と最大6人。ゲームへの参加でマイクをオンにしません。音声パーティに参加中の場合は、そちらの設定が続きます。現在の動画を閉じ、同期視聴からは離れます。ほかの人を自動参加させることはありません。</p>
        <label className="privacy-check"><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)}/><span>名前とアバターをゲーム参加者に表示して参加する</span></label>
        <button className="primary full" disabled={!consent||busy} onClick={()=>void act('join',{worldId,consent:true})}>{busy?'参加を確認中…':'同意してテーブルにつく'}</button>
      </>}
      {error&&<p role="alert" className="workshop-error">{error}</p>}
    </div>
  </Modal>;
}
