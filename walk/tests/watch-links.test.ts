import {afterEach,beforeEach,it,expect,vi} from 'vitest';
import {io,type Socket} from 'socket.io-client';
import {createApp} from '../server/app';
import {readWatchLink,watchLinkUrl} from '../shared/watch-links';
import type {Bootstrap,WorldState} from '../shared/model';
type Guest={cookie:string;data:Bootstrap;socket:Socket;world:WorldState|null};
let instance:Awaited<ReturnType<typeof createApp>>,origin:string,a:Guest,b:Guest;
const clients:Socket[]=[],postId='walk-short-sketch-mug';
async function guest(){const boot=await instance.app.inject({url:'/api/bootstrap'}),data=boot.json() as Bootstrap,cookie=String(boot.headers['set-cookie']).split(';')[0],socket=io(origin,{transports:['websocket'],extraHeaders:{Cookie:cookie},forceNew:true,reconnection:false});clients.push(socket);const g:Guest={cookie,data,socket,world:null};socket.on('world',w=>{g.world=w;});await new Promise<void>((resolve,reject)=>{socket.once('connect',resolve);socket.once('connect_error',reject);});return g;}
const req=(g:Guest,path:string,method:'GET'|'POST'|'DELETE'|'PUT'='GET',payload?:object)=>instance.app.inject({url:'/api'+path,method,headers:{cookie:g.cookie,'x-walk-client':'1'},payload});
const ack=(g:Guest,event:string,payload:object={})=>g.socket.timeout(4000).emitWithAck(event,payload);
async function host(){expect((await ack(a,'visit',{postId})).ok).toBe(true);expect((await ack(a,'watching:create',{postId,position:0,consent:true})).ok).toBe(true);}
const create=()=>req(a,'/watch-links','POST',{consent:true});
async function until(fn:()=>boolean){const end=Date.now()+4000;while(!fn()){if(Date.now()>end)throw new Error('Missing expected state');await new Promise(r=>setTimeout(r,20));}}
beforeEach(async()=>{instance=await createApp({database:':memory:',adminKey:'watch-links-test-key'});origin=await instance.app.listen({host:'127.0.0.1',port:0});a=await guest();b=await guest();});
afterEach(async()=>{vi.restoreAllMocks();clients.splice(0).forEach(s=>s.disconnect());await instance.app.close();});
it('requires authentication, an active hosted video and explicit sharing consent',async()=>{
  expect((await instance.app.inject({url:'/api/watch-links',method:'POST',headers:{'x-walk-client':'1'},payload:{consent:true}})).statusCode).toBe(401);
  expect((await create()).statusCode).toBe(409);await host();
  expect((await req(a,'/watch-links','POST',{consent:false})).statusCode).toBe(400);
  expect((await req(a,'/watch-links','POST',{consent:true,hostId:b.data.user.id})).statusCode).toBe(400);
  expect((await req(b,'/watch-links','POST',{consent:true})).statusCode).toBe(409);
  const result=await create();expect(result.statusCode).toBe(200);expect(result.json().token).toMatch(/^[a-f0-9]{48}$/);
});
it('only previews the voluntarily shared host and post, never approving friendship, viewing or sync participation',async()=>{
  await host();const {token}= (await create()).json();const preview=await req(b,'/watch-links/'+token);expect(preview.statusCode).toBe(200);
  expect(Object.keys(preview.json()).sort()).toEqual(['expiresAt','from','post']);expect(preview.json().from).toEqual({id:a.data.user.id,displayName:a.data.user.displayName,color:a.data.user.color,style:a.data.user.style});expect(preview.json().post.id).toBe(postId);
  const boot=(await req(b,'/bootstrap')).json() as Bootstrap;expect(boot.friendships).toEqual([]);expect(boot.user.shareActivity).toBe(false);expect((await ack(b,'watching:get')).state.group).toBeNull();
  await until(()=>b.world?.counts[postId]===1);expect(b.world!.viewers[postId]).toEqual([]);
});
it('replaces and revokes links, and prevents another user from revoking them',async()=>{
  await host();const old=(await create()).json().token,next=(await create()).json().token;
  expect(old).not.toBe(next);expect((await req(b,'/watch-links/'+old)).statusCode).toBe(404);
  expect((await req(b,'/watch-links/'+next,'DELETE')).statusCode).toBe(404);expect((await req(b,'/watch-links/'+next)).statusCode).toBe(200);
  expect((await req(a,'/watch-links/'+next,'DELETE')).statusCode).toBe(200);expect((await req(b,'/watch-links/'+next)).statusCode).toBe(404);
});
it('expires after fifteen minutes and rejects forged token formats',async()=>{
  await host();const {token,expiresAt}=(await create()).json();expect(expiresAt-Date.now()).toBeGreaterThan(14*60000);
  expect((await req(b,'/watch-links/not-a-token')).statusCode).toBe(400);
  vi.spyOn(Date,'now').mockReturnValue(expiresAt+1);expect((await req(b,'/watch-links/'+token)).statusCode).toBe(404);
});
it('makes a link unusable after hosting ends, the source changes, or the host is blocked',async()=>{
  await host();const token=(await create()).json().token;
  await req(b,'/blocks/'+a.data.user.id,'PUT',{blocked:true});expect((await req(b,'/watch-links/'+token)).statusCode).toBe(404);
  await req(b,'/blocks/'+a.data.user.id,'PUT',{blocked:false});expect((await req(b,'/watch-links/'+token)).statusCode).toBe(200);
  instance.store.sqlite.prepare('UPDATE posts SET media_url=? WHERE id=?').run('https://example.org/replacement.mp4',postId);expect((await req(b,'/watch-links/'+token)).statusCode).toBe(404);
});
it('does not leave a usable link after the host ends synchronized viewing',async()=>{
  await host();const token=(await create()).json().token;await ack(a,'watching:leave');expect((await req(b,'/watch-links/'+token)).statusCode).toBe(404);
});
it('keeps invite tokens in a validated fragment and refuses credentials and other origins',()=>{
  const token='a'.repeat(48),url=watchLinkUrl('https://walk.example/path?tracking=1',token);expect(url).toBe('https://walk.example/#/together/'+token);expect(readWatchLink(new URL(url).hash)).toBe(token);
  for(const bad of ['#/'+'a'.repeat(48),'#/together/'+token+'?x=1','#/together/'+token+'/more','#/together/../admin'])expect(readWatchLink(bad)).toBeNull();
  expect(()=>watchLinkUrl('https://user:password@example.org',token)).toThrow();expect(()=>watchLinkUrl('javascript:alert(1)',token)).toThrow();
});
