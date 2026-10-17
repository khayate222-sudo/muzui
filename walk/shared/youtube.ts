import {youtubeId} from './model';
export type YouTubePreview={videoId:string;url:string;title:string;authorName:string;authorUrl:string;thumbnailUrl:string;channelId:string|null;fetchedAt:number;source:'youtube-oembed'};
export const youtubeThumbnail=(id:string)=>/^[\w-]{11}$/.test(id)?'https://i.ytimg.com/vi/'+id+'/hqdefault.jpg':'';
export function postThumbnail(post:{type:string;externalUrl:string}){const id=post.type==='youtube'?youtubeId(post.externalUrl):null;return id?youtubeThumbnail(id):null;}
