import { afterAll, beforeAll, expect, it } from 'vitest';
import { io, type Socket } from 'socket.io-client';
import { createApp } from '../server/app';
import { sourceInfo } from '../shared/community';
import type { Bootstrap, WorldState } from '../shared/model';
let instance:Awaited<ReturnType<typeof createApp>>,origin:string;
type Guest={cookie:string;data:Bootstrap};let a:Guest,b:Guest,c:Guest;
const clients:Socket[]=[];
async function guest():Promise<Guest>{const r=await instance.app.inject({url:'/api/bootstrap'});return {cookie:r.headers['set-cookie']!.toString().split(';')[0],data:r.json()};}
function request(g:Guest,path:string,method:'GET'|'POST'|'PUT'|'PATCH'|'DELETE'='GET',payload?:object){return instance.app.inject({url:'/api'+path,method,headers:{cookie:g.cookie,'x-walk-client':'1'},payload});}
async function socket(g:Guest){const s=io(origin,{transports:['websocket'],extraHeaders:{Cookie:g.cookie},forceNew:true,reconnection:false});clients.push(s);await new Promise<void>((resolve,reject)=>{s.once('connect',resolve);s.once('connect_error',reject);});return s;}
const ack=(s:Socket,event:string,data:unknown)=>s.timeout(5000).emitWithAck(event,data) as Promise<{ok:boolean;members?:{userId:string;socketId:string}[]}>;
async function until(fn:()=>boolean){const start=Date.now();while(!fn()){if(Date.now()-start>4000)throw new Error('state not received');await new Promise(r=>setTimeout(r,20));}}
beforeAll(async()=>{instance=await createApp({database:':memory:',adminKey:'test-community-admin-key-12345'});origin=await instance.app.listen({port:0,host:'127.0.0.1'});a=await guest();b=await guest();c=await guest();});
afterAll(async()=>{clients.forEach(s=>s.disconnect());await instance.app.close();});
it('moves to a post and updates presence atomically in another guest and own tab',async()=>{
  await request(a,'/profile','PATCH',{displayName:'公開する旅人',color:'#668866',style:'cap',shareActivity:true});
  const sa=await socket(a),tab=await socket(a),sb=await socket(b);let w:WorldState|undefined,point:{x:number;y:number}|undefined;sb.on('world',r=>w=r);tab.on('position',r=>point=r);
  await ack(sb,'room:enter',{worldId:'world:music'});const p=a.data.posts.find(p=>p.genre==='music')!;expect((await ack(sa,'visit',{postId:p.id})).ok).toBe(true);
  await until(()=>w?.counts[p.id]===1&&point?.x===p.mapX);
  const peer=w!.peers.find(u=>u.id===a.data.user.id)!;expect(peer.x).toBe(p.mapX);expect(peer.y).toBe(p.mapY+85);expect(point?.y).toBe(peer.y);
  expect((await ack(sa,'visit',{postId:'missing'})).ok).toBe(false);sa.disconnect();tab.disconnect();sb.disconnect();
});
it('validates canonical provider URLs without fetching arbitrary hosts',()=>{
  expect(sourceInfo('https://youtu.be/aqz-KE-bpKQ?t=20')?.url).toBe('https://www.youtube.com/watch?v=aqz-KE-bpKQ');
  expect(sourceInfo('https://www.youtube.com/shorts/aqz-KE-bpKQ')?.provider).toBe('YouTube');
  expect(sourceInfo('https://twitter.com/example/status/123456?s=20')?.url).toBe('https://x.com/example/status/123456');
  expect(sourceInfo('https://www.tiktok.com/@creator/video/123456')?.videoId).toBe('123456');
  for(const url of ['https://youtube.com.evil.test/watch?v=aqz-KE-bpKQ','https://x.com@127.0.0.1/a/status/1','http://youtube.com/watch?v=aqz-KE-bpKQ','https://127.0.0.1/private','https://vt.tiktok.com/abc'])expect(sourceInfo(url)).toBeNull();
});
let imported:string;
it('imports real URLs, saves them, deduplicates canonical URLs and enforces deletion ownership',async()=>{
  const payload={url:'https://youtu.be/jNQXAC9IVRw',title:'実際の出典',authorName:'元の投稿者',genre:'video'};
  const r=await request(a,'/imports','POST',payload);expect(r.statusCode).toBe(200);imported=r.json().id;
  const boot=(await request(a,'/bootstrap')).json() as Bootstrap;expect(boot.favorites).toContain(imported);expect(boot.posts.find(p=>p.id===imported)).toMatchObject({provider:'YouTube',isSample:false});
  expect((await request(b,'/imports','POST',{...payload,url:'https://www.youtube.com/watch?v=jNQXAC9IVRw&t=2'})).json()).toMatchObject({id:imported,existing:true});
  expect((await request(b,'/imports/'+imported,'DELETE')).statusCode).toBe(403);
  expect((await request(a,'/imports','POST',{...payload,url:'https://evil.example/a'})).statusCode).toBe(400);
  const actual=(await request(a,'/imports','POST',{...payload,url:'https://www.youtube.com/watch?v=aqz-KE-bpKQ'})).json();expect(actual.existing).toBe(false);expect(actual.id).not.toMatch(/^youtube-/);expect((await request(a,'/bootstrap')).json().posts.find((p:{id:string})=>p.id===actual.id).isSample).toBe(false);await request(a,'/imports/'+actual.id,'DELETE');
});
it('only computes compatibility with consent and sufficient likes or saves',async()=>{
  expect((await request(a,'/users/'+b.data.user.id)).json().matchScore).toBeNull();
  for(const g of [a,b])await request(g,'/profile','PATCH',{displayName:'match',color:'#668866',style:'cap',shareActivity:true});
  expect((await request(a,'/users/'+b.data.user.id)).json().matchScore).toBe(100);
  await request(a,'/reactions/text-0-0','PUT',{reaction:'heart'});await request(b,'/reactions/text-0-0','PUT',{reaction:'heart'});
  const p=(await request(a,'/users/'+b.data.user.id)).json();expect(p.matchScore).toBe(100);expect(p.commonCount).toBe(2);expect(p).not.toHaveProperty('favorites');
  expect((await request(c,'/users/'+b.data.user.id)).json().matchScore).toBeNull();
});
let roomId:string;const layout={title:'好きの部屋',description:'テストルーム',isPublic:false,theme:'garden',items:[] as {postId:string;x:number;y:number}[],decorations:[{kind:'tree',x:900,y:800}]};
it('persists owned room layouts, restricts private visits, validates saved posts and resolves edit conflicts',async()=>{
  layout.items=[{postId:imported,x:400,y:600}];const r=await request(a,'/rooms','POST',layout);expect(r.statusCode).toBe(200);roomId=r.json().id;
  expect((await request(b,'/rooms/'+roomId)).statusCode).toBe(404);
  expect((await request(b,'/rooms/'+roomId,'PUT',{...layout,revision:1})).statusCode).toBe(403);
  expect((await request(a,'/rooms','POST',{...layout,items:[{postId:'text-1-0',x:200,y:400}]})).statusCode).toBe(400);
  expect((await request(a,'/rooms/'+roomId,'PUT',{...layout,isPublic:true,revision:1})).statusCode).toBe(200);
  expect((await request(a,'/rooms/'+roomId,'PUT',{...layout,revision:1})).statusCode).toBe(409);
  expect((await request(b,'/rooms/'+roomId)).json().items).toEqual(layout.items);
});
it('isolates worlds, visits room item coordinates and ejects guests when the room becomes private',async()=>{
  const sa=await socket(a),sb=await socket(b),sc=await socket(c);let wb:WorldState|undefined,wc:WorldState|undefined,context='';sb.on('world',w=>wb=w);sc.on('world',w=>wc=w);sb.on('context',r=>context=r.worldId);
  expect((await ack(sa,'room:enter',{worldId:roomId})).ok).toBe(true);expect((await ack(sb,'room:enter',{worldId:roomId})).ok).toBe(true);
  await until(()=>wb?.peers.length===2&&wc?.peers.length===1);await ack(sa,'visit',{postId:imported});await until(()=>wb?.peers.find(p=>p.id===a.data.user.id)?.x===400);
  expect(wb!.peers.find(p=>p.id===a.data.user.id)?.y).toBe(685);
  await request(a,'/rooms/'+roomId,'PUT',{...layout,isPublic:false,revision:2});await until(()=>context==='public'&&wb?.peers.some(p=>p.id===c.data.user.id)===true);
  expect((await ack(sb,'room:enter',{worldId:roomId})).ok).toBe(false);sa.disconnect();sb.disconnect();sc.disconnect();
});
async function befriend(x:Guest,y:Guest){await request(x,'/friendships','POST',{targetId:y.data.user.id});const f=(await request(y,'/social')).json().friendships.find((f:{user:{id:string}})=>f.user.id===x.data.user.id);await request(y,'/friendships/'+f.id,'PATCH',{action:'accept'});}
it('requires friendship and invitation acceptance for parties; signals only reach participating voice peers',async()=>{
  expect((await request(a,'/party/invite','POST',{targetId:c.data.user.id})).statusCode).toBe(403);
  await befriend(a,b);await request(a,'/party/invite','POST',{targetId:b.data.user.id});
  const sa=await socket(a),sb=await socket(b),sc=await socket(c);
  expect((await ack(sb,'voice:join',{})).ok).toBe(false);
  const invitation=(await request(b,'/party')).json().invites[0];expect(invitation).toBeTruthy();
  expect((await request(c,'/party/respond','POST',{id:invitation.id,accept:true})).statusCode).toBe(404);
  await request(b,'/party/respond','POST',{id:invitation.id,accept:true});expect((await request(b,'/party')).json().party.members).toHaveLength(2);
  expect((await ack(sa,'voice:join',{})).ok).toBe(true);expect((await ack(sb,'voice:join',{})).ok).toBe(true);
  let signal:unknown;sb.on('voice:signal',s=>signal=s);
  expect((await ack(sa,'voice:signal',{to:sb.id,description:{type:'offer',sdp:'test-offer'}})).ok).toBe(true);await until(()=>!!signal);expect(signal).toMatchObject({from:sa.id});
  expect((await ack(sc,'voice:signal',{to:sb.id,description:{type:'offer',sdp:'spoof'}})).ok).toBe(false);
  expect((await ack(sa,'voice:signal',{to:sc.id,description:{type:'offer',sdp:'private'}})).ok).toBe(false);
  let stopped=false;sa.on('voice:stopped',()=>stopped=true);await request(a,'/blocks/'+b.data.user.id,'PUT',{blocked:true});await until(()=>stopped);
  expect((await request(a,'/party')).json().party).toBeNull();expect((await ack(sa,'voice:signal',{to:sb.id,description:{type:'offer',sdp:'blocked'}})).ok).toBe(false);
  sa.disconnect();sb.disconnect();sc.disconnect();
});
it('filters deleted source posts out of saved layouts without losing other room data',async()=>{
  expect((await request(a,'/imports/'+imported,'DELETE')).statusCode).toBe(200);
  const r=(await request(a,'/rooms/'+roomId)).json();expect(r.items).toEqual([]);expect(r.decorations).toHaveLength(1);
});
it('upgrades the previous database without dropping profiles, saves, or imported room layouts on reopen',async()=>{
  const [{default:Database},{mkdtempSync,readFileSync,rmSync},{tmpdir},{join},{openDatabase}]=await Promise.all([import('better-sqlite3'),import('node:fs'),import('node:os'),import('node:path'),import('../server/db')]);
  const dir=mkdtempSync(join(tmpdir(),'walk-upgrade-')),file=join(dir,'old.sqlite');
  try{
    const old=new Database(file);old.exec(readFileSync(new URL('../server/migrations/0001.sql',import.meta.url),'utf8'));old.exec(readFileSync(new URL('../server/migrations/0002.sql',import.meta.url),'utf8'));old.prepare('INSERT OR IGNORE INTO schema_migrations VALUES (2,1)').run();
    old.prepare('INSERT INTO users VALUES (?,?,?,?,?,?)').run('old-user','前の旅人','#556677','cap',0,1);
    old.prepare('INSERT INTO posts (id,type,title,body,author_name,genre,map_x,map_y,created_at) VALUES (?,?,?,?,?,?,?,?,?)').run('old-post','text','以前の投稿','残す','元の投稿者','discovery',1000,700,1);
    old.prepare('INSERT INTO favorites VALUES (?,?,?)').run('old-user','old-post',1);old.close();
    let store=openDatabase(file);expect(store.sqlite.prepare('SELECT display_name FROM users').get()).toMatchObject({display_name:'前の旅人'});expect(store.sqlite.prepare('SELECT post_id FROM favorites').get()).toMatchObject({post_id:'old-post'});
    store.sqlite.prepare('INSERT INTO rooms (id,owner_id,title,description,is_public,theme,layout,updated_at) VALUES (?,?,?,?,?,?,?,?)').run('room','old-user','残る部屋','',1,'garden',JSON.stringify({items:[{postId:'old-post',x:400,y:600}],decorations:[]}),1);store.sqlite.close();
    store=openDatabase(file);expect(JSON.parse((store.sqlite.prepare('SELECT layout FROM rooms').get() as {layout:string}).layout).items).toEqual([{postId:'old-post',x:400,y:600}]);expect(store.sqlite.prepare('SELECT COUNT(*) AS n FROM schema_migrations').get()).toMatchObject({n:10});expect(store.sqlite.prepare('SELECT COUNT(*) AS n FROM accounts').get()).toMatchObject({n:0});expect(store.sqlite.prepare('PRAGMA foreign_key_check').all()).toEqual([]);store.sqlite.close();
  }finally{rmSync(dir,{recursive:true,force:true});}
});
