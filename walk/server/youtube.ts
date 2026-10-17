import type {FastifyInstance} from 'fastify';
import {EnvHttpProxyAgent,fetch as proxyFetch,type Dispatcher} from 'undici';
import {z} from 'zod';
import {youtubeId} from '../shared/model';
import {youtubeThumbnail,type YouTubePreview} from '../shared/youtube';

export type YouTubeLoader=(id:string,signal:AbortSignal)=>Promise<unknown>;
const unavailable='YouTubeから情報を取得できませんでした。通信制限、非公開・削除、埋め込み制限などの可能性があります。元の動画を確認するか、手入力を選んでください。';
export async function loadYouTubeOEmbed(id:string,signal:AbortSignal,dispatcher:Dispatcher){
  if(!/^[\w-]{11}$/.test(id))throw new Error('動画IDを確認してください');
  const url=new URL('https://www.youtube.com/oembed');url.searchParams.set('url','https://www.youtube.com/watch?v='+id);url.searchParams.set('format','json');
  const response=await proxyFetch(url,{dispatcher,redirect:'manual',signal:AbortSignal.any([signal,AbortSignal.timeout(10000)]),headers:{Accept:'application/json'}});
  if(!response.ok||!response.body||!response.headers.get('content-type')?.includes('application/json')||Number(response.headers.get('content-length'))>65536){await response.body?.cancel();throw new Error(unavailable);}
  const reader=response.body.getReader(),parts:Uint8Array[]=[];let size=0;
  try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>65536){await reader.cancel();throw new Error(unavailable);}parts.push(value);}}finally{reader.releaseLock();}
  return JSON.parse(Buffer.concat(parts).toString('utf8')) as unknown;
}
export function parseYouTubePreview(value:unknown,id:string):YouTubePreview{
  if(!/^[\w-]{11}$/.test(id))throw new Error(unavailable);
  const p=z.object({type:z.literal('video'),provider_name:z.literal('YouTube'),title:z.string().trim().min(1).max(4096),author_name:z.string().trim().min(1).max(1024),author_url:z.string().max(2048)}).parse(value);
  const author=new URL(p.author_url);
  if(author.protocol!=='https:'||author.username||author.password||author.port||!['youtube.com','www.youtube.com'].includes(author.hostname)||!/^\/(?:channel\/UC[\w-]{22}|@[\w.\p{L}\p{N}-]+|(?:user|c)\/[\w.\p{L}\p{N}-]+)\/?$/u.test(decodeURIComponent(author.pathname)))throw new Error(unavailable);
  author.search='';author.hash='';
  return {videoId:id,url:'https://www.youtube.com/watch?v='+id,title:p.title.slice(0,120),authorName:p.author_name.slice(0,60),authorUrl:author.toString(),thumbnailUrl:youtubeThumbnail(id),channelId:/^\/channel\/(UC[\w-]{22})\/?$/.exec(author.pathname)?.[1]||null,fetchedAt:Date.now(),source:'youtube-oembed'};
}
export function youtubePreviews(app:FastifyInstance,loader?:YouTubeLoader){
  const agent=new EnvHttpProxyAgent(),abort=new AbortController(),cache=new Map<string,YouTubePreview>(),pending=new Map<string,Promise<YouTubePreview>>();
  async function get(id:string){
    const old=cache.get(id);if(old&&Date.now()-old.fetchedAt<600000)return old;
    const running=pending.get(id);if(running)return running;
    if(pending.size>=8)throw Object.assign(new Error('情報の取得が混み合っています。少し待ってください。'),{statusCode:429});
    const task=(async()=>{const result=parseYouTubePreview(await (loader?loader(id,abort.signal):loadYouTubeOEmbed(id,abort.signal,agent)),id);cache.delete(id);while(cache.size>=100)cache.delete(cache.keys().next().value!);cache.set(id,result);return result;})();
    pending.set(id,task);try{return await task;}finally{pending.delete(id);}
  }
  app.post('/api/youtube/preview',{config:{rateLimit:{max:12,timeWindow:'1 minute'}}},async(req,reply)=>{
    const {url}=z.object({url:z.string().max(2048)}).strict().parse(req.body),id=youtubeId(url);
    if(!id)return reply.code(400).send({error:'正しいYouTube動画・ShortsのURLを入力してください。'});
    try{return await get(id);}catch(e){if(e instanceof Error&&'statusCode' in e&&e.statusCode===429)throw e;return reply.code(502).send({error:unavailable});}
  });
  return {close:async()=>{abort.abort();await Promise.allSettled([...pending.values()]);cache.clear();await agent.close();}};
}
