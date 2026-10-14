import { afterEach, beforeEach, expect, it } from 'vitest';
import { io, type Socket } from 'socket.io-client';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../server/app';
import { pathTo, postWorld } from '../shared/worlds';
import type { WorldState, Bootstrap } from '../shared/model';
import type { Activity } from '../shared/activities';
let instance:Awaited<ReturnType<typeof createApp>>,origin:string,dir:string;
type Guest={cookie:string;data:Bootstrap};let a:Guest,b:Guest;
const sockets:Socket[]=[];
async function guest(){const r=await instance.app.inject({url:'/api/bootstrap'});return {cookie:r.headers['set-cookie']!.toString().split(';')[0],data:r.json()};}
const req=(g:Guest,path:string,method:'GET'|'POST'|'PATCH'|'PUT'|'DELETE'='GET',payload?:object)=>instance.app.inject({url:'/api'+path,method,headers:{cookie:g.cookie,'x-walk-client':'1'},payload});
async function connect(g:Guest){const s=io(origin,{transports:['websocket'],extraHeaders:{Cookie:g.cookie},forceNew:true,reconnection:false});sockets.push(s);await new Promise<void>((resolve,reject)=>{s.once('connect',resolve);s.once('connect_error',reject);});return s;}
const ack=(s:Socket,event:string,data:unknown)=>s.timeout(5000).emitWithAck(event,data);
const start=(g:Guest,shared=false,endsAt=Date.now()+60000)=>req(g,'/activities','POST',{kind:'gym',title:'ジムで運動',endsAt,shared});
async function until(fn:()=>boolean){const end=Date.now()+5000;while(!fn()){if(Date.now()>end)throw new Error('world state missing');await new Promise(r=>setTimeout(r,20));}}
beforeEach(async()=>{dir=mkdtempSync(join(tmpdir(),'walk-activities-'));instance=await createApp({database:join(dir,'app.sqlite'),adminKey:'activity-tests-key'});origin=await instance.app.listen({port:0,host:'127.0.0.1'});a=await guest();b=await guest();});
afterEach(async()=>{sockets.splice(0).forEach(s=>s.disconnect());await instance.app.close();rmSync(dir,{recursive:true,force:true});});
it('separates station, parent and nested worlds and visits only the assigned post location',async()=>{
 expect(pathTo('world:game-rpg-original').map(p=>p.id)).toEqual(['public','world:game','world:game-rpg','world:game-rpg-original']);
 const sa=await connect(a),sb=await connect(b);let wa:WorldState|undefined;sa.on('world',w=>wa=w);
 expect((await ack(sa,'room:enter',{worldId:'world:game-rpg'})).ok).toBe(true);await until(()=>wa?.peers.length===1);expect(wa?.peers[0].worldId).toBe('world:game-rpg');
 expect((await ack(sa,'room:enter',{worldId:'world:invented'})).ok).toBe(false);
 const created=await req(a,'/posts','POST',{title:'RPGの冒険',body:'深い趣味の世界',genre:'game',worldId:'world:game-rpg-original'});expect(created.statusCode).toBe(200);
 const post=(await req(a,'/bootstrap')).json().posts.find((p:{id:string})=>p.id===created.json().id);expect(postWorld(post)).toBe('world:game-rpg-original');
 expect((await req(a,'/posts','POST',{title:'誤分類',body:'',genre:'music',worldId:'world:game-rpg'})).statusCode).toBe(400);
 await ack(sb,'room:enter',{worldId:'world:game-rpg-original'});await ack(sa,'visit',{postId:post.id});await until(()=>wa?.peers.length===2&&wa?.counts[post.id]===1);
 expect(wa?.peers.find(p=>p.id===a.data.user.id)?.x).toBe(post.mapX);
 await new Promise(r=>setTimeout(r,210));await ack(sa,'room:enter',{worldId:'public'});await until(()=>!wa?.counts[post.id]);expect((await ack(sa,'view',{postId:post.id})).ok).toBe(false);
});
it('keeps anonymous viewers real and reveals consented viewers across the same post in different rooms',async()=>{
 const sa=await connect(a),sb=await connect(b);let wb:WorldState|undefined;sb.on('world',w=>wb=w);
 const post=a.data.posts[0];await req(a,'/favorites/'+post.id,'PUT',{saved:true});
 const room=(await req(a,'/rooms','POST',{title:'投稿の部屋',description:'',isPublic:true,theme:'garden',items:[{postId:post.id,x:600,y:800}],decorations:[]})).json();
 await ack(sa,'room:enter',{worldId:room.id});await ack(sa,'visit',{postId:post.id});await ack(sb,'visit',{postId:post.id});await until(()=>wb?.counts[post.id]===2);
 expect(wb?.viewers[post.id]).toEqual([]);expect(wb?.peers.some(p=>p.id===a.data.user.id)).toBe(false);
 await req(a,'/profile','PATCH',{...a.data.user,shareActivity:true});await until(()=>wb?.viewers[post.id]?.length===1);expect(wb?.viewers[post.id]?.[0].id).toBe(a.data.user.id);
});
it('requires valid future end times, permits one active activity and protects ownership',async()=>{
 expect((await start(a,false,Date.now()-1000)).statusCode).toBe(400);expect((await start(a,false,Date.now()+8*86400000)).statusCode).toBe(400);
 const results=await Promise.all([start(a),start(a)]);expect(results.map(r=>r.statusCode).sort()).toEqual([200,409]);
 const row=(await req(a,'/activities')).json()[0] as Activity;expect(row.shared).toBe(false);
 expect((await req(b,'/activities/'+row.id,'PATCH',{action:'finish',revision:row.revision})).statusCode).toBe(404);
 expect((await req(b,'/users/'+a.data.user.id+'/footprints')).json()).toEqual([]);
});
it('retains an offline shared activity after restart and never counts its ghost as online or viewing',async()=>{
 const row=(await start(a,true)).json() as Activity;const sa=await connect(a);await ack(sa,'visit',{postId:a.data.posts[0].id});sa.disconnect();await instance.app.close();
 instance=await createApp({database:join(dir,'app.sqlite'),adminKey:'activity-tests-key'});origin=await instance.app.listen({port:0,host:'127.0.0.1'});
 const sb=await connect(b);let w:WorldState|undefined;sb.on('world',x=>w=x);await ack(sb,'room:enter',{worldId:'activity:gym'});await until(()=>w?.activities?.length===1);
 expect(w?.activities?.[0]).toMatchObject({activityId:row.id,online:false,id:a.data.user.id});expect(w?.online).toBe(1);expect(w?.peers).toHaveLength(1);expect(w?.counts).toEqual({});
 await req(b,'/blocks/'+a.data.user.id,'PUT',{blocked:true});await until(()=>w?.activities?.length===0);expect((await req(b,'/users/'+a.data.user.id+'/footprints')).statusCode).toBe(404);
});
it('extends and finishes once, rejects stale edits and allows private history correction with notes',async()=>{
 const row=(await start(a)).json() as Activity;
 expect((await req(a,'/activities/'+row.id,'PATCH',{action:'extend',revision:row.revision,endsAt:row.endsAt-1})).statusCode).toBe(400);
 const extended=(await req(a,'/activities/'+row.id,'PATCH',{action:'extend',revision:row.revision,endsAt:row.endsAt+60000})).json() as Activity;
 expect((await req(a,'/activities/'+row.id,'PATCH',{action:'finish',revision:row.revision})).statusCode).toBe(409);
 const done=(await req(a,'/activities/'+row.id,'PATCH',{action:'finish',revision:extended.revision})).json() as Activity;expect(done.finishedAt).not.toBeNull();
 expect((await req(a,'/activities/'+row.id,'PATCH',{action:'extend',revision:done.revision,endsAt:row.endsAt+120000})).statusCode).toBe(409);
 const payload={action:'edit',revision:done.revision,title:'運動の記録',startsAt:done.startsAt,endsAt:done.finishedAt!,note:'<script>記録は文字として表示</script>',shared:false};
 expect((await req(a,'/activities/'+row.id,'PATCH',payload)).statusCode).toBe(200);expect((await req(a,'/activities')).json()[0].note).toBe(payload.note);
 expect((await req(b,'/users/'+a.data.user.id+'/footprints')).json()).toEqual([]);
});
it('automatically expires at the chosen time and removes the activity ghost without inflating presence',async()=>{
 const row=(await start(a,true,Date.now()+1200)).json() as Activity;const sb=await connect(b);let w:WorldState|undefined;sb.on('world',x=>w=x);await ack(sb,'room:enter',{worldId:'activity:gym'});await until(()=>w?.activities?.length===1);await until(()=>w?.activities?.length===0);
 const done=(await req(a,'/activities')).json()[0] as Activity;expect(done.finishedAt).toBe(row.endsAt);expect(w?.online).toBe(1);
});
it('serves photos only to the owner or consented unblocked guests and revokes access on unsharing',async()=>{
 const row=(await start(a)).json() as Activity,boundary='activity-photo';
 const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aN1cAAAAASUVORK5CYII=','base64');
 const photo=await instance.app.inject({url:'/api/activities/'+row.id+'/photo',method:'POST',headers:{cookie:a.cookie,'x-walk-client':'1','content-type':'multipart/form-data; boundary='+boundary},payload:Buffer.concat([Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="photo.png"\r\nContent-Type: image/png\r\n\r\n`),png,Buffer.from(`\r\n--${boundary}--\r\n`)])});
 expect(photo.statusCode).toBe(200);expect((await req(a,'/activities/'+row.id+'/photo')).rawPayload).toEqual(png);expect((await req(b,'/activities/'+row.id+'/photo')).statusCode).toBe(404);
 let current=(await req(a,'/activities')).json()[0] as Activity;
 const edit=(shared:boolean)=>req(a,'/activities/'+row.id,'PATCH',{action:'edit',revision:current.revision,title:current.title,startsAt:current.startsAt,endsAt:current.endsAt,note:'写真も共有',shared});
 expect((await edit(true)).statusCode).toBe(200);expect((await req(b,'/activities/'+row.id+'/photo')).statusCode).toBe(200);
 await req(b,'/blocks/'+a.data.user.id,'PUT',{blocked:true});expect((await req(b,'/activities/'+row.id+'/photo')).statusCode).toBe(404);await req(b,'/blocks/'+a.data.user.id,'PUT',{blocked:false});
 current=(await req(a,'/activities')).json()[0];await edit(false);expect((await req(b,'/activities/'+row.id+'/photo')).statusCode).toBe(404);
 expect((await instance.app.inject({url:'/api/activities/'+row.id+'/photo'})).statusCode).toBe(401);
});

it('limits API use per authenticated guest without rate limiting application assets or other guests',async()=>{
 let result;for(let i=0;i<241;i++)result=await req(a,'/social');expect(result!.statusCode).toBe(429);
 expect((await req(b,'/social')).statusCode).toBe(200);expect((await instance.app.inject({url:'/assets/not-found.js',headers:{cookie:a.cookie}})).statusCode).toBe(404);
});
