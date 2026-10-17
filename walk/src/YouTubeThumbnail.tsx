import {useState} from 'react';
import {youtubeThumbnail} from '../shared/youtube';
export default function YouTubeThumbnail({videoId}:{videoId:string}){
  const src=youtubeThumbnail(videoId),[failed,setFailed]=useState('');
  return !src||failed===src?<span className="youtube-thumbnail-empty">サムネイルを読み込めませんでした</span>:<img src={src} alt="" loading="lazy" referrerPolicy="no-referrer" onError={()=>setFailed(src)}/>;
}
