export type DouyinPreview={videoId:string;url:string;title:string;width:number;height:number;playerUrl:string;checkedAt:number;source:'douyin-iframe-api'};
export function douyinPlayerUrl(id:string){return /^\d{6,25}$/.test(id)?'https://open.douyin.com/player/video?vid='+id+'&autoplay=0':'';}
