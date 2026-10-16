import {afterEach,beforeEach,it,expect} from 'vitest';
import {mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {eq} from 'drizzle-orm';
import {createApp} from '../server/app';
import {posts} from '../server/schema';
import type {Bootstrap} from '../shared/model';
import type {Room} from '../shared/community';
type Guest={cookie:string;data:Bootstrap};
let instance:Awaited<ReturnType<typeof createApp>>,directory:string,a:Guest,b:Guest;
const postId='walk-short-sketch-mug',key='solo-room-testing-admin-key';
async function guest(){const boot=await instance.app.inject({url:'/api/bootstrap'});return {cookie:String(boot.headers['set-cookie']).split(';')[0],data:boot.json() as Bootstrap};}
const req=(g:Guest,path:string,method:'GET'|'POST'|'PUT'='GET',payload?:object)=>instance.app.inject({url:'/api'+path,method,headers:{cookie:g.cookie,'x-walk-client':'1'},payload});
const prepare=(g=a,body:object={postId})=>req(g,'/solo/room','POST',body);
const makeRoom=(g:Guest,isPublic=false)=>req(g,'/rooms','POST',{title:isPublic?'公開の展示室':'もともとの部屋',description:'大切な配置',theme:'night',isPublic,items:[],decorations:[{kind:'tree',x:440,y:600}]});
beforeEach(async()=>{directory=mkdtempSync(join(tmpdir(),'walk-solo-'));instance=await createApp({database:join(directory,'app.sqlite'),adminKey:key});a=await guest();b=await guest();});
afterEach(async()=>{await instance.app.close();rmSync(directory,{recursive:true,force:true});});

it('requires a session and a canonical available video, rejecting samples, links and injected ownership or visibility',async()=>{
  expect((await instance.app.inject({url:'/api/solo/room',method:'POST',headers:{'x-walk-client':'1'},payload:{postId}})).statusCode).toBe(401);
  for(const body of [{postId:'missing'},{postId:'youtube-0'},{postId:'text-0-0'}])expect((await prepare(a,body)).statusCode).toBe(404);
  for(const extra of [{ownerId:b.data.user.id},{isPublic:true},{roomId:'not-a-uuid'}])expect((await prepare(a,{postId,...extra})).statusCode).toBe(400);
  expect((await req(a,'/rooms')).json()).toEqual([]);expect((await req(a,'/bootstrap')).json().favorites).toEqual([]);
});

it('atomically saves a favourite in one private room, stays idempotent across retries, and persists across restart',async()=>{
  const replies=await Promise.all([prepare(),prepare(),prepare()]);for(const r of replies)expect(r.statusCode).toBe(200);
  const room=replies[0].json() as Room;expect(replies.map(r=>r.json().id)).toEqual([room.id,room.id,room.id]);expect(room).toMatchObject({ownerId:a.data.user.id,isPublic:false,theme:'studio',items:[{postId,x:1000,y:700}]});
  expect((await req(a,'/rooms')).json()).toHaveLength(1);expect((await req(a,'/bootstrap')).json().favorites).toEqual([postId]);expect((await req(b,'/rooms/'+room.id)).statusCode).toBe(404);
  expect((await req(a,'/bootstrap')).json()).toMatchObject({user:{shareActivity:false},friendships:[]});
  await instance.app.close();instance=await createApp({database:join(directory,'app.sqlite'),adminKey:key});
  expect((await req(a,'/rooms/'+room.id)).json()).toEqual(room);expect((await req(a,'/bootstrap')).json().favorites).toEqual([postId]);
});

it('preserves an owned private room and its decorations, increments revisions, and rejects stale manual edits',async()=>{
  const room=(await makeRoom(a)).json() as Room;
  const first=(await prepare(a,{postId,roomId:room.id})).json() as Room;
  const second=(await prepare(a,{postId:'walk-short-rain-light',roomId:room.id})).json() as Room;
  expect(second).toMatchObject({id:room.id,title:room.title,theme:room.theme,description:room.description,isPublic:false,decorations:room.decorations});
  expect(second.items).toContainEqual(first.items[0]);expect(second.items).toHaveLength(2);expect(second.revision).toBe(room.revision+2);
  expect((await req(a,'/rooms/'+room.id,'PUT',room)).statusCode).toBe(409);
  expect((await prepare(a,{postId,roomId:room.id})).json()).toEqual(second);
});

it('does not reuse public or foreign rooms or alter profile disclosure, friendship, or existing public layouts',async()=>{
  const pub=(await makeRoom(a,true)).json() as Room,foreign=(await makeRoom(b)).json() as Room;
  expect((await prepare(a,{postId,roomId:pub.id})).statusCode).toBe(409);expect((await prepare(a,{postId,roomId:foreign.id})).statusCode).toBe(404);
  const own=(await prepare()).json() as Room;expect(own.id).not.toBe(pub.id);expect(own.isPublic).toBe(false);
  expect((await req(a,'/rooms/'+pub.id)).json()).toEqual(pub);expect((await req(b,'/rooms/'+own.id)).statusCode).toBe(404);
  expect((await req(b,'/bootstrap')).json().favorites).toEqual([]);
});

it('fails the room limit without partially saving or modifying any room',async()=>{
  for(let i=0;i<5;i++)expect((await makeRoom(a,true)).statusCode).toBe(200);
  const before=(await req(a,'/rooms')).json();expect((await prepare()).statusCode).toBe(409);
  expect((await req(a,'/rooms')).json()).toEqual(before);expect((await req(a,'/bootstrap')).json().favorites).toEqual([]);
});

it('keeps forty existing cards intact when full, and rejects a video changed to a settings sample',async()=>{
  const room=(await makeRoom(a)).json() as Room,sql=instance.store.sqlite;
  const source=instance.store.db.select().from(posts).where(eq(posts.id,postId)).get()!;
  for(let i=0;i<3;i++)instance.store.db.insert(posts).values({...source,id:'other-card-'+i}).run();
  const items=instance.store.db.select({id:posts.id}).from(posts).all().filter(p=>p.id!==postId).slice(0,40).map(p=>({postId:p.id,x:440,y:600}));expect(items).toHaveLength(40);
  sql.prepare('UPDATE rooms SET layout=? WHERE id=?').run(JSON.stringify({items,decorations:room.decorations}),room.id);
  const before=(await req(a,'/rooms/'+room.id)).json();expect((await prepare(a,{postId,roomId:room.id})).statusCode).toBe(409);
  expect((await req(a,'/rooms/'+room.id)).json()).toEqual(before);expect((await req(a,'/bootstrap')).json().favorites).toEqual([]);
  sql.prepare('UPDATE posts SET is_sample=1 WHERE id=?').run(postId);expect((await prepare()).statusCode).toBe(404);
});
