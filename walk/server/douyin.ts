import type {FastifyInstance} from 'fastify';
import {EnvHttpProxyAgent,fetch as proxyFetch,type Dispatcher} from 'undici';
import {z} from 'zod';
import {sourceInfo} from '../shared/community';
import {douyinPlayerUrl,type DouyinPreview} from '../shared/douyin';

export type DouyinLoader=(id:string,signal:AbortSignal)=>Promise<unknown>;
export type DouyinResolver=(url:string,signal:AbortSignal)=>Promise<string>;
const unavailable='抖音の再生情報を確認できませんでした。非公開・削除・地域や接続の制限などが考えられます。元の投稿を確認するか、もう一度お試しください。';
const shortUnavailable='抖音の短縮リンクから動画を確認できませんでした。元のリンクを開き、動画の通常URLを貼り付けてください。';
class UnavailableVideo extends Error{}

export async function loadDouyinIframe(id:string,signal:AbortSignal,dispatcher:Dispatcher){
  if(!douyinPlayerUrl(id))throw new Error(unavailable);
  const url=new URL('https://open.douyin.com/api/douyin/v1/video/get_iframe_by_video');url.searchParams.set('video_id',id);
  const response=await proxyFetch(url,{dispatcher,redirect:'manual',signal,headers:{Accept:'application/json'}});
  if(!response.ok||!response.body||!response.headers.get('content-type')?.includes('application/json')||Number(response.headers.get('content-length'))>65536){await response.body?.cancel();throw new Error(unavailable);}
  const reader=response.body.getReader(),parts:Uint8Array[]=[];let size=0;
  try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>65536){await reader.cancel();throw new Error(unavailable);}parts.push(value);}}finally{reader.releaseLock();}
  return JSON.parse(Buffer.concat(parts).toString('utf8')) as unknown;
}

// Follow only known Douyin short hosts. A normal video location is parsed for
// its ID without fetching the destination or bypassing its login/challenge.
export async function resolveDouyinLink(value:string,signal:AbortSignal,dispatcher:Dispatcher):Promise<string>{
  let source=sourceInfo(value);const seen=new Set<string>();
  for(let hops=0;hops<3;hops++){
    if(!source||source.provider!=='抖音')throw new Error(shortUnavailable);
    if(source.videoId)return source.videoId;
    if(!source.shortLink||seen.has(source.url))throw new Error(shortUnavailable);
    seen.add(source.url);
    const response=await proxyFetch(source.url,{dispatcher,redirect:'manual',signal});
    const status=response.status,location=response.headers.get('location');await response.body?.cancel();
    if(![301,302,303,307,308].includes(status)||!location)throw new Error(shortUnavailable);
    const next=new URL(location,source.url);if(next.protocol!=='https:'||next.username||next.password||next.port||!['v.douyin.com','www.douyin.com','douyin.com','www.iesdouyin.com','iesdouyin.com'].includes(next.hostname))throw new Error(shortUnavailable);
    source=sourceInfo(next.toString());
    if(source?.provider==='抖音'&&source.videoId)return source.videoId;
  }
  throw new Error(shortUnavailable);
}

export function parseDouyinPreview(value:unknown,id:string):DouyinPreview{
  if(!douyinPlayerUrl(id))throw new Error(unavailable);
  const envelope=z.object({err_no:z.number().int(),data:z.unknown().optional()}).parse(value);
  if(envelope.err_no===28003004)throw new UnavailableVideo(unavailable);
  if(envelope.err_no!==0)throw new Error(unavailable);
  const data=z.object({video_title:z.string().trim().min(1).max(4096),video_width:z.number().int().min(1).max(16384),video_height:z.number().int().min(1).max(16384),iframe_code:z.string().max(16384)}).parse(envelope.data);
  const attrs=/^\s*<iframe\b([^<>]*)>\s*<\/iframe>\s*$/i.exec(data.iframe_code)?.[1];
  const src=attrs&&/(?:^|\s)src\s*=\s*(["'])(.*?)\1/i.exec(attrs)?.[2];
  if(!src)throw new Error(unavailable);
  const player=new URL(src.replaceAll('&amp;','&'));
  if(player.origin!=='https://open.douyin.com'||player.username||player.password||player.pathname!=='/player/video'||player.searchParams.get('vid')!==id)throw new Error(unavailable);
  return {videoId:id,url:'https://www.douyin.com/video/'+id,title:data.video_title.slice(0,120),width:data.video_width,height:data.video_height,playerUrl:douyinPlayerUrl(id),checkedAt:Date.now(),source:'douyin-iframe-api'};
}

export function douyinPreviews(app:FastifyInstance,loader?:DouyinLoader,resolver?:DouyinResolver){
  const agent=new EnvHttpProxyAgent(),abort=new AbortController(),cache=new Map<string,DouyinPreview>(),pending=new Map<string,Promise<DouyinPreview>>();
  async function get(url:string){
    const running=pending.get(url);if(running)return running;
    if(pending.size>=8)throw Object.assign(new Error('再生情報の確認が混み合っています。少し待ってください。'),{statusCode:429});
    const task=(async()=>{const signal=AbortSignal.any([abort.signal,AbortSignal.timeout(10000)]);const id=await (resolver?resolver(url,signal):resolveDouyinLink(url,signal,agent));if(!douyinPlayerUrl(id))throw new Error(shortUnavailable);
      const old=cache.get(id);if(old&&Date.now()-old.checkedAt<600000)return old;
      const result=parseDouyinPreview(await (loader?loader(id,signal):loadDouyinIframe(id,signal,agent)),id);cache.delete(id);while(cache.size>=100)cache.delete(cache.keys().next().value!);cache.set(id,result);return result;})();
    pending.set(url,task);try{return await task;}finally{pending.delete(url);}
  }
  app.post('/api/douyin/preview',{config:{rateLimit:{max:12,timeWindow:'1 minute'}}},async(req,reply)=>{
    const {url}=z.object({url:z.string().max(2048)}).strict().parse(req.body),source=sourceInfo(url);
    if(source?.provider!=='抖音')return reply.code(400).send({error:'抖音の動画URLまたは共有短縮リンクを一つ入力してください。'});
    try{return await get(source.url);}catch(e){if(e instanceof Error&&'statusCode' in e&&e.statusCode===429)throw e;return reply.code(e instanceof UnavailableVideo?422:502).send({error:e instanceof Error&&e.message===shortUnavailable?shortUnavailable:unavailable});}
  });
  return {close:async()=>{abort.abort();await Promise.allSettled([...pending.values()]);cache.clear();await agent.close();}};
}
