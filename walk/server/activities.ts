import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Store } from './db';
import { activityInput, recordInput, type Activity, type ActivityGhost } from '../shared/activities';
import { identifyMedia } from './publishing';
type Row={id:string;user_id:string;kind:Activity['kind'];title:string;starts_at:number;ends_at:number;finished_at:number|null;shared:number;note:string;has_photo:number;revision:number};
const select='SELECT id,user_id,kind,title,starts_at,ends_at,finished_at,shared,note,photo IS NOT NULL AS has_photo,revision FROM activities';
const view=(r:Row):Activity=>({id:r.id,userId:r.user_id,kind:r.kind,title:r.title,startsAt:r.starts_at,endsAt:r.ends_at,finishedAt:r.finished_at,shared:!!r.shared,note:r.note,photo:!!r.has_photo,revision:r.revision});
export function activities({app,store,blocked,changed}:{app:FastifyInstance;store:Store;blocked:(a:string,b:string)=>boolean;changed:(id:string)=>void}){
 const {sqlite}=store;
 const settle=()=>sqlite.prepare('UPDATE activities SET finished_at=ends_at, revision=revision+1 WHERE finished_at IS NULL AND ends_at<=?').run(Date.now()).changes;
 const read=(id:string)=>sqlite.prepare(select+' WHERE id=?').get(id) as Row|undefined;
 const accessible=(r:Row|undefined,user:string)=>!!r&&(r.user_id===user||!!r.shared&&!blocked(user,r.user_id));
 const owner=(id:string,user:string)=>{settle();const r=read(id);return r?.user_id===user?r:undefined;};
 const revision=z.number().int().positive();
 app.get('/api/activities',async req=>{settle();return (sqlite.prepare(select+' WHERE user_id=? ORDER BY starts_at DESC').all(req.session!.userId) as Row[]).map(view);});
 app.get('/api/users/:id/footprints',async(req,reply)=>{
  const id=(req.params as {id:string}).id,user=req.session!.userId;settle();
  if(blocked(user,id)||!sqlite.prepare('SELECT id FROM users WHERE id=?').get(id))return reply.code(404).send({error:'記録を表示できません'});
  return (sqlite.prepare(select+' WHERE user_id=? AND shared=1 ORDER BY starts_at DESC LIMIT 100').all(id) as Row[]).map(view);
 });
 app.post('/api/activities',async(req,reply)=>{
  const p=activityInput.parse(req.body),user=req.session!.userId,now=Date.now();settle();
  if(p.endsAt<=now||p.endsAt>now+7*86400000)return reply.code(400).send({error:'終了時刻は今から7日以内の未来を指定してください'});
  const id=randomUUID();
  const created=sqlite.transaction(()=>{
   if(sqlite.prepare('SELECT id FROM activities WHERE user_id=? AND finished_at IS NULL').get(user))return false;
   sqlite.prepare('INSERT INTO activities (id,user_id,kind,title,starts_at,ends_at,shared,note) VALUES (?,?,?,?,?,?,?,?)').run(id,user,p.kind,p.title,now,p.endsAt,Number(p.shared),p.note);return true;
  })();
  if(!created)return reply.code(409).send({error:'進行中の活動を終了してから、次の活動を始めてください'});
  changed(user);return view(read(id)!);
 });
 app.patch('/api/activities/:id',async(req,reply)=>{
  const id=(req.params as {id:string}).id,user=req.session!.userId,r=owner(id,user);
  if(!r)return reply.code(404).send({error:'活動が見つかりません'});
  const p=z.discriminatedUnion('action',[
   z.object({action:z.literal('finish'),revision}),z.object({action:z.literal('extend'),endsAt:z.number().int().positive(),revision}),
   recordInput.extend({action:z.literal('edit'),revision}),
  ]).parse(req.body);
  if(p.revision!==r.revision)return reply.code(409).send({error:'別の画面で更新されました。記録を再読み込みしてください'});
  const now=Date.now();
  if(p.action==='finish'||p.action==='extend'){
   if(r.finished_at!==null)return reply.code(409).send({error:'この活動は既に終了しました'});
   if(p.action==='extend'&&(p.endsAt<=r.ends_at||p.endsAt>now+7*86400000))return reply.code(400).send({error:'今の終了時刻より後、今から7日以内を指定してください'});
   if(p.action==='finish')sqlite.prepare('UPDATE activities SET finished_at=?,revision=revision+1 WHERE id=?').run(now,id);
   else sqlite.prepare('UPDATE activities SET ends_at=?,revision=revision+1 WHERE id=?').run(p.endsAt,id);
  }else{
   if(p.startsAt>now||p.endsAt<p.startsAt|| (r.finished_at!==null&&p.endsAt>now))return reply.code(400).send({error:'開始・終了時刻を確認してください。終了済みの記録は未来へ変更できません'});
   if(r.finished_at===null&&(p.startsAt!==r.starts_at||p.endsAt!==r.ends_at))return reply.code(400).send({error:'活動中の終了時刻は延長・途中終了で変更してください'});
   sqlite.prepare('UPDATE activities SET title=?,note=?,shared=?,starts_at=?,ends_at=?,finished_at=?,revision=revision+1 WHERE id=?').run(p.title,p.note,Number(p.shared),p.startsAt,p.endsAt,r.finished_at===null?null:p.endsAt,id);
  }
  changed(user);return view(read(id)!);
 });
 app.post('/api/activities/:id/photo',{config:{rateLimit:{max:5,timeWindow:'1 minute'}}},async(req,reply)=>{
  const id=(req.params as {id:string}).id,user=req.session!.userId;
  if(!owner(id,user))return reply.code(404).send({error:'活動が見つかりません'});
  const file=await req.file();if(!file)return reply.code(400).send({error:'写真を選んでください'});
  const data=await file.toBuffer(),kind=identifyMedia(data);
  if(!kind?.mime.startsWith('image/')||data.length>5*1024*1024)return reply.code(400).send({error:'5MB以内のPNG・JPEG・GIF・WebP画像を選んでください'});
  sqlite.prepare('UPDATE activities SET photo=?,photo_mime=?,revision=revision+1 WHERE id=? AND user_id=?').run(data,kind.mime,id,user);changed(user);return view(read(id)!);
 });
 app.get('/api/activities/:id/photo',async(req,reply)=>{
  const id=(req.params as {id:string}).id,r=read(id);
  if(!accessible(r,req.session!.userId))return reply.code(404).send({error:'写真が見つかりません'});
  const photo=sqlite.prepare('SELECT photo,photo_mime FROM activities WHERE id=?').get(id) as {photo:Buffer|null;photo_mime:string};
  return photo.photo?reply.type(photo.photo_mime).header('X-Content-Type-Options','nosniff').send(photo.photo):reply.code(404).send({error:'写真が見つかりません'});
 });
 app.delete('/api/activities/:id/photo',async(req,reply)=>{
  const id=(req.params as {id:string}).id,user=req.session!.userId;
  if(!owner(id,user))return reply.code(404).send({error:'活動が見つかりません'});
  sqlite.prepare('UPDATE activities SET photo=NULL,photo_mime=NULL,revision=revision+1 WHERE id=?').run(id);changed(user);return {ok:true};
 });
 function ghosts(user:string,worldId:string,online:Set<string>):ActivityGhost[]{
  settle();
  const rows=sqlite.prepare("SELECT a.id AS activityId,a.user_id AS id,a.title,a.ends_at AS endsAt,a.shared,u.display_name AS displayName,u.avatar_color AS color,u.style FROM activities a JOIN users u ON u.id=a.user_id WHERE a.finished_at IS NULL AND a.kind=? AND a.ends_at>?").all(worldId.replace('activity:',''),Date.now()) as (Omit<ActivityGhost,'worldId'|'x'|'y'|'online'>&{shared:number})[];
  return rows.filter(r=>r.id===user||r.shared&&!blocked(user,r.id)).map((r,i)=>({id:r.id,activityId:r.activityId,title:r.title,endsAt:r.endsAt,displayName:r.displayName,color:r.color,style:r.style,worldId,x:500+(i%5)*200,y:650+Math.floor(i/5)*140,online:online.has(r.id)}));
 }
 const signature=()=>JSON.stringify(sqlite.prepare('SELECT id,revision FROM activities WHERE finished_at IS NULL AND ends_at>? ORDER BY id').all(Date.now()));
 return {ghosts,settle,signature};
}
