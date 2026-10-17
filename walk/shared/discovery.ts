import {genres, safeExternal, youtubeId, type Genre, type Post} from './model';
import {sourceInfo} from './community';
import {starterShort} from './starter-shorts';

export const originalFilms = [
  {genre:'discovery',title:'時計台を抜けて、寄り道へ。'},
  {genre:'music',title:'音が生まれる前の、静かな通り。'},
  {genre:'video',title:'小さな映写室の、午後。'},
  {genre:'art',title:'描きかけのまま、ひと休み。'},
  {genre:'meme',title:'なんでもない日の、おもちゃ箱。'},
  {genre:'game',title:'まだ見ぬ冒険の、待ち合わせ。'},
  {genre:'anime',title:'物語が始まる、桜の庭。'},
] as const;
export type DiscoveryPick = {postId:string;position:number};
export const originalFilm = (post:Pick<Post,'id'|'mediaUrl'|'origin'|'type'|'isSample'>) =>
  post.origin==='editorial' && !post.isSample && post.type==='video'
    ? originalFilms.find(f=>post.id==='walk-film-'+f.genre && post.mediaUrl==='/films/walk-'+f.genre+'.mp4') : undefined;
export function canSynchronize(post:Pick<Post,'id'|'mediaUrl'|'origin'|'type'|'isSample'>){
  return !post.isSample&&post.type==='video'&&(post.origin==='walk'&&/^\/media\/[a-f0-9-]{36}\.(mp4|webm)$/.test(post.mediaUrl)||!!originalFilm(post)||!!starterShort(post));
}
// Eligibility means a real player can be offered; external availability can still change.
export function discoverableVideo(post:Pick<Post,'id'|'origin'|'type'|'isSample'|'mediaUrl'|'externalUrl'|'provider'>){
  if(post.isSample)return false;
  if(post.type==='video')return /^\/media\/[a-f0-9-]{36}\.(mp4|webm)$/.test(post.mediaUrl)||!!originalFilm(post)||!!starterShort(post)||safeExternal(post.mediaUrl);
  if(post.type==='youtube')return !!youtubeId(post.externalUrl);
  const source=sourceInfo(post.externalUrl);
  return post.type==='external'&&((post.provider==='TikTok'&&source?.provider==='TikTok')||(post.provider==='抖音'&&source?.provider==='抖音'))&&!!source?.videoId;
}
export function discoveryVideos(posts:Post[],picks:DiscoveryPick[],interests:Genre[],favorites:string[]){
  const selected=new Set(interests),saved=new Set(favorites),positions=new Map(picks.map(p=>[p.postId,p.position]));
  return posts.filter(discoverableVideo).map(post=>({post,position:positions.get(post.id),interest:selected.has(post.genre),saved:saved.has(post.id)})).sort((a,b)=>
    Number(b.interest)-Number(a.interest)||Number(b.position!==undefined)-Number(a.position!==undefined)||
    Number(!!originalFilm(a.post))-Number(!!originalFilm(b.post))||(a.position??999)-(b.position??999)||
    b.post.createdAt-a.post.createdAt||a.post.id.localeCompare(b.post.id)
  ).map(({post,position,interest,saved})=>({post,reason:interest?'選んだ「好き」から':position!==undefined?'WALKが選んだ一本':saved?'保存した動画':'新しく届いた動画'}));
}
export function readInterests(value:string|null):Genre[]{
  try{const v:unknown=JSON.parse(value||'[]');return Array.isArray(v)?genres.filter(g=>v.includes(g)):[];}catch{return [];}
}
