import type { Genre } from './model';
export type Place = { id:string; parentId:string|null; title:string; description:string; genre?:Genre; theme:'station'|'garden'|'future'|'fantasy'|'japan'; gate:'door'|'cave'|'house'|'castle'; color:string };
export const places:Place[]=[
  {id:'public',parentId:null,title:'不思議な駅',description:'行き先は、あなたの「好き」。入口を通って奥の世界へ。',theme:'station',gate:'door',color:'#e5b36d'},
  ...([
    ['discovery','発見の広場','garden','#e5b36d','house'],['music','音楽の世界','japan','#b3a2d7','door'],['video','動画の世界','future','#e7a18b','door'],['art','アートの世界','garden','#89bbaa','house'],['meme','ミームの世界','garden','#dfbc69','cave'],['game','ゲームの世界','future','#8aaecb','castle'],['anime','アニメの世界','japan','#d6a4be','door'],
  ] as const).map(([genre,title,theme,color,gate])=>({id:'world:'+genre,parentId:'public',title,description:'好きな投稿を開いて、同じ趣味の人に出会おう。',genre,theme,color,gate})),
  {id:'world:game-rpg',parentId:'world:game',title:'RPGの世界',description:'冒険の物語、育成、探索。少人数でもゆっくり語れる場所。',genre:'game',theme:'fantasy',gate:'cave',color:'#a9b789'},
  {id:'world:game-rpg-original',parentId:'world:game-rpg',title:'オリジナルRPGの工房',description:'自作RPGの世界や作品について、もっと深く。',genre:'game',theme:'fantasy',gate:'castle',color:'#c3a6cd'},
  {id:'world:music-instrument',parentId:'world:music',title:'楽器と演奏の家',description:'演奏する楽しさを持ち寄る、静かな家。',genre:'music',theme:'japan',gate:'house',color:'#b3a2d7'},
  {id:'world:anime-making',parentId:'world:anime',title:'アニメ制作の工房',description:'作画や演出をじっくり楽しむ。',genre:'anime',theme:'japan',gate:'house',color:'#d6a4be'},
  {id:'activity:gym',parentId:'public',title:'ジムルーム',description:'現実で運動中の分身。投稿の閲覧者とは別です。',theme:'future',gate:'house',color:'#8aaecb'},
  {id:'activity:study',parentId:'public',title:'学校',description:'現実で勉強中の分身が過ごす場所。',theme:'japan',gate:'house',color:'#89bbaa'},
  {id:'activity:social',parentId:'public',title:'居酒屋',description:'現実の交流を自己申告する場所。',theme:'japan',gate:'door',color:'#dfbc69'},
];
export const findPlace=(id:string)=>places.find(p=>p.id===id);
export const childrenOf=(id:string)=>places.filter(p=>p.parentId===id);
export function pathTo(id:string):Place[]{const p=findPlace(id);return p?[...(p.parentId?pathTo(p.parentId):[]),p]:[];}
export function postWorld(post:{genre:Genre;worldId?:string|null}):string{return findPlace(post.worldId||'')?.genre===post.genre?post.worldId!:'world:'+post.genre;}
export function acceptsPost(worldId:string|null|undefined,genre:Genre){return !worldId||findPlace(worldId)?.genre===genre;}
export function gatePoints(id:string){const destinations=[...childrenOf(id),...(findPlace(id)?.parentId?[findPlace(findPlace(id)!.parentId!)!]:[])];return destinations.map((place,i)=>({place,x:350+(i%4)*430,y:280+Math.floor(i/4)*250}));}
