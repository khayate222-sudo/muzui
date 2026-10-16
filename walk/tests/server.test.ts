import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { io, type Socket } from 'socket.io-client';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../server/app';
import { openDatabase } from '../server/db';
import { seed } from '../server/seed';
import * as t from '../server/schema';
import { count, eq } from 'drizzle-orm';
import { postSchema, youtubeId, type Bootstrap, type WorldState, type Message } from '../shared/model';
const key='test-administrator-key-1234567890';
let instance:Awaited<ReturnType<typeof createApp>>,origin:string;
type Guest={cookie:string;data:Bootstrap};
let a:Guest,b:Guest;
const clients:Socket[]=[];
async function guest():Promise<Guest>{const r=await instance.app.inject({url:'/api/bootstrap'});return{cookie:r.headers['set-cookie']!.toString().split(';')[0],data:r.json()};}
async function request(g:Guest,path:string,method:'GET'|'POST'|'PUT'|'PATCH'|'DELETE'='GET',payload?:object){return instance.app.inject({url:'/api'+path,method,headers:{cookie:g.cookie,'x-walk-client':'1'},payload});}
async function socket(g:Guest){const s=io(origin,{transports:['websocket'],extraHeaders:{Cookie:g.cookie},forceNew:true,reconnection:false});clients.push(s);await new Promise<void>((resolve,reject)=>{s.once('connect',()=>resolve());s.once('connect_error',reject);});return s;}
async function until(fn:()=>boolean){const start=Date.now();while(!fn()){if(Date.now()-start>5000)throw new Error('Expected realtime state did not arrive');await new Promise(r=>setTimeout(r,25));}}
function ack(s:Socket,event:string,payload:unknown):Promise<{ok:boolean;error?:string}>{return s.timeout(5000).emitWithAck(event,payload);}
beforeAll(async()=>{instance=await createApp({database:':memory:',adminKey:key});origin=await instance.app.listen({port:0,host:'127.0.0.1'});a=await guest();b=await guest();});
afterAll(async()=>{clients.forEach(s=>s.disconnect());await instance.app.close();});
describe('sessions, validation and authorization',()=>{
  it('issues HttpOnly opaque cookie, keeps identity and seeds 25 labeled samples, seven landscapes and six original short films',async()=>{
    const r=await instance.app.inject({url:'/api/bootstrap'});expect(r.headers['set-cookie']).toContain('HttpOnly');expect(r.headers['set-cookie']).toContain('SameSite=Strict');
    expect((await request(a,'/bootstrap')).json().user.id).toBe(a.data.user.id);expect(a.data.posts).toHaveLength(38);expect(a.data.posts.filter(p=>p.isSample)).toHaveLength(25);
    expect(a.data.user.shareActivity).toBe(false);
    expect((await instance.app.inject({url:'/api/profile',method:'PATCH',headers:{'x-walk-client':'1'},payload:{}})).statusCode).toBe(401);
  });
  it('rejects cross-origin mutation, missing CSRF header and client-controlled identity',async()=>{
    const r=await instance.app.inject({url:'/api/profile',method:'PATCH',headers:{cookie:a.cookie,origin:'https://evil.example','x-walk-client':'1'},payload:{}});expect(r.statusCode).toBe(403);
    expect((await instance.app.inject({url:'/api/profile',method:'PATCH',headers:{cookie:a.cookie},payload:{}})).statusCode).toBe(403);
    await request(a,'/profile','PATCH',{displayName:'A',color:'#779977',style:'cap',shareActivity:false,id:b.data.user.id});
    expect((await request(a,'/bootstrap')).json().user.id).toBe(a.data.user.id);
    expect((await request(a,'/profile','PATCH',{displayName:'',color:'javascript:alert(1)',style:'cap',shareActivity:true})).statusCode).toBe(400);
  });
  it('requires admin authorization and validates HTTPS/media/video URLs',async()=>{
    expect((await request(a,'/admin/reports')).statusCode).toBe(403);
    expect((await request(a,'/admin/posts','POST',{})).statusCode).toBe(403);
    const sample=a.data.posts[0];expect(postSchema.safeParse({...sample,externalUrl:'javascript:alert(1)'}).success).toBe(false);
    expect(postSchema.safeParse({...sample,mediaUrl:'https://user:pass@example.org/a.jpg'}).success).toBe(false);
    expect(postSchema.safeParse({...sample,type:'youtube',externalUrl:'https://evil.example/watch?v=aqz-KE-bpKQ'}).success).toBe(false);
    expect(youtubeId('https://youtu.be/aqz-KE-bpKQ')).toBe('aqz-KE-bpKQ');
  });
});
describe('server-authoritative real-time presence',()=>{
  it('deduplicates tabs, counts independent guests, cleans up close and disconnect, and hides private viewers',async()=>{
    const sa=await socket(a),satab=await socket(a),sb=await socket(b);let world:WorldState|null=null;sb.on('world',w=>{world=w;});
    await ack(sa,'visit',{postId:'text-0-0'});await ack(satab,'view',{postId:'text-0-0'});await ack(sb,'visit',{postId:'text-0-0'});
    await until(()=>world?.counts['text-0-0']===2);expect(world!.online).toBe(2);expect(world!.viewers['text-0-0']).toHaveLength(0);
    expect(world!.peers.some(p=>p.id===a.data.user.id)).toBe(false);
    expect(world!.peers.some(p=>p.id===b.data.user.id)).toBe(true);
    await request(a,'/profile','PATCH',{displayName:'A',color:'#779977',style:'cap',shareActivity:true});
    await until(()=>world?.viewers['text-0-0']?.length===1);
    expect(world!.peers.find(p=>p.id===a.data.user.id)?.currentPost).toBe('text-0-0');
    await request(a,'/profile','PATCH',{displayName:'A',color:'#779977',style:'cap',shareActivity:false});
    await until(()=>world?.peers.some(p=>p.id===a.data.user.id)===false);
    expect(world!.viewers['text-0-0']).toHaveLength(0);
    expect(world!.counts['text-0-0']).toBe(2);
    sa.disconnect();await new Promise(r=>setTimeout(r,50));expect(world!.counts['text-0-0']).toBe(2);
    expect(world!.peers.some(p=>p.id===a.data.user.id)).toBe(false);
    await request(a,'/profile','PATCH',{displayName:'A',color:'#779977',style:'cap',shareActivity:true});
    await until(()=>world?.peers.some(p=>p.id===a.data.user.id)===true);
    satab.disconnect();await until(()=>world?.counts['text-0-0']===1);
    await ack(sb,'view',{postId:null});await until(()=>!world?.counts['text-0-0']);
    expect((await ack(sb,'view',{postId:'missing'})).ok).toBe(false);
    sb.disconnect();
  });
  it('synchronizes movement and rejects forged coordinates and excessive speed',async()=>{
    const sa=await socket(a),sb=await socket(b);let world:WorldState|null=null;sb.on('world',w=>world=w);
    await ack(sa,'teleport',{x:440,y:1050});await until(()=>world?.peers.some(p=>p.id===a.data.user.id&&p.x===440)===true);
    sa.emit('move',{x:99999,y:1000});sa.emit('move',{x:1500,y:1000});await new Promise(r=>setTimeout(r,130));
    await ack(sb,'view',{postId:null});await until(()=>world!==null);expect(world!.peers.find(p=>p.id===a.data.user.id)!.x).toBe(440);
    sa.emit('move',{x:465,y:1050});await until(()=>world?.peers.find(p=>p.id===a.data.user.id)?.x===465);
    sa.disconnect();sb.disconnect();
  });
  it('rejects unauthenticated Socket.IO access',async()=>{
    const s=io(origin,{transports:['websocket'],auth:{userId:a.data.user.id},forceNew:true,reconnection:false});clients.push(s);
    const error=await new Promise<Error>(resolve=>s.once('connect_error',resolve));expect(error.message).toContain('セッション');
  });
});
describe('consent, social features and moderation',()=>{
  it('stores one reaction per guest and post without inflating repeated events',async()=>{
    await request(a,'/reactions/text-0-0','PUT',{reaction:'heart'});await request(a,'/reactions/text-0-0','PUT',{reaction:'heart'});
    let data=(await request(a,'/bootstrap')).json() as Bootstrap;expect(data.reactions['text-0-0']).toBe('heart');expect(data.posts.find(p=>p.id==='text-0-0')!.reactions.heart).toBe(1);
    await request(a,'/reactions/text-0-0','PUT',{reaction:'spark'});data=(await request(a,'/bootstrap')).json();expect(data.posts.find(p=>p.id==='text-0-0')!.reactions.heart).toBeUndefined();
    await request(a,'/reactions/text-0-0','PUT',{reaction:null});expect((await request(a,'/reactions/text-0-0','PUT',{reaction:'forged'})).statusCode).toBe(400);
  });
  it('persists idempotent favorites and requires consent on both sides for matching',async()=>{
    await request(a,'/favorites/text-0-0','PUT',{saved:true});await request(a,'/favorites/text-0-0','PUT',{saved:true});await request(b,'/favorites/text-0-0','PUT',{saved:true});
    expect((await request(a,'/bootstrap')).json().favorites).toEqual(['text-0-0']);
    expect((await request(a,'/users/'+b.data.user.id)).json().commonCount).toBeNull();
    await request(b,'/profile','PATCH',{displayName:'B',color:'#aa8899',style:'beanie',shareActivity:true});
    const p=(await request(a,'/users/'+b.data.user.id)).json();expect(p.commonCount).toBe(1);expect(p.commonGenres).toContain('discovery');expect(p).not.toHaveProperty('favorites');
  });
  it('enforces reciprocal approval, chat deduplication, rate limit and block revocation',async()=>{
    const sa=await socket(a),sb=await socket(b);const received:Message[]=[];sb.on('message',m=>received.push(m));
    const content={to:b.data.user.id,content:'こんにちは',clientId:randomUUID()};
    expect((await ack(sa,'chat',content)).ok).toBe(false);
    expect((await request(a,'/friendships','POST',{targetId:b.data.user.id})).statusCode).toBe(200);
    const f=(await request(b,'/social')).json().friendships[0];
    expect((await request(a,'/friendships/'+f.id,'PATCH',{action:'accept'})).statusCode).toBe(403);
    expect((await request(b,'/friendships/'+f.id,'PATCH',{action:'accept'})).statusCode).toBe(200);
    expect((await ack(sa,'chat',content)).ok).toBe(true);expect((await ack(sa,'chat',content)).ok).toBe(true);
    await until(()=>received.length===1);
    expect((await ack(sa,'chat',{...content,clientId:randomUUID()})).ok).toBe(false);
    expect((await request(b,'/messages/'+a.data.user.id)).json()).toHaveLength(1);
    await request(b,'/blocks/'+a.data.user.id,'PUT',{blocked:true});
    expect((await ack(sa,'chat',{...content,clientId:randomUUID()})).ok).toBe(false);
    expect((await request(a,'/messages/'+b.data.user.id)).statusCode).toBe(403);
    expect((await request(a,'/users/'+b.data.user.id)).statusCode).toBe(404);
    sa.disconnect();sb.disconnect();
  });
  it('stores reports for administrators and supports authorized post CRUD',async()=>{
    expect((await request(a,'/reports','POST',{targetType:'post',targetId:'text-0-0',reason:'テスト通報'})).statusCode).toBe(200);
    expect((await request(a,'/admin/login','POST',{key:'wrong'})).statusCode).toBe(403);
    await request(a,'/admin/login','POST',{key});expect((await request(a,'/admin/reports')).json()).toHaveLength(1);
    const sample={...a.data.posts[0],title:'管理テスト'};const created=await request(a,'/admin/posts','POST',sample);expect(created.statusCode).toBe(200);const id=created.json().id;
    expect((await request(a,'/admin/posts/'+id,'PUT',{...sample,mapX:800})).statusCode).toBe(200);
    expect((await request(a,'/bootstrap')).json().posts.find((p:{id:string})=>p.id===id).mapX).toBe(800);
    expect((await request(a,'/admin/posts/'+id,'DELETE')).statusCode).toBe(200);
    expect((await request(b,'/admin/reports')).statusCode).toBe(403);
  });
});
it('reopens persisted SQLite data and applies migration/seed repeatedly without resetting user data',()=>{
  const dir=mkdtempSync(join(tmpdir(),'walk-db-'));const file=join(dir,'data.sqlite');
  try{let store=openDatabase(file);seed(store);store.db.insert(t.users).values({id:'persist',displayName:'保持',color:'#123456',style:'hair',shareActivity:false,createdAt:1}).run();store.sqlite.close();store=openDatabase(file);seed(store);expect(store.db.select().from(t.users).where(eq(t.users.id,'persist')).get()!.displayName).toBe('保持');expect(store.db.select({n:count()}).from(t.posts).get()!.n).toBe(38);store.sqlite.close();}finally{rmSync(dir,{recursive:true,force:true});}
});
