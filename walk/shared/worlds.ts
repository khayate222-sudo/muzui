import type { Genre } from './model';
import { z } from 'zod';
export const landscapes = ['discovery','music','video','art','meme','game','anime','garden','japan','future','fantasy'] as const;
export type Landscape = typeof landscapes[number];
export const worldDraftSchema = z.object({title:z.string().trim().min(1).max(48),description:z.string().trim().max(400),landscape:z.enum(landscapes)}).strict();
export const worldCreateSchema = worldDraftSchema.extend({parentId:z.string().min(1).max(80)});
export type WorldDraft = z.infer<typeof worldDraftSchema>;

export type Place = { id:string; parentId:string|null; title:string; description:string; genre?:Genre; theme:'station'|'garden'|'future'|'fantasy'|'japan'; gate:'door'|'cave'|'house'|'castle'; color:string; landscape?:Landscape; ownerId?:string; revision?:number };
export const places:Place[]=[
  {id:'public',parentId:null,title:'不思議な駅',description:'行き先は、あなたの「好き」。入口を通って奥の世界へ。',theme:'station',gate:'door',color:'#e5b36d'},
  ...([
    ['discovery','発見の広場','garden','#e5b36d','house'],['music','音楽の世界','japan','#b3a2d7','door'],['video','動画の世界','future','#e7a18b','door'],['art','アートの世界','garden','#89bbaa','house'],['meme','ミームの世界','garden','#dfbc69','cave'],['game','ゲームの世界','future','#8aaecb','castle'],['anime','アニメの世界','japan','#d6a4be','door'],
  ] as const).map(([genre,title,theme,color,gate])=>({id:'world:'+genre,parentId:'public',title,description:'好きな投稿を開いて、同じ趣味の人に出会おう。',genre,theme,color,gate,landscape:genre})),
  {id:'world:game-rpg',parentId:'world:game',title:'RPGの世界',description:'冒険の物語、育成、探索。少人数でもゆっくり語れる場所。',genre:'game',theme:'fantasy',gate:'cave',color:'#a9b789'},
  {id:'world:game-rpg-original',parentId:'world:game-rpg',title:'オリジナルRPGの工房',description:'自作RPGの世界や作品について、もっと深く。',genre:'game',theme:'fantasy',gate:'castle',color:'#c3a6cd'},
  {id:'world:music-instrument',parentId:'world:music',title:'楽器と演奏の家',description:'演奏する楽しさを持ち寄る、静かな家。',genre:'music',theme:'japan',gate:'house',color:'#b3a2d7'},
  {id:'world:anime-making',parentId:'world:anime',title:'アニメ制作の工房',description:'作画や演出をじっくり楽しむ。',genre:'anime',theme:'japan',gate:'house',color:'#d6a4be'},
  {id:'activity:gym',parentId:'public',title:'ジムルーム',description:'現実で運動中の分身。投稿の閲覧者とは別です。',theme:'future',gate:'house',color:'#8aaecb'},
  {id:'activity:study',parentId:'public',title:'学校',description:'現実で勉強中の分身が過ごす場所。',theme:'japan',gate:'house',color:'#89bbaa'},
  {id:'activity:social',parentId:'public',title:'居酒屋',description:'現実の交流を自己申告する場所。',theme:'japan',gate:'door',color:'#dfbc69'},
];
export const findPlace=(id:string,catalog:readonly Place[]=places)=>catalog.find(p=>p.id===id);
export const childrenOf=(id:string,catalog:readonly Place[]=places)=>catalog.filter(p=>p.parentId===id);
export function pathTo(id:string,catalog:readonly Place[]=places):Place[]{
  const result:Place[]=[],seen=new Set<string>();
  let p=findPlace(id,catalog);
  while(p&&!seen.has(p.id)){seen.add(p.id);result.unshift(p);p=p.parentId?findPlace(p.parentId,catalog):undefined;}
  return result;
}
export function postWorld(post:{genre:Genre;worldId?:string|null},catalog:readonly Place[]=places):string{return findPlace(post.worldId||'',catalog)?.genre===post.genre?post.worldId!:'world:'+post.genre;}
export function acceptsPost(worldId:string|null|undefined,genre:Genre,catalog:readonly Place[]=places){return !worldId||findPlace(worldId,catalog)?.genre===genre;}
export function canAddWorld(place:Place|undefined,userId:string){return !!place?.genre&&(!place.ownerId||place.ownerId===userId);}
// Two side entrances; the central building opens the complete destination guide.
export function gatePoints(id:string,catalog:readonly Place[]=places){
  const current=findPlace(id,catalog), children=childrenOf(id,catalog);
  const left=id==='public'?findPlace('world:discovery',catalog):children[0];
  const right=id==='public'?findPlace('world:art',catalog):findPlace(current?.parentId||'',catalog);
  return [left?{place:left,x:510,y:770}:null,right?{place:right,x:1490,y:770}:null].filter((p):p is {place:Place;x:number;y:number}=>!!p);
}
