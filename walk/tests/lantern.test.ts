import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {io,type Socket} from 'socket.io-client';
import {createApp} from '../server/app';
import {lanternWorld,type LanternState} from '../shared/lantern';
import type {Bootstrap,WorldState} from '../shared/model';
let instance:Awaited<ReturnType<typeof createApp>>,origin:string;
type Guest={cookie:string;data:Bootstrap};let a:Guest,b:Guest;const clients:Socket[]=[];
const states=new Map<Socket,LanternState>();
async function guest(){const r=await instance.app.inject({url:'/api/bootstrap'});return {cookie:r.headers['set-cookie']!.toString().split(';')[0],data:r.json()};}
const req=(g:Guest,path:string,method:'GET'|'POST'|'PUT'='GET',payload?:object)=>instance.app.inject({url:'/api'+path,method,headers:{cookie:g.cookie,'x-walk-client':'1'},payload});
async function connect(g:Guest){const s=io(origin,{transports:['websocket'],extraHeaders:{Cookie:g.cookie},forceNew:true,reconnection:false});clients.push(s);s.on('lantern:state',state=>states.set(s,state));await new Promise<void>((resolve,reject)=>{s.once('connect',resolve);s.once('connect_error',reject);});return s;}
const ack=(s:Socket,event:string,payload:object={})=>s.timeout(5000).emitWithAck(event,payload) as Promise<{ok:boolean;error?:string;state?:LanternState}>;
const act=(s:Socket,event:string,payload:object={})=>ack(s,'lantern:'+event,payload);
const seat=(s:Socket,tableId='moon')=>act(s,'join',{tableId,consent:true});
const version=(s:Socket)=>{const t=states.get(s)!.table!;return {roundId:t.roundId,revision:t.revision};};
const pause=(ms=120)=>new Promise(r=>setTimeout(r,ms));
async function waitFor(fn:()=>boolean){for(let n=0;n<200;n++){if(fn())return;await new Promise(r=>setTimeout(r,15));}throw new Error('Expected shared table state');}
async function ready(s:Socket,choice='sun',bet=5){const r=await act(s,'ready',{...version(s),choice,bet});expect(r.ok,r.error).toBe(true);return r;}
async function enter(g:Guest){const s=await connect(g);expect((await ack(s,'room:enter',{worldId:lanternWorld})).ok).toBe(true);return s;}
beforeEach(async()=>{instance=await createApp({database:':memory:',adminKey:'lantern-only-test-admin'});origin=await instance.app.listen({host:'127.0.0.1',port:0});a=await guest();b=await guest();});
afterEach(async()=>{vi.unstubAllEnvs();clients.splice(0).forEach(s=>s.disconnect());states.clear();await instance.app.close();});
it('requires a current lodge location and explicit consent, isolates tables and refuses duplicate user seats',async()=>{
 const sa=await connect(a);expect((await seat(sa)).ok).toBe(false);await ack(sa,'room:enter',{worldId:lanternWorld});await pause();expect((await act(sa,'join',{tableId:'moon',consent:false})).ok).toBe(false);await pause();const joined=await seat(sa);expect(joined.ok).toBe(true);expect(joined.state!.table!.members[0].user.id).toBe(a.data.user.id);
 const duplicate=await connect(a);expect((await seat(duplicate,'sun')).ok).toBe(false);const sb=await enter(b);expect((await act(sb,'get')).state!.table).toBe(null);expect((await seat(sb,'sun')).ok).toBe(true);expect(states.get(sa)!.table!.members).toHaveLength(1);expect(states.get(sb)!.table!.members).toHaveLength(1);expect(JSON.stringify(joined)).not.toMatch(/balance|coins|tokenHash/);
});
it('shares one server result, settles every ready member atomically and deduplicates concurrent spins without changing coins',async()=>{
 const sa=await enter(a),sb=await enter(b);for(const g of [a,b]){await req(g,'/economy/chips/claim','POST',{});await req(g,'/economy/coins/claim','POST',{});}await seat(sa);await seat(sb);await waitFor(()=>states.get(sa)?.table?.members.length===2);
 expect((await act(sa,'resolve',version(sa))).ok).toBe(false);await ready(sa,'sun',10);await waitFor(()=>states.get(sb)?.table?.members[0].ready!==null);await ready(sb,'moon',4);await waitFor(()=>states.get(sa)?.table?.members.every(m=>!!m.ready)===true);await pause(170);
 const payload=version(sa),both=await Promise.all([act(sa,'resolve',payload),act(sb,'resolve',payload)]);expect(both.every(r=>r.ok)).toBe(true);const result=both[0].state!.table!.result!;expect(both[1].state!.table!.result).toEqual(result);const win=result.outcome==='sun';expect((await req(a,'/economy')).json()).toMatchObject({coins:200,chips:win?110:90});expect((await req(b,'/economy')).json()).toMatchObject({coins:200,chips:win?96:104});
 await pause(170);expect((await act(sa,'resolve',payload)).state!.table!.result).toEqual(result);expect(instance.store.sqlite.prepare('SELECT COUNT(*) AS n FROM arcade_rounds').get()).toEqual({n:2});
 await act(sa,'next',version(sa));await waitFor(()=>states.get(sb)?.table?.result===null);expect(states.get(sa)!.table!.members.every(m=>m.ready===null)).toBe(true);expect((await act(sb,'resolve',version(sb))).ok).toBe(false);
});
it('clears readiness on seat changes, travelling, blocking and disconnect without charging a pending stake',async()=>{
 const sa=await enter(a),sb=await enter(b);await req(a,'/economy/chips/claim','POST',{});await req(b,'/economy/chips/claim','POST',{});await seat(sa);await seat(sb);await waitFor(()=>states.get(sa)?.table?.members.length===2);await ready(sa);const old=version(sa).roundId;await act(sb,'leave');await waitFor(()=>states.get(sa)?.table?.members.length===1);expect(states.get(sa)!.table!.members[0].ready).toBe(null);expect(version(sa).roundId).not.toBe(old);
 await pause();await seat(sb);await pause(220);await ack(sb,'room:enter',{worldId:'public'});await waitFor(()=>states.get(sb)?.table===null&&states.get(sa)?.table?.members.length===1);expect(states.get(sa)!.table!.members).toHaveLength(1);await req(a,'/blocks/'+b.data.user.id,'PUT',{blocked:true});await pause(220);await ack(sb,'room:enter',{worldId:lanternWorld});expect((await seat(sb)).ok).toBe(false);sa.disconnect();await pause();expect((await req(a,'/economy')).json().chips).toBe(100);expect(instance.store.sqlite.prepare('SELECT COUNT(*) AS n FROM arcade_rounds').get()).toEqual({n:0});
});
it('rolls back the whole shared round if any participant no longer has enough chips',async()=>{
 const sa=await enter(a),sb=await enter(b);for(const g of [a,b])await req(g,'/economy/chips/claim','POST',{});await seat(sa);await seat(sb);await waitFor(()=>states.get(sa)?.table?.members.length===2);await ready(sa,'sun',20);await waitFor(()=>states.get(sb)?.table?.members[0].ready!==null);await ready(sb,'moon',20);await waitFor(()=>states.get(sa)?.table?.members.every(m=>!!m.ready)===true);
 instance.store.sqlite.prepare('INSERT INTO play_chip_entries VALUES (?,?,?,?,?)').run('spent-before-spin',b.data.user.id,-100,'other-game',Date.now());const r=await act(sa,'resolve',version(sa));expect(r.ok).toBe(false);expect(r.error).toContain('チップ');expect((await req(a,'/economy')).json().chips).toBe(100);expect(instance.store.sqlite.prepare('SELECT COUNT(*) AS n FROM arcade_rounds').get()).toEqual({n:0});expect(states.get(sa)!.table!.result).toBe(null);
});
it('uses a separate request namespace from solo rounds and rejects invalid stakes or forged client outcomes',async()=>{
 const sa=await enter(a);await req(a,'/economy/chips/claim','POST',{});await seat(sa);const id=version(sa).roundId;expect((await req(a,'/economy/arcade/round','POST',{requestId:'table:'+id,choice:'sun',bet:1})).statusCode).toBe(400);expect((await req(a,'/economy/arcade/round','POST',{requestId:id,choice:'sun',bet:1})).statusCode).toBe(200);
 expect((await act(sa,'ready',{...version(sa),choice:'sun',bet:21})).ok).toBe(false);await pause();expect((await act(sa,'ready',{...version(sa),choice:'sun',bet:1,outcome:'sun'})).ok).toBe(false);await pause();await ready(sa,'moon',1);await act(sa,'resolve',version(sa));expect(instance.store.sqlite.prepare('SELECT request_id FROM arcade_rounds ORDER BY request_id').all()).toEqual([{request_id:id},{request_id:'table:'+id}].sort((a,b)=>a.request_id.localeCompare(b.request_id)));
});
it('keeps public simulated play disabled and never treats a seat as a video viewer',async()=>{
 const sa=await connect(a);let world:WorldState|undefined;sa.on('world',w=>world=w);await ack(sa,'visit',{postId:a.data.posts[0].id});await waitFor(()=>world?.counts[a.data.posts[0].id]===1);await pause(220);await ack(sa,'room:enter',{worldId:lanternWorld});await seat(sa);await waitFor(()=>!world?.counts[a.data.posts[0].id]);expect(world!.online).toBe(1);
 vi.stubEnv('WALK_PUBLIC_RELEASE','true');vi.stubEnv('WALK_ARCADE_ENABLED','false');await pause();const state=await act(sa,'get');expect(state.state).toEqual({enabled:false,table:null});expect((await seat(sa)).ok).toBe(false);
});
it('caps a table at six real users and removes deleted participants without deleting other players results',async()=>{
 const people=[a,b];for(let n=0;n<5;n++)people.push(await guest());const seats:Socket[]=[];for(const g of people){await req(g,'/economy/chips/claim','POST',{});seats.push(await enter(g));}for(const s of seats.slice(0,6))expect((await seat(s)).ok).toBe(true);expect((await seat(seats[6])).ok).toBe(false);await act(seats[0],'leave');await pause();expect((await seat(seats[6])).ok).toBe(true);
 const sb=seats[1];await req(b,'/account/delete','POST',{confirm:'DELETE'});await waitFor(()=>states.get(seats[2])?.table?.members.length===5);expect(states.get(seats[2])!.table!.members.some(m=>m.user.id===b.data.user.id)).toBe(false);expect(sb.connected).toBe(false);expect(instance.store.sqlite.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
});

it('invites a friend to the lodge without taking a seat or spending chips for either person',async()=>{
 await req(a,'/friendships','POST',{targetId:b.data.user.id});const pending=(await req(b,'/bootstrap')).json().friendships.find((f:{user:{id:string}})=>f.user.id===a.data.user.id);await instance.app.inject({url:'/api/friendships/'+pending.id,method:'PATCH',headers:{cookie:b.cookie,'x-walk-client':'1'},payload:{action:'accept'}});
 const sa=await enter(a),sb=await connect(b);const invite=await req(a,'/meetups','POST',{targetId:b.data.user.id,destination:{kind:'world',id:lanternWorld}});expect(invite.statusCode).toBe(200);const accepted=await req(b,'/meetups/'+invite.json().id+'/respond','POST',{accept:true});expect(accepted.statusCode).toBe(200);expect((await act(sa,'get')).state!.table).toBe(null);expect((await act(sb,'get')).state!.table).toBe(null);expect((await req(a,'/economy')).json().chips).toBe(0);expect((await req(b,'/economy')).json().chips).toBe(0);
});

it('accepts simultaneous independent preparation and cancellation without losing another players choice',async()=>{
 const sa=await enter(a),sb=await enter(b);for(const g of [a,b])await req(g,'/economy/chips/claim','POST',{});await seat(sa);await seat(sb);await waitFor(()=>states.get(sa)?.table?.members.length===2);const common=version(sa);
 const results=await Promise.all([act(sa,'ready',{...common,choice:'sun',bet:5}),act(sb,'ready',{...common,choice:'moon',bet:7})]);expect(results.every(r=>r.ok)).toBe(true);await waitFor(()=>states.get(sa)?.table?.members.every(m=>!!m.ready)===true);await pause();const next=version(sa);
 const changed=await Promise.all([act(sa,'unready',next),act(sb,'ready',{...next,choice:'sun',bet:3})]);expect(changed.every(r=>r.ok)).toBe(true);await waitFor(()=>states.get(sa)?.table?.members[1].ready?.bet===3&&states.get(sa)?.table?.members[0].ready===null);expect(states.get(sa)!.table!.members[0].ready).toBe(null);expect((await req(a,'/economy')).json().chips).toBe(100);expect((await req(b,'/economy')).json().chips).toBe(100);
});
