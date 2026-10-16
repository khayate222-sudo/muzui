import type {PublicUser} from './community';
export type WatchLinkPreview={from:PublicUser;post:{id:string;title:string};expiresAt:number};
export function readWatchLink(hash:string){return /^#\/together\/([a-f0-9]{48})$/.exec(hash)?.[1]||null;}
export function watchLinkUrl(origin:string,token:string){
  if(!readWatchLink('#/together/'+token))throw new Error('招待リンクを確認してください');
  const url=new URL(origin);if(!['https:','http:'].includes(url.protocol)||url.username||url.password)throw new Error('共有先を確認してください');
  url.pathname='/';url.search='';url.hash='/together/'+token;return url.href;
}
