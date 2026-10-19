import {randomInt,randomUUID} from 'node:crypto';
import type {Server,Socket} from 'socket.io';
import {z} from 'zod';
import type {PublicUser} from '../shared/community';
import {playSymbols,type PlayState,type PlaySymbol} from '../shared/play';

type Member={socketId:string;userId:string};
type Table={worldId:string;roundId:string;revision:number;members:Member[];deck:PlaySymbol[];revealed:number[];matched:Set<number>;turns:number;timer?:ReturnType<typeof setTimeout>};
type Context={io:Server;viewer:(socketId:string)=>{userId:string;worldId:string}|null;allowed:(worldId:string,userId:string)=>boolean;person:(userId:string)=>PublicUser|null;blocked:(a:string,b:string)=>boolean;entered:(socketId:string)=>void};
export function cooperativePlay(c:Context){
  const tables=new Map<string,Table>(),lastFlip=new Map<string,number>();
  const tableFor=(socketId:string)=>[...tables.values()].find(t=>t.members.some(m=>m.socketId===socketId));
  function fresh(worldId:string,members:Member[]):Table{
    const deck=[...playSymbols,...playSymbols];
    for(let i=deck.length-1;i>0;i--){const j=randomInt(i+1);[deck[i],deck[j]]=[deck[j],deck[i]];}
    return {worldId,roundId:randomUUID(),revision:1,members,deck,revealed:[],matched:new Set(),turns:0};
  }
  function snapshot(socketId:string):PlayState{
    const t=c.viewer(socketId)?tableFor(socketId):undefined;
    return {table:t?{worldId:t.worldId,roundId:t.roundId,revision:t.revision,members:t.members.flatMap(m=>{const u=c.person(m.userId);return u?[u]:[];}),cards:t.deck.map((value,i)=>t.matched.has(i)||t.revealed.includes(i)?value:null),revealed:[...t.revealed],matched:[...t.matched],turns:t.turns,complete:t.matched.size===t.deck.length}:null};
  }
  const emit=(socketId:string)=>c.io.to(socketId).emit('play:state',snapshot(socketId));
  function publish(t:Table){for(const m of t.members)emit(m.socketId);}
  function dropEmpty(t:Table){if(!t.members.length){clearTimeout(t.timer);tables.delete(t.worldId);}}
  function leave(socketId:string){const t=tableFor(socketId);if(!t)return;const member=t.members.find(m=>m.socketId===socketId)!;t.members=t.members.filter(m=>m.socketId!==socketId);lastFlip.delete(member.userId);dropEmpty(t);emit(socketId);publish(t);}
  function refresh(){
    for(const t of tables.values()){
      const removed=t.members.filter(m=>{const v=c.viewer(m.socketId);return !v||v.userId!==m.userId||v.worldId!==t.worldId||!c.allowed(t.worldId,m.userId)||t.members.some(other=>other.userId!==m.userId&&c.blocked(m.userId,other.userId));});
      if(!removed.length)continue;
      const ids=new Set(removed.map(m=>m.socketId));t.members=t.members.filter(m=>!ids.has(m.socketId));dropEmpty(t);
      for(const m of removed){lastFlip.delete(m.userId);emit(m.socketId);}publish(t);
    }
  }
  function attach(socket:Socket){
    const requests=new Map<string,number>();
    type Reply=(r:{ok:boolean;error?:string;state?:PlayState})=>void;
    function event(name:string,run:(data:unknown)=>void){socket.on('play:'+name,(data,ack)=>{try{const gap=name==='get'?80:name==='join'?200:name==='restart'?500:0,now=Date.now();if(gap&&now-(requests.get(name)||0)<gap)throw new Error('少し待ってから操作してください');requests.set(name,now);refresh();run(data);if(typeof ack==='function')(ack as Reply)({ok:true,state:snapshot(socket.id)});}catch(e){if(typeof ack==='function')(ack as Reply)({ok:false,error:e instanceof z.ZodError?'入力を確認してください':(e as Error).message});}});}
    const fail=(message:string):never=>{throw new Error(message);};
    const me=()=>c.viewer(socket.id)||fail('接続が戻ってから参加してください');
    event('get',()=>emit(socket.id));
    event('join',data=>{
      const p=z.object({worldId:z.string().min(1).max(80),consent:z.literal(true)}).strict().parse(data),v=me();
      if(v.worldId!==p.worldId||!c.allowed(p.worldId,v.userId))fail('遊ぶ場所へ移動してから参加してください');
      const old=tableFor(socket.id);if(old){if(old.worldId===p.worldId)return;fail('今のゲームから退出してください');}
      if([...tables.values()].some(t=>t.members.some(m=>m.userId===v.userId)))fail('別の画面でゲームに参加中です');
      const t=tables.get(p.worldId)||fresh(p.worldId,[]);
      if(t.members.length>=6)fail('このテーブルは6人までです');
      if(t.members.some(m=>c.blocked(v.userId,m.userId)))fail('このテーブルには参加できません');
      t.members.push({socketId:socket.id,userId:v.userId});tables.set(p.worldId,t);c.entered(socket.id);publish(t);
    });
    const moveSchema=z.object({roundId:z.string().uuid(),revision:z.number().int().positive(),index:z.number().int().min(0).max(11)}).strict();
    event('flip',data=>{
      const p=moveSchema.parse(data),v=me(),t=tableFor(socket.id)||fail('参加してからカードを選んでください');
      if(t.roundId!==p.roundId||t.revision!==p.revision)fail('カードが更新されました。もう一度選んでください');
      if(t.revealed.length===2||t.matched.size===t.deck.length||t.matched.has(p.index)||t.revealed.includes(p.index))fail('裏向きのカードを選んでください');
      if(Date.now()-(lastFlip.get(v.userId)||0)<250)fail('少し待ってから選んでください');lastFlip.set(v.userId,Date.now());
      t.revealed.push(p.index);t.revision++;
      if(t.revealed.length===2){
        t.turns++;const [a,b]=t.revealed;
        if(t.deck[a]===t.deck[b]){t.matched.add(a);t.matched.add(b);t.revealed=[];}
        else {t.timer=setTimeout(()=>{if(tables.get(t.worldId)!==t)return;t.revealed=[];t.revision++;t.timer=undefined;publish(t);},1200);t.timer.unref();}
      }
      publish(t);
    });
    event('restart',data=>{
      const p=z.object({roundId:z.string().uuid(),revision:z.number().int().positive()}).strict().parse(data),t=tableFor(socket.id)||fail('参加してから操作してください');
      if(t.roundId!==p.roundId||t.revision!==p.revision||t.matched.size!==t.deck.length)fail('すべてのペアが揃ってから次の一局へ進めます');
      const next=fresh(t.worldId,t.members);tables.set(t.worldId,next);publish(next);
    });
    event('leave',()=>leave(socket.id));socket.on('disconnect',()=>leave(socket.id));
  }
  return {attach,refresh,leave,close:()=>{for(const t of tables.values())clearTimeout(t.timer);tables.clear();lastFlip.clear();}};
}
