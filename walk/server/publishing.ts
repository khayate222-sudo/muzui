import type { FastifyInstance } from 'fastify';
import multipart from '@fastify/multipart';
import { randomUUID } from 'node:crypto';
import { mkdir,readFile,writeFile,unlink } from 'node:fs/promises';
import { join,resolve } from 'node:path';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import type { Store } from './db';
import * as t from './schema';
import { postPosition } from './placement';
import { acceptsPost } from '../shared/worlds';
import { genres } from '../shared/model';
export const nativePostSchema=z.object({worldId:z.string().max(80).nullable().optional(),title:z.string().trim().min(1).max(120),body:z.string().trim().max(4000),genre:z.enum(genres),attachmentId:z.string().uuid().nullable().default(null)}).refine(p=>acceptsPost(p.worldId,p.genre),'ジャンルに合う世界を選んでください');
type Upload={id:string;owner_id:string;filename:string;mime:string;bytes:number;created_at:number};
export function identifyMedia(b:Buffer):{mime:string;ext:string}|null{
  if(b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))return {mime:'image/png',ext:'png'};
  if(b[0]===255&&b[1]===216&&b[2]===255)return {mime:'image/jpeg',ext:'jpg'};
  if(['GIF87a','GIF89a'].includes(b.subarray(0,6).toString()))return {mime:'image/gif',ext:'gif'};
  if(b.subarray(0,4).toString()==='RIFF'&&b.subarray(8,12).toString()==='WEBP')return {mime:'image/webp',ext:'webp'};
  if(b.length>=12&&b.subarray(4,8).toString()==='ftyp'&&['isom','iso2','mp41','mp42','avc1','M4V ','dash'].includes(b.subarray(8,12).toString()))return {mime:'video/mp4',ext:'mp4'};
  if(b.subarray(0,4).equals(Buffer.from([26,69,223,163]))&&b.subarray(0,256).includes(Buffer.from('webm')))return {mime:'video/webm',ext:'webm'};
  return null;
}

export async function publishing({app,store,changed,mediaDirectory}:{app:FastifyInstance;store:Store;changed:()=>void;mediaDirectory:string}){
  const {db,sqlite}=store,root=resolve(mediaDirectory);await mkdir(root,{recursive:true,mode:0o700});
  await app.register(multipart,{limits:{fileSize:25*1024*1024,files:1,fields:0,parts:1}});
  app.post('/api/uploads',{config:{rateLimit:{max:5,timeWindow:'1 minute'}}},async(req,reply)=>{
    const owner=req.session!.userId;
    const total=(sqlite.prepare('SELECT COALESCE(SUM(bytes),0) AS n FROM media_uploads WHERE owner_id=?').get(owner) as {n:number}).n;
    if(total>=200*1024*1024)return reply.code(409).send({error:'アップロードは1人200MBまでです'});
    const part=await req.file();if(!part)return reply.code(400).send({error:'ファイルを選んでください'});
    const bytes=await part.toBuffer(),kind=identifyMedia(bytes);
    if(!kind)return reply.code(400).send({error:'PNG・JPEG・GIF・WebP画像、MP4・WebM動画に対応しています'});
    if(total+bytes.length>200*1024*1024)return reply.code(409).send({error:'アップロードは1人200MBまでです'});
    const id=randomUUID(),filename=id+'.'+kind.ext;
    await writeFile(join(root,filename),bytes,{flag:'wx',mode:0o600});
    const usedNow=(sqlite.prepare('SELECT COALESCE(SUM(bytes),0) AS n FROM media_uploads WHERE owner_id=?').get(owner) as {n:number}).n;
    if(usedNow+bytes.length>200*1024*1024){await unlink(join(root,filename));return reply.code(409).send({error:'アップロードは1人200MBまでです'});}
    try{sqlite.prepare('INSERT INTO media_uploads VALUES (?,?,?,?,?,?)').run(id,owner,filename,kind.mime,bytes.length,Date.now());}catch(e){await unlink(join(root,filename));throw e;}
    return {id,url:'/media/'+filename,mime:kind.mime};
  });
  app.get('/media/:name',async(req,reply)=>{
    const name=(req.params as {name:string}).name;
    const row=sqlite.prepare('SELECT * FROM media_uploads WHERE filename=?').get(name) as Upload|undefined;
    if(!row)return reply.code(404).send({error:'ファイルが見つかりません'});
    // Public media belongs to public posts. Unpublished uploads are owner-only.
    const published=sqlite.prepare('SELECT id FROM posts WHERE media_url=?').get('/media/'+name);
    const token=app.parseCookie(req.headers.cookie||'').walk_session;
    if(!published){
      const {createHash}=await import('node:crypto');
      const session=token?sqlite.prepare('SELECT user_id FROM sessions WHERE token_hash=? AND expires_at>?').get(createHash('sha256').update(token).digest('hex'),Date.now()) as {user_id:string}|undefined:undefined;
      if(session?.user_id!==row.owner_id)return reply.code(404).send({error:'ファイルが見つかりません'});
    }
    let bytes:Buffer;try{bytes=await readFile(join(root,row.filename));}catch{return reply.code(404).send({error:'ファイルが見つかりません'});}
    reply.type(row.mime).header('X-Content-Type-Options','nosniff').header('Cache-Control','no-store').header('Accept-Ranges','bytes');
    const range=req.headers.range;
    if(range){const m=/^bytes=(\d*)-(\d*)$/.exec(range);if(!m||(!m[1]&&!m[2]))return reply.code(416).header('Content-Range',`bytes */${bytes.length}`).send();const start=m[1]?Number(m[1]):Math.max(0,bytes.length-Number(m[2])),end=m[1]?(m[2]?Math.min(Number(m[2]),bytes.length-1):bytes.length-1):bytes.length-1;if(start>=bytes.length||start>end)return reply.code(416).header('Content-Range',`bytes */${bytes.length}`).send();return reply.code(206).header('Content-Range',`bytes ${start}-${end}/${bytes.length}`).send(bytes.subarray(start,end+1));}
    return reply.send(bytes);
  });
  app.delete('/api/uploads/:id',async(req,reply)=>{
    const row=sqlite.prepare('SELECT * FROM media_uploads WHERE id=? AND owner_id=?').get((req.params as {id:string}).id,req.session!.userId) as Upload|undefined;
    if(!row)return reply.code(404).send({error:'ファイルが見つかりません'});
    if(sqlite.prepare('SELECT id FROM posts WHERE media_url=?').get('/media/'+row.filename))return reply.code(409).send({error:'公開済みの投稿に使われています'});
    sqlite.prepare('DELETE FROM media_uploads WHERE id=?').run(row.id);await unlink(join(root,row.filename)).catch(()=>{});return {ok:true};
  });
  app.post('/api/posts',{config:{rateLimit:{max:6,timeWindow:'1 minute'}}},async(req,reply)=>{
    const p=nativePostSchema.parse(req.body),owner=req.session!.userId;
    if((sqlite.prepare("SELECT COUNT(*) AS n FROM posts WHERE owner_id=? AND origin='walk'").get(owner) as {n:number}).n>=100)return reply.code(409).send({error:'直接投稿は1人100件までです'});
    const attachment=p.attachmentId?sqlite.prepare('SELECT * FROM media_uploads WHERE id=? AND owner_id=?').get(p.attachmentId,owner) as Upload|undefined:null;
    if(p.attachmentId&&!attachment)return reply.code(403).send({error:'自分がアップロードしたファイルを選んでください'});
    const author=db.select().from(t.users).where(eq(t.users.id,owner)).get()!,id=randomUUID();
    db.insert(t.posts).values({id,worldId:p.worldId,ownerId:owner,origin:'walk',type:attachment?(attachment.mime.startsWith('video/')?'video':'image'):'text',title:p.title,body:p.body,genre:p.genre,mediaUrl:attachment?'/media/'+attachment.filename:'',externalUrl:'',provider:'WALK',authorName:author.displayName,...postPosition(store,p.genre),isSample:false,createdAt:Date.now()}).run();changed();return {id};
  });
  app.delete('/api/posts/:id',async(req,reply)=>{
    const id=(req.params as {id:string}).id,row=db.select().from(t.posts).where(eq(t.posts.id,id)).get();
    if(!row||row.ownerId!==req.session!.userId||row.origin!=='walk')return reply.code(403).send({error:'自分のWALK投稿だけ削除できます'});
    db.delete(t.posts).where(eq(t.posts.id,id)).run();
    if(row.mediaUrl&&!db.select().from(t.posts).where(eq(t.posts.mediaUrl,row.mediaUrl)).get()){
      const media=sqlite.prepare('SELECT * FROM media_uploads WHERE filename=? AND owner_id=?').get(row.mediaUrl.slice('/media/'.length),req.session!.userId) as Upload|undefined;
      if(media){sqlite.prepare('DELETE FROM media_uploads WHERE id=?').run(media.id);await unlink(join(root,media.filename)).catch(()=>{});}
    }
    changed();return {ok:true};
  });
}
