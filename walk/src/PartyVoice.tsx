import { useCallback, useEffect, useRef, useState } from 'react';
import type { Socket } from 'socket.io-client';
import type { Bootstrap } from '../shared/model';
import type { PartyState, VoiceMember } from '../shared/community';
import Modal from './Modal';
import { api } from './api';

type Signal={from:string;description?:RTCSessionDescriptionInit;candidate?:RTCIceCandidateInit};
export default function PartyVoice({socket,data,notify}:{socket:Socket|null;data:Bootstrap;notify:(s:string)=>void}){
  const [state,setState]=useState<PartyState>({party:null,invites:[]}),[open,setOpen]=useState(false),[active,setActive]=useState(false),[muted,setMuted]=useState(false),[busy,setBusy]=useState(false),[members,setMembers]=useState<VoiceMember[]>([]),[statuses,setStatuses]=useState<Record<string,string>>({}),[blockedAudio,setBlockedAudio]=useState(false);
  const connectTimers=useRef(new Map<string,ReturnType<typeof setTimeout>>());
  const stream=useRef<MediaStream|null>(null),pcs=useRef(new Map<string,RTCPeerConnection>()),audio=useRef(new Map<string,HTMLAudioElement>()),ice=useRef<RTCIceServer[]>([]),candidates=useRef(new Map<string,RTCIceCandidateInit[]>()),live=useRef(false),generation=useRef(0),joining=useRef(false);
  const reload=useCallback(async()=>setState(await api<PartyState>('/party')),[]);
  const stop=useCallback(()=>{generation.current++;for(const timer of connectTimers.current.values())clearTimeout(timer);connectTimers.current.clear();live.current=false;joining.current=false;stream.current?.getTracks().forEach(t=>t.stop());stream.current=null;for(const p of pcs.current.values())p.close();pcs.current.clear();for(const a of audio.current.values()){a.pause();a.srcObject=null;}audio.current.clear();candidates.current.clear();setActive(false);setMuted(false);setMembers([]);setStatuses({});setBlockedAudio(false);setBusy(false);},[]);
  useEffect(()=>{void reload().catch(()=>{});},[reload]);
  useEffect(()=>{
    if(!socket)return;
    const partyChanged=()=>void reload().catch(()=>{});
    const fail=(error:unknown)=>{if(live.current)notify('音声の接続に失敗しました。再参加してください。'+(error instanceof Error?' '+error.message:''));};
    const peer=(id:string)=>{
      const existing=pcs.current.get(id);if(existing)return existing;
      const pc=new RTCPeerConnection({iceServers:ice.current});pcs.current.set(id,pc);
      stream.current?.getTracks().forEach(t=>pc.addTrack(t,stream.current!));
      connectTimers.current.set(id,setTimeout(()=>{if(live.current&&pcs.current.get(id)===pc&&pc.connectionState!=='connected'){setStatuses(prev=>({...prev,[id]:'failed'}));notify('音声がつながりません。音声から退出して再参加するか、サーバーのTURN設定を確認してください。');}},20000));
      pc.onicecandidate=e=>{if(e.candidate&&live.current)socket.emit('voice:signal',{to:id,candidate:e.candidate.toJSON()});};
      pc.ontrack=e=>{let el=audio.current.get(id);if(!el){el=new Audio();el.autoplay=true;audio.current.set(id,el);}el.srcObject=e.streams[0]||new MediaStream([e.track]);void el.play().catch(()=>setBlockedAudio(true));};
      pc.onconnectionstatechange=()=>{if(pc.connectionState==='connected')clearTimeout(connectTimers.current.get(id));if(live.current){setStatuses(prev=>({...prev,[id]:pc.connectionState}));if(pc.connectionState==='failed')notify('音声がつながりません。別ネットワーク間ではサーバーのSTUN/TURN設定が必要な場合があります。');}};
      return pc;
    };
    const receive=async(s:Signal)=>{if(!live.current)return;const pc=peer(s.from);if(s.description){await pc.setRemoteDescription(s.description);for(const candidate of candidates.current.get(s.from)||[])await pc.addIceCandidate(candidate);candidates.current.delete(s.from);if(s.description.type==='offer'){await pc.setLocalDescription(await pc.createAnswer());if(live.current)socket.emit('voice:signal',{to:s.from,description:pc.localDescription?.toJSON()});}}else if(s.candidate){if(pc.remoteDescription)await pc.addIceCandidate(s.candidate);else candidates.current.set(s.from,[...(candidates.current.get(s.from)||[]),s.candidate].slice(-100));}};
    const updated=(people:VoiceMember[])=>{if(!live.current)return;setMembers(people);const ids=new Set(people.map(m=>m.socketId));for(const [id,pc]of pcs.current)if(!ids.has(id)){clearTimeout(connectTimers.current.get(id));connectTimers.current.delete(id);pc.close();pcs.current.delete(id);const a=audio.current.get(id);if(a){a.pause();a.srcObject=null;audio.current.delete(id);}candidates.current.delete(id);}for(const member of people){const id=member.socketId;if(id===socket.id||pcs.current.has(id))continue;const pc=peer(id);if((socket.id||'')<id)void (async()=>{await pc.setLocalDescription(await pc.createOffer());if(live.current)socket.emit('voice:signal',{to:id,description:pc.localDescription?.toJSON()});})().catch(fail);}};
    const signal=(s:Signal)=>{void receive(s).catch(fail);};
    socket.on('party',partyChanged);socket.on('voice:members',updated);socket.on('voice:signal',signal);socket.on('voice:stopped',stop);socket.on('disconnect',stop);
    return()=>{socket.emit('voice:leave');socket.off('party',partyChanged);socket.off('voice:members',updated);socket.off('voice:signal',signal);socket.off('voice:stopped',stop);socket.off('disconnect',stop);stop();};
  },[socket,reload,stop,notify]);
  async function join(){
    if(joining.current||live.current)return;
    if(!socket?.connected){notify('接続が戻ってから参加してください');return;}
    if(!navigator.mediaDevices?.getUserMedia){notify('マイクは localhost または HTTPS で利用できます。ブラウザのマイク設定を確認してください。');return;}
    joining.current=true;setBusy(true);const token=++generation.current;
    try{
      const media=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true},video:false});
      if(token!==generation.current){media.getTracks().forEach(t=>t.stop());return;}
      stream.current=media;
      media.getTracks().forEach(t=>{t.onended=()=>{socket.emit('voice:leave');stop();notify('マイクの接続が終了しました');};});
      const result=await socket.timeout(5000).emitWithAck('voice:join',{}) as {ok:boolean;error?:string;members:VoiceMember[];iceServers:RTCIceServer[]};
      if(token!==generation.current){socket.emit('voice:leave');return;}
      if(!result.ok)throw new Error(result.error||'参加できませんでした');
      ice.current=result.iceServers;live.current=true;setActive(true);setMembers(result.members);
      // Replay the membership event after the acknowledgement has installed the ICE configuration.
      const listeners=socket.listeners('voice:members');for(const listener of listeners)listener(result.members);
    }catch(e){stop();notify(e instanceof Error?e.message:'マイクを使用できません');}finally{joining.current=false;setBusy(false);}
  }
  useEffect(()=>{const background=()=>{socket?.emit('voice:leave');stop();};window.addEventListener('walk:background',background);return()=>window.removeEventListener('walk:background',background);},[socket,stop]);
  async function action(path:string,body?:object){try{await api(path,'POST',body||{});await reload();}catch(e){notify((e as Error).message);}}
  return <><div className={'party-launcher '+(active?'voice-live':'')}><button onClick={()=>{setOpen(true);void reload().catch(()=>{});}}>♬ パーティ{state.invites.length>0?` · 招待 ${state.invites.length}`:state.party?` · ${state.party.members.length}人`:''}{active?' · 音声参加中':''}</button>{active&&<button aria-label={muted?'マイクをオン':'マイクをミュート'} onClick={()=>{stream.current?.getAudioTracks().forEach(t=>t.enabled=muted);setMuted(!muted);}}>{muted?'ミュート中':'マイクON'}</button>}</div>{open&&<Modal title="友達とパーティ" close={()=>setOpen(false)}><div className="party-panel"><h2>寄り道を、一緒に。</h2><p>承認済みの友達と最大6人。音声参加ボタンを押した人だけマイクを使います。</p>{state.invites.map(i=><div key={i.id} className="party-invite"><strong>{i.from.displayName} からの招待</strong><div className="feature-buttons"><button className="primary" onClick={()=>void action('/party/respond',{id:i.id,accept:true})}>参加する</button><button className="outline" onClick={()=>void action('/party/respond',{id:i.id,accept:false})}>辞退</button></div></div>)}{state.party&&<><h3>いまのパーティ · {state.party.members.length}/6</h3>{state.party.members.map(m=><div key={m.id} className="room-row"><span>{m.displayName}{m.id===data.user.id?'（あなた）':''}</span><small>{members.some(p=>p.userId===m.id)?m.id===data.user.id?'マイク参加中':members.filter(p=>p.userId===m.id).some(p=>statuses[p.socketId]==='connected')?'音声接続済み':members.filter(p=>p.userId===m.id).some(p=>statuses[p.socketId]==='failed')?'接続できません':'音声接続中':'音声には未参加'}</small></div>)}<div className="feature-buttons">{active?<><button className="primary" onClick={()=>{stream.current?.getAudioTracks().forEach(t=>t.enabled=muted);setMuted(!muted);}}>{muted?'マイクをオン':'マイクをミュート'}</button><button className="outline" onClick={()=>{socket?.emit('voice:leave');stop();}}>音声から退出</button></>:<button className="primary" disabled={busy||!socket?.connected} onClick={()=>void join()}>{busy?'マイクを準備中…':'マイクを許可して音声参加'}</button>}<button className="outline" onClick={()=>void action('/party/leave')}>パーティを退出</button></div>{blockedAudio&&<button className="primary" onClick={()=>{for(const a of audio.current.values())void a.play().catch(()=>notify('ブラウザの音声再生設定を確認してください'));setBlockedAudio(false);}}>相手の音声を再生する</button>}<p className="fineprint">マイク音声は参加者同士で送受信し、WALKでは録音しません。別ネットワーク間の接続には運営側のSTUN/TURN設定が必要な場合があります。</p></>}<h3>友達を招待</h3>{data.friendships.filter(f=>f.status==='accepted'&&!state.party?.members.some(m=>m.id===f.user.id)).map(f=><div className="room-row" key={f.id}><span>{f.user.displayName}</span><button className="outline" onClick={()=>void action('/party/invite',{targetId:f.user.id})}>パーティに招待</button></div>)}{!data.friendships.some(f=>f.status==='accepted')&&<p>アバターのプロフィールから交流リクエストを送り、お互いに承認すると招待できます。</p>}</div></Modal>}</>;
}
