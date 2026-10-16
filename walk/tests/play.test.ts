import {beforeEach,afterEach,it,expect} from 'vitest';
import {io,type Socket} from 'socket.io-client';
import {createApp} from '../server/app';
import type {Bootstrap,WorldState} from '../shared/model';
import type {PlayState,PlayTable} from '../shared/play';
let instance:Awaited<ReturnType<typeof createApp>>,origin:string;
type Guest={cookie:string;data:Bootstrap};let a:Guest,b:Guest;
const clients:Socket[]=[];
async function guest(){const r=await instance.app.inject({url:'/api/bootstrap'});return {cookie:r.headers['set-cookie']!.toString().split(';')[0],data:r.json()};}
const req=(g:Guest,path:string,method:'GET'|'POST'|'PUT'|'PATCH'|'DELETE'='GET',payload?:object)=>instance.app.inject({url:'/api'+path,method,headers:{cookie:g.cookie,'x-walk-client':'1'},payload});
async function connect(g:Guest){const s=io(origin,{transports:['websocket'],extraHeaders:{Cookie:g.cookie},forceNew:true,reconnection:false});clients.push(s);await new Promise<void>((resolve,reject)=>{s.once('connect',resolve);s.once('connect_error',reject);});return s;}
const ack=(s:Socket,event:string,payload:object={})=>s.timeout(5000).emitWithAck(event,payload) as Promise<{ok:boolean;error?:string;state?:PlayState}>;
const join=(s:Socket,worldId='world:game')=>ack(s,'play:join',{worldId,consent:true});
async function waitFor(fn:()=>boolean){const end=Date.now()+5000;while(!fn()){if(Date.now()>end)throw new Error('Expected real-time state');await new Promise(r=>setTimeout(r,20));}}
const pause=(ms=260)=>new Promise(r=>setTimeout(r,ms));
beforeEach(async()=>{instance=await createApp({database:':memory:',adminKey:'play-test-admin'});origin=await instance.app.listen({host:'127.0.0.1',port:0});a=await guest();b=await guest();});
afterEach(async()=>{clients.splice(0).forEach(s=>s.disconnect());await instance.app.close();});
it('requires consent and the current authorized place, redacts cards, and deduplicates users across tabs',async()=>{
  const sa=await connect(a),sb=await connect(b),tab=await connect(a);
  expect((await join(sa)).ok).toBe(false);
  await ack(sa,'room:enter',{worldId:'world:game'});await pause();
  expect((await ack(sa,'play:join',{worldId:'world:game',consent:false})).ok).toBe(false);await pause();
  const result=await join(sa);expect(result.ok).toBe(true);expect(result.state!.table!.cards).toEqual(Array(12).fill(null));
  expect(result.state!.table!.members.map(p=>p.id)).toEqual([a.data.user.id]);expect(JSON.stringify(result)).not.toContain('deck');
  expect((await join(tab)).ok).toBe(false);expect((await ack(sb,'play:get')).state).toEqual({table:null});
  expect((await ack(sb,'play:flip',{roundId:result.state!.table!.roundId,revision:1,index:0})).ok).toBe(false);
});
it('serializes concurrent card choices, rejects forged moves and resolves only visible pairs',async()=>{
  const sa=await connect(a),sb=await connect(b);let wa:PlayState|undefined,wb:PlayState|undefined;sa.on('play:state',w=>wa=w);sb.on('play:state',w=>wb=w);
  await ack(sa,'room:enter',{worldId:'world:game'});await ack(sb,'room:enter',{worldId:'world:game'});await join(sa);await join(sb);
  const initial=wa!.table!,move={roundId:initial.roundId,revision:initial.revision,index:0};
  const both=await Promise.all([ack(sa,'play:flip',move),ack(sb,'play:flip',move)]);expect(both.map(r=>r.ok).sort()).toEqual([false,true]);await waitFor(()=>wa?.table?.revision===2&&wb?.table?.revision===2);
  expect(wa!.table!.cards.filter(Boolean)).toHaveLength(1);expect(wa!.table!.cards).toEqual(wb!.table!.cards);
  expect((await ack(sa,'play:flip',{...move,index:13})).ok).toBe(false);expect((await ack(sa,'play:flip',{...move,index:1,matched:[0,1]})).ok).toBe(false);
  await pause();const next=await ack(sa,'play:flip',{roundId:initial.roundId,revision:2,index:1});expect(next.ok).toBe(true);
  expect(next.state!.table!.turns).toBe(1);expect(next.state!.table!.cards.filter(Boolean)).toHaveLength(2);
  if(next.state!.table!.matched.length===0){await waitFor(()=>wa?.table?.revealed.length===0&&wa?.table?.revision===4);expect(wa!.table!.cards).toEqual(Array(12).fill(null));}
  expect((await ack(sa,'play:restart',{roundId:initial.roundId,revision:wa!.table!.revision})).ok).toBe(false);
});
it('removes departed, blocked and disconnected participants and leaves no game after everyone leaves',async()=>{
  const sa=await connect(a),sb=await connect(b);let wa:PlayState|undefined,wb:PlayState|undefined;sa.on('play:state',w=>wa=w);sb.on('play:state',w=>wb=w);
  await ack(sa,'room:enter',{worldId:'world:game'});await ack(sb,'room:enter',{worldId:'world:game'});const first=await join(sa);await join(sb);await waitFor(()=>wa?.table?.members.length===2);
  await req(a,'/blocks/'+b.data.user.id,'PUT',{blocked:true});await waitFor(()=>wa?.table===null&&wb?.table===null);
  await req(a,'/blocks/'+b.data.user.id,'PUT',{blocked:false});await pause();const fresh=await join(sa);expect(fresh.state!.table!.roundId).not.toBe(first.state!.table!.roundId);
  await pause();await join(sb);await pause();await ack(sb,'room:enter',{worldId:'public'});await waitFor(()=>wa?.table?.members.length===1&&wb?.table===null);
  sa.disconnect();await pause();await ack(sb,'room:enter',{worldId:'world:game'});await pause();const last=await join(sb);expect(last.state!.table!.roundId).not.toBe(fresh.state!.table!.roundId);expect(last.state!.table!.cards).toEqual(Array(12).fill(null));
});
it('limits a table to six distinct consenting people and frees the seat when someone leaves',async()=>{
  const people=[a,b];for(let i=0;i<5;i++)people.push(await guest());
  const seats:Socket[]=[];
  for(const person of people){const s=await connect(person);seats.push(s);await ack(s,'room:enter',{worldId:'world:game'});}
  for(const s of seats.slice(0,6))expect((await join(s)).ok).toBe(true);
  const full=await join(seats[6]);expect(full.ok).toBe(false);expect(full.error).toContain('6人');
  await ack(seats[0],'play:leave');await pause();const entered=await join(seats[6]);expect(entered.ok).toBe(true);expect(entered.state!.table!.members).toHaveLength(6);
  expect(entered.state!.table!.members.some(m=>m.id===a.data.user.id)).toBe(false);
});
it('keeps room games subject to room access and separates game members from real video viewers',async()=>{
  const post=a.data.posts[0];await req(a,'/favorites/'+post.id,'PUT',{saved:true});
  const room=(await req(a,'/rooms','POST',{title:'みんなの窓辺',description:'',isPublic:true,theme:'studio',items:[{postId:post.id,x:900,y:700}],decorations:[]})).json();
  const sa=await connect(a),sb=await connect(b);let world:WorldState|undefined,wb:PlayState|undefined;sa.on('world',w=>world=w);sb.on('play:state',w=>wb=w);
  await ack(sa,'room:enter',{worldId:room.id});await ack(sb,'room:enter',{worldId:room.id});await ack(sa,'visit',{postId:post.id});await ack(sb,'visit',{postId:post.id});await waitFor(()=>world?.counts[post.id]===2);
  expect((await join(sa,room.id)).ok).toBe(true);await waitFor(()=>world?.counts[post.id]===1);await join(sb,room.id);await waitFor(()=>!world?.counts[post.id]);
  expect(wb!.table!.members).toHaveLength(2);expect(world!.viewers[post.id]||[]).toEqual([]);
  await req(a,'/rooms/'+room.id,'PUT',{...room,isPublic:false,revision:room.revision});await waitFor(()=>wb?.table===null);
  await pause();expect((await join(sb,room.id)).ok).toBe(false);
});
it('lets two real players solve the shared puzzle and starts a fresh round without exposing hidden cards',async()=>{
  const sa=await connect(a),sb=await connect(b);let current:PlayTable|undefined;sa.on('play:state',w=>current=w.table||undefined);
  await ack(sa,'room:enter',{worldId:'world:game'});await ack(sb,'room:enter',{worldId:'world:game'});await join(sa);await join(sb);
  const memory=new Map<number,string>(),round=current!.roundId;
  for(let turn=0;!current!.complete&&turn<20;turn++){
    const t=current!,remaining=[...Array(12).keys()].filter(i=>!t.matched.includes(i));
    let known:number[]|undefined;
    for(const i of remaining){const j=remaining.find(j=>j!==i&&memory.has(i)&&memory.get(j)===memory.get(i));if(j!==undefined){known=[i,j];break;}}
    const first=known?.[0]??remaining.find(i=>!memory.has(i))!;expect(first).toBeDefined();
    await pause();const one=await ack(sa,'play:flip',{roundId:round,revision:current!.revision,index:first});expect(one.ok).toBe(true);const opened=one.state!.table!;memory.set(first,opened.cards[first]!);
    const second=known?.[1]??remaining.find(j=>j!==first&&memory.get(j)===memory.get(first))??remaining.find(j=>j!==first&&!memory.has(j))!;
    const two=await ack(sb,'play:flip',{roundId:round,revision:opened.revision,index:second});expect(two.ok).toBe(true);memory.set(second,two.state!.table!.cards[second]!);
    await waitFor(()=>current?.revealed.length===0);
  }
  expect(current!.complete).toBe(true);expect(current!.matched).toHaveLength(12);expect(current!.turns).toBeGreaterThanOrEqual(6);
  const next=await ack(sa,'play:restart',{roundId:round,revision:current!.revision});expect(next.ok).toBe(true);expect(next.state!.table!.roundId).not.toBe(round);expect(next.state!.table!.cards).toEqual(Array(12).fill(null));
  expect((await ack(sb,'play:flip',{roundId:round,revision:1,index:0})).ok).toBe(false);
},30000);
