import type { FastifyInstance } from 'fastify';
import type { Store } from './db';
import { randomUUID } from 'node:crypto';
import { XMLParser,XMLValidator } from 'fast-xml-parser';
import { EnvHttpProxyAgent,fetch as proxyFetch } from 'undici';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { genres } from '../shared/model';
import * as t from './schema';
import { postPosition } from './placement';
export type CollectionSource={id:string;channel_id:string;label:string;genre:typeof genres[number];enabled:number;auto_publish:number;last_checked:number|null;next_check:number;last_error:string|null};
export type Candidate={id:string;source_id:string;video_id:string;title:string;author_name:string;published_at:number;state:string;post_id:string|null};
export type FeedVideo={id:string;title:string;author:string;publishedAt:number};
export type FeedLoader=(channelId:string,signal:AbortSignal)=>Promise<string>;
export function channelId(value:string){if(/^UC[\w-]{22}$/.test(value))return value;try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password&&['youtube.com','www.youtube.com'].includes(u.hostname)&&/^\/channel\/UC[\w-]{22}\/?$/.test(u.pathname)?u.pathname.split('/')[2]:null;}catch{return null;}}
export function parseFeed(xml:string,expectedChannel:string):FeedVideo[]{
  if(Buffer.byteLength(xml)>512*1024||/<!DOCTYPE|<!ENTITY/i.test(xml)||XMLValidator.validate(xml)!==true)throw new Error('フィードの形式を確認できません');
  const parsed=new XMLParser({ignoreAttributes:false,parseTagValue:false,trimValues:true}).parse(xml);
  const feed=parsed?.feed;if(!feed||feed['yt:channelId']!==expectedChannel)throw new Error('登録チャンネルと取得結果が一致しません');
  const entries=feed.entry?Array.isArray(feed.entry)?feed.entry:[feed.entry]:[];
  return entries.slice(0,15).flatMap((e:Record<string,unknown>)=>{
    const id=e['yt:videoId'],title=e.title,author=e.author as {name?:unknown}|undefined,time=typeof e.published==='string'?Date.parse(e.published):NaN;
    return typeof id==='string'&&/^[\w-]{11}$/.test(id)&&typeof title==='string'&&title.trim()&&typeof author?.name==='string'&&Number.isFinite(time)?[{id,title:title.trim().slice(0,120),author:author.name.slice(0,60)||'YouTube',publishedAt:time}]:[];
  });
}
export function collector({app,store,changed,loadFeed}:{app:FastifyInstance;store:Store;changed:()=>void;loadFeed?:FeedLoader}){
  const {sqlite,db}=store,agent=new EnvHttpProxyAgent(),abort=new AbortController(),running=new Map<string,Promise<{added:number;published:number}>>();
  const load:FeedLoader=loadFeed||(async(channel,signal)=>{
    const r=await proxyFetch('https://www.youtube.com/feeds/videos.xml?channel_id='+channel,{dispatcher:agent,redirect:'manual',signal:AbortSignal.any([signal,AbortSignal.timeout(10000)]),headers:{Accept:'application/atom+xml'}});
    if(!r.ok||!r.body){await r.body?.cancel();throw new Error('YouTubeに接続できませんでした。通信許可とチャンネルIDを確認してください。');}
    if(Number(r.headers.get('content-length'))>512*1024){await r.body.cancel();throw new Error('フィードが大きすぎます');}
    const reader=r.body.getReader(),parts:Uint8Array[]=[];let size=0;
    while(true){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>512*1024){await reader.cancel();throw new Error('フィードが大きすぎます');}parts.push(value);}
    return Buffer.concat(parts).toString('utf8');
  });
  const sources=()=>sqlite.prepare('SELECT * FROM collection_sources ORDER BY label').all() as CollectionSource[];
  function publish(item:Candidate,source:CollectionSource){
    if(item.state!=='pending')return false;
    const url='https://www.youtube.com/watch?v='+item.video_id;
    const existing=db.select().from(t.posts).where(eq(t.posts.externalUrl,url)).all().find(p=>!p.isSample);
    const id=existing?.id||randomUUID();
    if(!existing)db.insert(t.posts).values({id,origin:'external',type:'youtube',title:item.title,body:'',provider:'YouTube',authorName:item.author_name,genre:source.genre,externalUrl:url,mediaUrl:'',...postPosition(store,source.genre),isSample:false,createdAt:item.published_at}).run();
    sqlite.prepare("UPDATE collection_items SET state='published',post_id=? WHERE id=?").run(id,item.id);return !existing;
  }
  async function sync(source:CollectionSource){
    const current=running.get(source.id);if(current)return current;
    const task=(async()=>{
      sqlite.prepare('UPDATE collection_sources SET next_check=? WHERE id=?').run(Date.now()+3600000,source.id);
      try{
        const entries=parseFeed(await load(source.channel_id,abort.signal),source.channel_id);
        let added=0,published=0;
        sqlite.transaction(()=>{
          // Source may have been removed or paused while the request was in progress.
          const fresh=sqlite.prepare('SELECT * FROM collection_sources WHERE id=?').get(source.id) as CollectionSource|undefined;if(!fresh?.enabled)return;
          for(const entry of entries){const id=randomUUID();const result=sqlite.prepare('INSERT OR IGNORE INTO collection_items (id,source_id,video_id,title,author_name,published_at) VALUES (?,?,?,?,?,?)').run(id,source.id,entry.id,entry.title,entry.author,entry.publishedAt);if(result.changes){added++;if(fresh.auto_publish&&publish(sqlite.prepare('SELECT * FROM collection_items WHERE id=?').get(id) as Candidate,fresh))published++;}}
          sqlite.prepare('UPDATE collection_sources SET last_checked=?,last_error=NULL WHERE id=?').run(Date.now(),source.id);
        })();if(published)changed();return {added,published};
      }catch(e){if(!abort.signal.aborted)sqlite.prepare('UPDATE collection_sources SET last_checked=?,last_error=? WHERE id=?').run(Date.now(),(e instanceof Error?e.message:'取得に失敗しました').slice(0,300),source.id);throw e;}
    })();running.set(source.id,task);try{return await task;}finally{running.delete(source.id);}
  }
  app.get('/api/admin/collections',async()=>({sources:sources(),items:sqlite.prepare("SELECT i.*,s.label,s.genre FROM collection_items i JOIN collection_sources s ON i.source_id=s.id ORDER BY (i.state='pending') DESC,i.published_at DESC LIMIT 150").all(),intervalMinutes:60}));
  const input=z.object({channel:z.string().max(300),label:z.string().trim().min(1).max(80),genre:z.enum(genres),autoPublish:z.boolean().default(false)});
  app.post('/api/admin/collections',async(req,reply)=>{
    const p=input.parse(req.body),channel=channelId(p.channel);if(!channel)return reply.code(400).send({error:'YouTubeのUCから始まるチャンネルID、または /channel/UC… のURLを入力してください。@名前のURLは未対応です。'});
    if(sources().length>=20)return reply.code(409).send({error:'収集元は20チャンネルまでです'});
    if(sources().some(s=>s.channel_id===channel))return reply.code(409).send({error:'登録済みのチャンネルです'});
    const id=randomUUID();sqlite.prepare('INSERT INTO collection_sources (id,channel_id,label,genre,auto_publish) VALUES (?,?,?,?,?)').run(id,channel,p.label,p.genre,Number(p.autoPublish));return {id};
  });
  app.patch('/api/admin/collections/:id',async(req,reply)=>{
    const p=z.object({enabled:z.boolean(),autoPublish:z.boolean()}).parse(req.body),id=(req.params as {id:string}).id;
    if(!sqlite.prepare('UPDATE collection_sources SET enabled=?,auto_publish=? WHERE id=?').run(Number(p.enabled),Number(p.autoPublish),id).changes)return reply.code(404).send({error:'収集元が見つかりません'});return {ok:true};
  });
  app.post('/api/admin/collections/:id/sync',{config:{rateLimit:{max:6,timeWindow:'1 minute'}}},async(req,reply)=>{
    const s=sources().find(s=>s.id===(req.params as {id:string}).id);if(!s||!s.enabled)return reply.code(409).send({error:'有効な収集元を選んでください'});
    try{return await sync(s);}catch(e){return reply.code(502).send({error:e instanceof Error?e.message:'取得できませんでした'});}
  });
  app.post('/api/admin/collection-items/:id',async(req,reply)=>{
    const p=z.object({action:z.enum(['publish','dismiss'])}).parse(req.body),item=sqlite.prepare('SELECT * FROM collection_items WHERE id=?').get((req.params as {id:string}).id) as Candidate|undefined;
    if(!item||item.state!=='pending')return reply.code(409).send({error:'未確認の候補を選んでください'});
    if(p.action==='dismiss')sqlite.prepare("UPDATE collection_items SET state='dismissed' WHERE id=?").run(item.id);else{sqlite.transaction(()=>publish(item,sources().find(s=>s.id===item.source_id)!))();changed();}return {ok:true};
  });
  let ticking=false;
  const timer=setInterval(()=>{if(ticking||abort.signal.aborted)return;ticking=true;void (async()=>{for(const s of sources().filter(s=>s.enabled&&s.next_check<=Date.now())){if(abort.signal.aborted)break;try{await sync(s);}catch{/* Status is persisted for the administrator. */}}})().finally(()=>ticking=false);},60000);timer.unref();
  return {close:async()=>{clearInterval(timer);abort.abort();await Promise.allSettled([...running.values()]);await agent.close();}};
}
