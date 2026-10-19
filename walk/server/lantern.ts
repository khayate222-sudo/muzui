import {randomInt,randomUUID} from 'node:crypto';
import type {Server,Socket} from 'socket.io';
import {z} from 'zod';
import type {Store} from './db';
import type {PublicUser} from '../shared/community';
import {lanternWorld,lanternTables,type LanternTable,type LanternState} from '../shared/lantern';
type Seat={socketId:string;userId:string;ready:LanternTable['members'][number]['ready']};
type Table={id:LanternTable['id'];roundId:string;revision:number;members:Seat[];result:LanternTable['result']};
type Context={io:Server;store:Store;viewer:(socketId:string)=>{userId:string;worldId:string}|null;person:(userId:string)=>PublicUser|null;blocked:(a:string,b:string)=>boolean;entered:(socketId:string)=>void;changed:()=>void};
export function lanternPlay(c:Context){
 const tables=new Map<Table['id'],Table>(),sql=c.store.sqlite;
 const enabled=()=>process.env.WALK_PUBLIC_RELEASE!=='true'||process.env.WALK_ARCADE_ENABLED==='true';
 const fail=(message:string):never=>{throw new Error(message);};
 const current=(sid:string)=>[...tables.values()].find(t=>t.members.some(m=>m.socketId===sid));
 const chips=(user:string)=>(sql.prepare('SELECT COALESCE(SUM(delta),0) AS amount FROM play_chip_entries WHERE user_id=?').get(user) as {amount:number}).amount;
 const reset=(t:Table)=>{t.roundId=randomUUID();t.revision++;t.result=null;for(const m of t.members)m.ready=null;};
 function snapshot(sid:string):LanternState{const t=c.viewer(sid)?current(sid):undefined;return {enabled:enabled(),table:t?{id:t.id,roundId:t.roundId,revision:t.revision,members:t.members.flatMap(m=>{const user=c.person(m.userId);return user?[{user,ready:m.ready}]:[];}),result:t.result}:null};}
 const emit=(sid:string)=>c.io.to(sid).emit('lantern:state',snapshot(sid));
 const publish=(t:Table)=>{for(const m of t.members)emit(m.socketId);};
 function leave(sid:string){const t=current(sid);if(!t)return;t.members=t.members.filter(m=>m.socketId!==sid);if(t.members.length)reset(t);else tables.delete(t.id);emit(sid);publish(t);}
 function refresh(){for(const t of tables.values()){const removed=t.members.filter(m=>{const v=c.viewer(m.socketId);return !enabled()||!v||v.userId!==m.userId||v.worldId!==lanternWorld||t.members.some(other=>other.userId!==m.userId&&c.blocked(m.userId,other.userId));});if(!removed.length)continue;const ids=new Set(removed.map(m=>m.socketId));t.members=t.members.filter(m=>!ids.has(m.socketId));if(t.members.length)reset(t);else tables.delete(t.id);for(const m of removed)emit(m.socketId);publish(t);}}
 function attach(socket:Socket){
  const last=new Map<string,number>();
  function event(name:string,run:(data:unknown)=>void){socket.on('lantern:'+name,(data,ack)=>{try{const now=Date.now(),gap=name==='get'?80:name==='resolve'?150:100;if(now-(last.get(name)||0)<gap)fail('少し待ってから操作してください');last.set(name,now);refresh();if(name!=='get'&&name!=='leave'&&!enabled())fail('この遊びは公開準備中です');if(!c.viewer(socket.id))fail('接続が戻ってから参加してください');run(data);if(typeof ack==='function')ack({ok:true,state:snapshot(socket.id)});}catch(e){if(typeof ack==='function')ack({ok:false,error:e instanceof z.ZodError?'入力を確認してください':(e as Error).message});}});}
  event('get',()=>emit(socket.id));event('leave',()=>leave(socket.id));
  event('join',data=>{const p=z.object({tableId:z.enum(lanternTables),consent:z.literal(true)}).strict().parse(data),v=c.viewer(socket.id)!;if(v.worldId!==lanternWorld)fail('遊戯館へ移動してから席についてください');const old=current(socket.id);if(old){if(old.id===p.tableId)return;fail('今のテーブルから退出してください');}if([...tables.values()].some(t=>t.members.some(m=>m.userId===v.userId)))fail('別の画面でゲームに参加中です');const t=tables.get(p.tableId)||{id:p.tableId,roundId:randomUUID(),revision:0,members:[],result:null};if(t.members.length>=6)fail('このテーブルは6人までです');if(t.members.some(m=>c.blocked(v.userId,m.userId)))fail('このテーブルには参加できません');t.members.push({socketId:socket.id,userId:v.userId,ready:null});reset(t);tables.set(t.id,t);c.entered(socket.id);publish(t);});
  const version=z.object({roundId:z.string().uuid(),revision:z.number().int().positive()});
  function table(p:{roundId:string;revision:number},independent=false){const t=current(socket.id)||fail('同意して席についてから操作してください');if(t.roundId!==p.roundId||(independent?p.revision>t.revision:t.revision!==p.revision))fail('テーブルが更新されました。今の状態を確認してください');return t;}
  event('ready',data=>{const p=version.extend({choice:z.enum(['sun','moon']),bet:z.number().int().min(1).max(20)}).strict().parse(data),t=table(p,true);if(t.result)fail('次の一回を始めてから準備してください');const m=t.members.find(m=>m.socketId===socket.id)!;if(chips(m.userId)<p.bet)fail('遊び用チップが足りません');m.ready={choice:p.choice,bet:p.bet};t.revision++;publish(t);});
  event('unready',data=>{const p=version.strict().parse(data),t=table(p,true);if(t.result)return;t.members.find(m=>m.socketId===socket.id)!.ready=null;t.revision++;publish(t);});
  event('resolve',data=>{const p=version.strict().parse(data),existing=current(socket.id);if(existing?.roundId===p.roundId&&existing.result)return;const t=table(p);if(!t.members.length||t.members.some(m=>!m.ready))fail('全員がこの一回の準備をするまで待ってください');const requestId='table:'+t.roundId;
   const result=sql.transaction(()=>{for(const m of t.members){if(chips(m.userId)<m.ready!.bet)fail('参加者のチップが変わりました。準備を確認してください');if(sql.prepare('SELECT 1 FROM arcade_rounds WHERE user_id=? AND request_id=?').get(m.userId,requestId))fail('この一回はすでに記録されています。結果を確認してください');}const outcome=randomInt(2)===0?'sun' as const:'moon' as const,now=Date.now(),results=t.members.map(m=>{const {choice,bet}=m.ready!,net=choice===outcome?bet:-bet;sql.prepare('INSERT INTO play_chip_entries VALUES (?,?,?,?,?)').run(randomUUID(),m.userId,net,'round:'+requestId,now);sql.prepare('INSERT INTO arcade_rounds VALUES (?,?,?,?,?,?,?)').run(m.userId,requestId,choice,outcome,bet,net,now);return {userId:m.userId,net};});return {outcome,results};}).immediate();
   t.result=result;t.revision++;publish(t);c.changed();
  });
  event('next',data=>{const p=version.strict().parse(data),t=table(p);if(!t.result)fail('結果を見てから次の一回を始めてください');reset(t);publish(t);});socket.on('disconnect',()=>leave(socket.id));
 }
 return {attach,refresh,leave,close:()=>tables.clear()};
}
