import { z } from 'zod';
import { safeExternal, youtubeId } from './model';
export const shortVideoSources=[
  {provider:'抖音',label:'抖音 / Douyin',description:'中国の短い動画',example:'https://v.douyin.com/…'},
  {provider:'快手',label:'快手 / Kuaishou',description:'中国の日常・趣味の動画',example:'https://v.kuaishou.com/…'},
  {provider:'bilibili',label:'bilibili',description:'絵・工作・日常の動画',example:'https://www.bilibili.com/video/BV…'},
] as const;
export type SourceInfo={provider:string;url:string;videoId?:string;shortLink?:boolean;page?:number};
// Chinese apps copy a sentence and a public URL together. Never resolve redirects
// or fetch pasted text; require exactly one HTTP(S) URL before checking its host.
export function sharedPostUrl(value:string):string|null{
  if(value.length>2048)return null;
  const urls=value.match(/https?:\/\/[^\s<>"'，。！？；、（）【】《》「」『』]+/g);
  return urls?.length===1?urls[0].replace(/[)\],.!;]+$/,''):null;
}
export function sourceInfo(value: string): SourceInfo | null {
  const pasted=sharedPostUrl(value);if(!pasted)return null;value=pasted;
  if (!safeExternal(value)) return null;
  const u = new URL(value), videoId = youtubeId(value);
  if(u.port)return null;
  if(['www.bilibili.com','bilibili.com','m.bilibili.com'].includes(u.hostname)){
    const id=/^\/video\/(BV[A-Za-z0-9]{10})\/?$/.exec(u.pathname)?.[1];
    const raw=u.searchParams.get('p'),page=raw===null?1:/^[1-9]\d{0,2}$/.test(raw)?Number(raw):0;
    if(!id||page<1||page>100||u.searchParams.getAll('p').length>1)return null;
    return {provider:'bilibili',videoId:id,page,url:'https://www.bilibili.com/video/'+id+(page>1?'?p='+page:'')};
  }
  if(['v.douyin.com','v.kuaishou.com'].includes(u.hostname)){
    const m=/^\/([A-Za-z0-9_-]{4,80})\/?$/.exec(u.pathname);
    if(m)return {provider:u.hostname==='v.douyin.com'?'抖音':'快手',url:'https://'+u.hostname+'/'+m[1]+'/',shortLink:true};
    return null;
  }
  if(['www.douyin.com','douyin.com','www.iesdouyin.com','iesdouyin.com'].includes(u.hostname)){
    const legacy=u.hostname.endsWith('iesdouyin.com');
    const id=(legacy?/^\/share\/video\/(\d{6,25})\/?$/:/^\/video\/(\d{6,25})\/?$/).exec(u.pathname)?.[1]||(!legacy&&u.pathname==='/'&&/^\d{6,25}$/.test(u.searchParams.get('modal_id')||'')?u.searchParams.get('modal_id'):null);
    return id?{provider:'抖音',url:'https://www.douyin.com/video/'+id,videoId:id}:null;
  }
  if(['www.kuaishou.com','kuaishou.com'].includes(u.hostname)){
    const id=/^\/short-video\/([A-Za-z0-9_-]{6,40})\/?$/.exec(u.pathname)?.[1];
    return id?{provider:'快手',url:'https://www.kuaishou.com/short-video/'+id,videoId:id}:null;
  }
  if (videoId) return {provider:'YouTube',url:`https://www.youtube.com/watch?v=${videoId}`,videoId};
  if (['x.com','www.x.com','twitter.com','www.twitter.com','mobile.twitter.com'].includes(u.hostname)) {
    const m=u.pathname.match(/^\/(\w{1,15})\/status\/(\d{1,25})(?:\/.*)?$/);
    if(m)return {provider:'X',url:`https://x.com/${m[1]}/status/${m[2]}`};
  }
  if (['www.tiktok.com','tiktok.com'].includes(u.hostname)) {
    const m=u.pathname.match(/^\/@([\w.]+)\/video\/(\d{1,25})\/?$/);
    if(m)return {provider:'TikTok',url:`https://www.tiktok.com/@${m[1]}/video/${m[2]}`,videoId:m[2]};
  }
  return null;
}
export const roomSchema=z.object({title:z.string().trim().min(1).max(60),description:z.string().max(400),isPublic:z.boolean(),theme:z.enum(['garden','studio','night']),items:z.array(z.object({postId:z.string().max(80),x:z.number().int().min(120).max(1880),y:z.number().int().min(180).max(1200)})).max(40),decorations:z.array(z.object({kind:z.enum(['tree','flower','stone','bench']),x:z.number().int().min(100).max(1900),y:z.number().int().min(160).max(1250)})).max(60)}).refine(r=>new Set(r.items.map(i=>i.postId)).size===r.items.length,'同じ投稿は1回だけ配置できます');
export type RoomInput=z.infer<typeof roomSchema>;
export type Room=RoomInput & {id:string;ownerId:string;ownerName:string;updatedAt:number;revision:number};
export type PublicUser={id:string;displayName:string;color:string;style:'cap'|'beanie'|'hair'|'cat'|'fox'};
export type Party={id:string;ownerId:string;members:PublicUser[]};
export type PartyState={party:Party|null;invites:{id:string;partyId:string;from:PublicUser}[]};
export type VoiceMember={socketId:string;userId:string;displayName:string};
