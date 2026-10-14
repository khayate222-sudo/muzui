import { z } from 'zod';
import { safeExternal, youtubeId } from './model';
export function sourceInfo(value: string): {provider:string;url:string;videoId?:string} | null {
  if (!safeExternal(value)) return null;
  const u = new URL(value), videoId = youtubeId(value);
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
export type PublicUser={id:string;displayName:string;color:string;style:'cap'|'beanie'|'hair'};
export type Party={id:string;ownerId:string;members:PublicUser[]};
export type PartyState={party:Party|null;invites:{id:string;partyId:string;from:PublicUser}[]};
export type VoiceMember={socketId:string;userId:string;displayName:string};
