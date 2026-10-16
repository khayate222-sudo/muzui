import { beforeEach,afterEach,it,expect } from 'vitest';
import { mkdtempSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { io,type Socket } from 'socket.io-client';
import {createApp} from '../server/app';
import {pathTo,postWorld,places,type Place} from '../shared/worlds';
import type {Bootstrap,WorldState} from '../shared/model';
let instance:Awaited<ReturnType<typeof createApp>>,directory:string,origin:string;
type Guest={cookie:string;data:Bootstrap};let a:Guest,b:Guest;
const sockets:Socket[]=[];
const draft={title:'ピアノの小さな庭',description:'同じ音が好きな人へ',landscape:'music'};
async function guest(){const r=await instance.app.inject({url:'/api/bootstrap'});return {cookie:r.headers['set-cookie']!.toString().split(';')[0],data:r.json()};}
const req=(g:Guest,path:string,method:'GET'|'POST'|'PUT'|'DELETE'|'PATCH'='GET',payload?:object)=>instance.app.inject({url:'/api'+path,method,headers:{cookie:g.cookie,'x-walk-client':'1'},payload});
const create=(g:Guest,parentId='world:music')=>req(g,'/worlds','POST',{...draft,parentId});
async function connect(g:Guest){const s=io(origin,{transports:['websocket'],extraHeaders:{Cookie:g.cookie},forceNew:true,reconnection:false});sockets.push(s);await new Promise<void>((resolve,reject)=>{s.once('connect',resolve);s.once('connect_error',reject);});return s;}
const ack=(s:Socket,event:string,payload:object)=>s.timeout(5000).emitWithAck(event,payload);
async function until(fn:()=>boolean){const end=Date.now()+5000;while(!fn()){if(Date.now()>end)throw new Error('Expected world state');await new Promise(r=>setTimeout(r,20));}}
beforeEach(async()=>{directory=mkdtempSync(join(tmpdir(),'walk-worlds-'));instance=await createApp({database:join(directory,'app.sqlite'),adminKey:'worlds-test-admin'});origin=await instance.app.listen({host:'127.0.0.1',port:0});a=await guest();b=await guest();});
afterEach(async()=>{sockets.splice(0).forEach(s=>s.disconnect());await instance.app.close();rmSync(directory,{recursive:true,force:true});});
it('persists a resident hierarchy across restart and keeps catalogs isolated by database',async()=>{
  const response=await create(a);expect(response.statusCode).toBe(200);const world=response.json() as Place;
  expect(world).toMatchObject({...draft,parentId:'world:music',ownerId:a.data.user.id,genre:'music',revision:1});
  const child=(await create(a,world.id)).json() as Place;
  await instance.app.close();instance=await createApp({database:join(directory,'app.sqlite'),adminKey:'worlds-test-admin'});origin=await instance.app.listen({host:'127.0.0.1',port:0});
  const catalog=(await req(b,'/bootstrap')).json().worlds as Place[];
  expect(pathTo(child.id,catalog).map(p=>p.id)).toEqual(['public','world:music',world.id,child.id]);
  const other=await createApp({database:':memory:',adminKey:'other-database'});
  try{const boot=(await other.app.inject({url:'/api/bootstrap'})).json();expect(boot.worlds).toHaveLength(places.length);expect(boot.worlds.some((p:Place)=>p.id===world.id)).toBe(false);}finally{await other.app.close();}
});
it('protects parents, identity, built-in worlds, stale edits and maximum depth',async()=>{
  const world=(await create(a)).json() as Place;
  for(const parent of ['public','activity:gym','missing',world.id])expect((await create(b,parent)).statusCode).toBe(403);
  expect((await req(b,'/worlds','POST',{...draft,parentId:'world:music',ownerId:a.data.user.id})).statusCode).toBe(400);
  expect((await req(a,'/worlds','POST',{...draft,parentId:'world:music',landscape:'https://evil.example/image'})).statusCode).toBe(400);
  expect((await req(b,'/worlds/'+world.id,'PUT',{...draft,title:'奪う',revision:1})).statusCode).toBe(403);
  expect((await req(a,'/worlds/world:music','PUT',{...draft,revision:1})).statusCode).toBe(403);
  expect((await req(a,'/worlds/'+world.id,'PUT',{...draft,title:'新しい看板',revision:1})).statusCode).toBe(200);
  expect((await req(a,'/worlds/'+world.id,'PUT',{...draft,revision:1})).statusCode).toBe(409);
  // Seed the quota/depth boundary without consuming HTTP rate limits.
  let parent=world.id;
  for(let i=0;i<5;i++){const id='resident:depth-'+i;instance.store.sqlite.prepare('INSERT INTO user_worlds VALUES (?,?,?,?,?,?,?,?)').run(id,parent,a.data.user.id,'奥の世界','','garden',1,Date.now()+i);parent=id;}
  expect((await create(a,parent)).statusCode).toBe(409);
  expect((await req(b,'/worlds/'+world.id,'DELETE',{revision:2})).statusCode).toBe(403);
});
it('supports real visitors and consented viewers in the created world, with server-validated post genres',async()=>{
  const world=(await create(a)).json() as Place;
  const sa=await connect(a),sb=await connect(b);let wb:WorldState|undefined;sb.on('world',w=>wb=w);
  await req(a,'/profile','PATCH',{...a.data.user,shareActivity:true});await req(b,'/profile','PATCH',{...b.data.user,shareActivity:true});
  expect((await ack(sa,'room:enter',{worldId:world.id})).ok).toBe(true);expect((await ack(sb,'room:enter',{worldId:world.id})).ok).toBe(true);
  await until(()=>wb?.peers.length===2);expect(wb!.counts).toEqual({});
  expect((await req(a,'/posts','POST',{title:'違う分類',body:'',genre:'game',worldId:world.id})).statusCode).toBe(400);
  const response=await req(a,'/posts','POST',{title:'はじめての一曲',body:'練習の途中',genre:'music',worldId:world.id});expect(response.statusCode).toBe(200);
  const id=response.json().id,boot=(await req(b,'/bootstrap')).json() as Bootstrap,post=boot.posts.find(p=>p.id===id)!;expect(postWorld(post,boot.worlds)).toBe(world.id);
  await ack(sa,'visit',{postId:id});await ack(sb,'visit',{postId:id});await until(()=>wb?.counts[id]===2&&wb?.viewers[id]?.length===2);
  expect(wb!.peers.map(p=>p.worldId)).toEqual([world.id,world.id]);
  expect((await req(a,'/worlds/'+world.id,'DELETE',{revision:1})).statusCode).toBe(409);
  await req(a,'/profile','PATCH',{...a.data.user,shareActivity:false});await until(()=>wb?.viewers[id]?.length===1);expect(wb!.counts[id]).toBe(2);
});
it('prevents removal of child branches and returns occupants to the station when an empty world is removed',async()=>{
  const world=(await create(a)).json() as Place,child=(await create(a,world.id)).json() as Place;
  expect((await req(a,'/worlds/'+world.id,'DELETE',{revision:1})).statusCode).toBe(409);
  const sb=await connect(b);let context='';sb.on('context',c=>context=c.worldId);await ack(sb,'room:enter',{worldId:child.id});
  expect((await req(a,'/worlds/'+child.id,'DELETE',{revision:1})).statusCode).toBe(200);await until(()=>context==='public');
  await new Promise(r=>setTimeout(r,210));expect((await ack(sb,'room:enter',{worldId:child.id})).ok).toBe(false);
  expect((await req(a,'/worlds/'+world.id,'DELETE',{revision:1})).statusCode).toBe(200);
});
it('exports created worlds and preserves other authors posts when the host deletes their account',async()=>{
  const world=(await create(a)).json() as Place,child=(await create(a,world.id)).json() as Place;
  const id=(await req(b,'/posts','POST',{title:'残しておく音',body:'ほかの住人の投稿',genre:'music',worldId:child.id})).json().id;
  expect((await req(a,'/account/export','POST',{})).json().worlds).toHaveLength(2);
  const response=await req(a,'/account/delete','POST',{confirm:'削除'});expect(response.statusCode).toBe(200);
  const boot=(await req(b,'/bootstrap')).json() as Bootstrap;expect(boot.worlds!.some(p=>p.id===world.id||p.id===child.id)).toBe(false);
  expect(boot.posts.find(p=>p.id===id)?.worldId).toBeNull();expect(postWorld(boot.posts.find(p=>p.id===id)!,boot.worlds)).toBe('world:music');
});
it('requires sessions, supports moderation and enforces the world quota on the server',async()=>{
  expect((await instance.app.inject({url:'/api/worlds',method:'POST',headers:{'x-walk-client':'1'},payload:{...draft,parentId:'world:music'}})).statusCode).toBe(401);
  const world=(await create(a)).json() as Place;
  const sb=await connect(b);let context='';sb.on('context',c=>context=c.worldId);await ack(sb,'room:enter',{worldId:world.id});
  await req(b,'/admin/login','POST',{key:'worlds-test-admin'});
  expect((await req(b,'/worlds/'+world.id,'PUT',{...draft,title:'管理者が修正',revision:1})).statusCode).toBe(200);
  expect((await req(b,'/reports','POST',{targetType:'user',targetId:a.data.user.id,reason:'世界の案内について確認'})).statusCode).toBe(200);
  await req(b,'/admin/users/'+a.data.user.id+'/moderation','POST',{suspended:true,reason:'世界の案内を確認中'});await until(()=>context==='public');
  expect((await req(b,'/worlds')).json().some((p:Place)=>p.id===world.id)).toBe(false);
  expect((await req(b,'/worlds/'+world.id,'PUT',{...draft,revision:2})).statusCode).toBe(404);
  await new Promise(r=>setTimeout(r,210));expect((await ack(sb,'room:enter',{worldId:world.id})).ok).toBe(false);
  await req(b,'/admin/users/'+a.data.user.id+'/moderation','POST',{suspended:false,reason:'確認して公開に戻す'});
  expect((await req(b,'/worlds')).json().find((p:Place)=>p.id===world.id)?.title).toBe('管理者が修正');
  for(let i=0;i<29;i++)instance.store.sqlite.prepare('INSERT INTO user_worlds VALUES (?,?,?,?,?,?,?,?)').run('resident:quota-'+i,'world:music',a.data.user.id,'庭','','garden',1,Date.now());
  expect((await create(a)).statusCode).toBe(409);
});
