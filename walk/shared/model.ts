import { z } from 'zod';
import { acceptsPost, places, type Place } from './worlds';
import type { ActivityGhost } from './activities';
export const genres = ['discovery', 'music', 'video', 'art', 'meme', 'game', 'anime'] as const;
export type Genre = typeof genres[number];
export const areas: { id: Genre; name: string; label: string; color: string; x: number; y: number; icon: string }[] = [
  { id: 'discovery', name: 'DISCOVERY SQUARE', label: 'ディスカバリー広場', color: '#e5b36d', x: 1000, y: 690, icon: '✦' },
  { id: 'music', name: 'MUSIC STREET', label: 'ミュージックストリート', color: '#b3a2d7', x: 440, y: 340, icon: '♫' },
  { id: 'video', name: 'VIDEO PARK', label: 'ビデオパーク', color: '#e7a18b', x: 1570, y: 340, icon: '▶' },
  { id: 'art', name: 'ART GARDEN', label: 'アートガーデン', color: '#89bbaa', x: 440, y: 1050, icon: '✿' },
  { id: 'meme', name: 'MEME ALLEY', label: 'ミームアレー', color: '#dfbc69', x: 1570, y: 1050, icon: '☺' },
  { id: 'game', name: 'GAME STREET', label: 'ゲームストリート', color: '#8aaecb', x: 1000, y: 230, icon: '♟' },
  { id: 'anime', name: 'ANIME GARDEN', label: 'アニメガーデン', color: '#d6a4be', x: 1000, y: 1140, icon: '☆' },
];
export const profileSchema = z.object({ displayName: z.string().trim().min(1).max(24), color: z.string().regex(/^#[0-9a-fA-F]{6}$/), style: z.enum(['cap', 'beanie', 'hair', 'cat', 'fox']), shareActivity: z.boolean() });
export const safeExternal = (value: string) => {
  try { const u = new URL(value); return u.protocol === 'https:' && !u.username && !u.password; } catch { return false; }
};
export function youtubeId(value: string): string | null {
  try {
    const u = new URL(value);
    if (!safeExternal(value)) return null;
    const id = ['www.youtube.com', 'youtube.com', 'm.youtube.com'].includes(u.hostname) ? (/^\/(shorts|live|embed)\//.test(u.pathname) ? u.pathname.split('/')[2] : u.searchParams.get('v')) : u.hostname === 'youtu.be' ? u.pathname.slice(1) : null;
    return id && /^[\w-]{11}$/.test(id) ? id : null;
  } catch { return null; }
}
const url = z.string().max(2048).refine(v => v === '' || safeExternal(v), 'HTTPS URLを入力してください');
export const makePostSchema = (catalog:readonly Place[]=places) => z.object({
  worldId: z.string().max(80).nullable().optional(), type: z.enum(['text', 'image', 'video', 'youtube', 'external']), title: z.string().trim().min(1).max(120), body: z.string().max(4000),
  mediaUrl: z.string().max(2048).refine(v => v === '' || (/^\/art\/[\w-]+\.svg$/.test(v)||/^\/media\/[a-f0-9-]{36}\.(png|jpg|webp|gif|mp4|webm)$/.test(v)) || safeExternal(v)),
  externalUrl: url, provider: z.string().max(60), authorName: z.string().trim().min(1).max(60), genre: z.enum(genres),
  mapX: z.number().min(80).max(1920), mapY: z.number().min(100).max(1320), isSample: z.boolean().default(false),
}).superRefine((p, ctx) => {
  if(!acceptsPost(p.worldId,p.genre,catalog))ctx.addIssue({code:'custom',path:['worldId'],message:'ジャンルに合う世界を選んでください'});
  if (p.type === 'youtube' && !youtubeId(p.externalUrl)) ctx.addIssue({ code: 'custom', path: ['externalUrl'], message: '正しいYouTube動画URLが必要です' });
  if ((p.type === 'image'||p.type === 'video') && !p.mediaUrl) ctx.addIssue({ code: 'custom', path: ['mediaUrl'], message: '画像URLが必要です' });
  if (p.type === 'external' && !p.externalUrl) ctx.addIssue({ code: 'custom', path: ['externalUrl'], message: '出典URLが必要です' });
});
export const postSchema = makePostSchema();
export type PostInput = z.infer<typeof postSchema>;
export type Post = PostInput & { origin?:'walk'|'external'|'sample'|'editorial'; ownerId?:string|null; id: string; createdAt: number; saves: number; reactions: Record<string,number> };
export type User = z.infer<typeof profileSchema> & { id: string; createdAt: number };
export type Peer = Pick<User, 'id' | 'displayName' | 'color' | 'style'> & { x: number; y: number; area: Genre; worldId?: string; currentPost: string | null };
export type WorldState = { activities?: ActivityGhost[]; peers: Peer[]; counts: Record<string, number>; viewers: Record<string, (Pick<Peer, 'id' | 'displayName' | 'color' | 'style'>&{reaction?:string|null})[]>; online: number };
export type Friendship = { id: string; requesterId: string; receiverId: string; status: string; createdAt: number; user: Pick<User, 'id' | 'displayName' | 'color' | 'style'> };
export type Message = { id: string; senderId: string; receiverId: string; content: string; createdAt: number };
export type Bootstrap = { worlds?:Place[]; requireAccountForPublishing?:boolean; account?:import('./accounts').AccountSummary; user: User; posts: Post[]; favorites: string[]; reactions: Record<string,string>; friendships: Friendship[]; blocks: string[]; isAdmin: boolean };
export const moveSchema = z.object({ x: z.number().finite().min(40).max(1960), y: z.number().finite().min(70).max(1360) });
export function areaAt(x: number, y: number): Genre { return [...areas].sort((a, b) => Math.hypot(a.x-x,a.y-y)-Math.hypot(b.x-x,b.y-y))[0].id; }
