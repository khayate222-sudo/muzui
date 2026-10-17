import {useState} from 'react';
import {Play} from 'lucide-react';
import type {Post} from '../shared/model';
import {sourceInfo} from '../shared/community';
import {bilibiliPlayerUrl} from '../shared/bilibili';
import {curatedVideo} from '../shared/curated-videos';

export default function BilibiliMedia({post}:{post:Post}){
  const [open,setOpen]=useState(false),source=sourceInfo(post.externalUrl),src=source?.provider==='bilibili'&&source.videoId?bilibiliPlayerUrl(source.videoId,source.page):'',picked=curatedVideo(post);
  return <section className="bilibili-media" aria-label="bilibiliの公式プレーヤー">{picked&&<small className="curated-check">再生確認：{new Date(picked.checkedAt).toLocaleDateString('ja-JP',{timeZone:'Asia/Tokyo'})}（開発環境・冒頭）。現在の再生を保証するものではありません。</small>}{open&&src?<><div className="bilibili-player-stage" style={picked?{aspectRatio:`${picked.width} / ${picked.height}`} :undefined}><iframe className="bilibili-player" src={src} title={post.title+'（bilibili公式）'} allow="autoplay; fullscreen; encrypted-media; picture-in-picture" allowFullScreen referrerPolicy="strict-origin-when-cross-origin"/></div><p className="fineprint">再生・画質・ログイン・広告などはbilibiliの条件に従います。再生できない場合は下の元投稿リンクを開いてください。</p><button className="outline" onClick={()=>setOpen(false)}>プレーヤーを閉じる</button></>:<div className="external-video-start"><span className="eyebrow">A LITTLE WORLD, ON FILM.</span><h3>ものづくりや日常を、<br/>海の向こうから。</h3><p>bilibiliの公式プレーヤーで開きます。操作すると提供元へ接続します。動画は自動再生せず、提供元の再生ボタンで始めます。</p><button className="primary full" disabled={!src} onClick={()=>setOpen(true)}><Play size={18}/>bilibili公式プレーヤーを開く</button><small>個別再生です。同期視聴には未対応。WALKの人数は投稿カードを開いている人で、外部の再生人数ではありません。</small></div>}</section>;
}
