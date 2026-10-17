import {afterEach,beforeEach,it,expect} from 'vitest';
import {mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {io,type Socket} from 'socket.io-client';
import {createApp} from '../server/app';
import {canSynchronize,discoveryVideos,discoverableVideo,readInterests} from '../shared/discovery';
import type {Bootstrap} from '../shared/model';
import {seed} from '../server/seed';
import {curatedVideos} from '../shared/curated-videos';
let instance:Awaited<ReturnType<typeof createApp>>,directory:string,origin:string;
type Guest={cookie:string;data:Bootstrap};let a:Guest,b:Guest;
const key='video-discovery-admin-key',sockets:Socket[]=[];
async function guest(){const r=await instance.app.inject({url:'/api/bootstrap'});return {cookie:String(r.headers['set-cookie']).split(';')[0],data:r.json() as Bootstrap};}
const req=(g:Guest,path:string,method:'GET'|'POST'|'PUT'|'PATCH'|'DELETE'='GET',payload?:object)=>instance.app.inject({url:'/api'+path,method,headers:{cookie:g.cookie,'x-walk-client':'1'},payload});
async function connect(g:Guest){const s=io(origin,{transports:['websocket'],extraHeaders:{Cookie:g.cookie},forceNew:true,reconnection:false});sockets.push(s);await new Promise<void>((resolve,reject)=>{s.once('connect',resolve);s.once('connect_error',reject);});return s;}
const ack=(s:Socket,event:string,payload:object)=>s.timeout(4000).emitWithAck(event,payload);
beforeEach(async()=>{directory=mkdtempSync(join(tmpdir(),'walk-discovery-'));instance=await createApp({database:join(directory,'app.sqlite'),adminKey:key});origin=await instance.app.listen({host:'127.0.0.1',port:0});a=await guest();b=await guest();});
afterEach(async()=>{sockets.splice(0).forEach(s=>s.disconnect());await instance.app.close();rmSync(directory,{recursive:true,force:true});});
it('offers real original films while excluding settings samples, source-only links and invalid players',()=>{
  const films=a.data.posts.filter(discoverableVideo);expect(films).toHaveLength(13+curatedVideos.length);expect(films.filter(p=>p.origin!=='external').every(canSynchronize)).toBe(true);expect(films.filter(p=>p.origin==='external').some(canSynchronize)).toBe(false);
  const film=films.find(p=>p.id==='walk-film-game')!;
  for(const change of [{isSample:true},{mediaUrl:'/films/walk-stolen.mp4'},{mediaUrl:'http://insecure.example/video.mp4'},{type:'external' as const,provider:'X',externalUrl:'https://x.com/someone/status/123'}])expect(discoverableVideo({...film,...change})).toBe(false);
  expect(discoverableVideo({...film,type:'youtube',externalUrl:'https://youtu.be/aqz-KE-bpKQ'})).toBe(true);
  expect(canSynchronize({...film,mediaUrl:'https://example.org/video.mp4'})).toBe(false);
  expect(canSynchronize({...film,origin:'walk',mediaUrl:'/media/11111111-1111-4111-8111-111111111111.webm'})).toBe(true);
});
it('ranks explicit interests and curation deterministically without using invented popularity or exposing choices',()=>{
  const ranked=discoveryVideos(a.data.posts,[{postId:'walk-film-game',position:1},{postId:'walk-film-music',position:3}],['music'],[]);
  expect(ranked[0]).toMatchObject({post:{id:'walk-film-music'},reason:'選んだ「好き」から'});expect(ranked[1].post.id).toBe('walk-film-game');
  expect(readInterests('["music","music","secret","game"]')).toEqual(['music','game']);expect(readInterests('{broken')).toEqual([]);expect(readInterests('null')).toEqual([]);
  expect(a.data.user.shareActivity).toBe(false);expect(b.data.user.shareActivity).toBe(false);
});
it('restricts curation to admins, validates eligible posts and persists changes without resurrecting deleted films',async()=>{
  expect((await req(b,'/admin/discovery/walk-film-music','PUT',{position:1})).statusCode).toBe(403);
  await req(a,'/admin/login','POST',{key});
  for(const id of ['youtube-0','text-0-0'])expect((await req(a,'/admin/discovery/'+id,'PUT',{position:1})).statusCode).toBe(400);
  for(const position of [0,101,1.5,'1'])expect((await req(a,'/admin/discovery/walk-film-music','PUT',{position})).statusCode).toBe(400);
  expect((await req(a,'/admin/discovery/missing','PUT',{position:1})).statusCode).toBe(404);
  expect((await req(a,'/admin/discovery/walk-film-music','PUT',{position:1})).statusCode).toBe(200);
  await req(a,'/admin/discovery/walk-film-discovery','PUT',{position:null});
  await req(a,'/favorites/walk-film-music','PUT',{saved:true});
  await req(a,'/admin/posts/walk-film-anime','DELETE');
  const before=(await req(b,'/bootstrap')).json() as Bootstrap;expect(before.discoveryPicks).toContainEqual({postId:'walk-film-music',position:1});
  await instance.app.close();instance=await createApp({database:join(directory,'app.sqlite'),adminKey:key});
  const after=(await req(a,'/bootstrap')).json() as Bootstrap;
  expect(after.discoveryPicks).toEqual(before.discoveryPicks);expect(after.favorites).toContain('walk-film-music');expect(after.posts.some(p=>p.id==='walk-film-anime')).toBe(false);
  expect(instance.store.sqlite.prepare('SELECT COUNT(*) AS n FROM discovery_picks WHERE post_id=?').get('walk-film-anime')).toEqual({n:0});
});
it('adds films once to an existing database and preserves existing posts and favorites',()=>{
  const sql=instance.store.sqlite;
  sql.prepare('DELETE FROM posts WHERE id LIKE ?').run('walk-film-%');sql.prepare('DELETE FROM seed_state WHERE id=2').run();
  sql.prepare('UPDATE posts SET title=? WHERE id=?').run('ユーザーが編集した投稿','text-0-0');
  sql.prepare('INSERT INTO favorites(user_id,post_id,created_at) VALUES (?,?,?)').run(a.data.user.id,'text-0-0',Date.now());
  seed(instance.store);seed(instance.store);
  expect(sql.prepare('SELECT COUNT(*) AS n FROM posts').get()).toEqual({n:38+curatedVideos.length});expect(sql.prepare('SELECT title FROM posts WHERE id=?').get('text-0-0')).toEqual({title:'ユーザーが編集した投稿'});expect(sql.prepare('SELECT COUNT(*) AS n FROM favorites').get()).toEqual({n:1});
});
it('requires viewing and explicit consent to synchronize an original and leaves others individually watching when advancing',async()=>{
  const sa=await connect(a),sb=await connect(b),film='walk-film-music';
  await req(a,'/friendships','POST',{targetId:b.data.user.id});const f=(await req(b,'/bootstrap')).json().friendships[0];await req(b,'/friendships/'+f.id,'PATCH',{action:'accept'});
  expect((await ack(sa,'watching:create',{postId:film,position:0,consent:true})).ok).toBe(false);
  await new Promise(r=>setTimeout(r,1050));await ack(sa,'visit',{postId:film});expect((await ack(sa,'watching:create',{postId:film,position:0,consent:false})).ok).toBe(false);
  await new Promise(r=>setTimeout(r,1050));
  expect((await ack(sa,'watching:create',{postId:film,position:0,consent:true})).ok).toBe(true);
  await ack(sa,'watching:invite',{targetId:b.data.user.id});const pending=(await ack(sb,'watching:get',{})).state.invites[0];expect(pending.post.id).toBe(film);
  await ack(sb,'visit',{postId:film});expect((await ack(sb,'watching:respond',{id:pending.id,accept:true,consent:true})).ok).toBe(true);
  const state=(await ack(sa,'watching:get',{})).state;expect(state.group.members).toHaveLength(2);
  await ack(sa,'visit',{postId:'walk-film-game'});await new Promise(r=>setTimeout(r,260));expect((await ack(sb,'watching:get',{})).state.group).toBeNull();expect((await req(b,'/bootstrap')).json().user.shareActivity).toBe(false);
});
