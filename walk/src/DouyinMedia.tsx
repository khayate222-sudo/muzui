import {useEffect,useRef,useState} from 'react';
import {Play,RefreshCw} from 'lucide-react';
import type {Post} from '../shared/model';
import {sourceInfo} from '../shared/community';
import {douyinPlayerUrl,type DouyinPreview} from '../shared/douyin';
import {api} from './api';

export default function DouyinMedia({post}:{post:Post}){
  const [preview,setPreview]=useState<DouyinPreview|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[playing,setPlaying]=useState(false);
  const mounted=useRef(true),request=useRef(0),pending=useRef(false);
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;request.current++;};},[]);
  async function load(){if(pending.current)return;pending.current=true;const generation=++request.current;setBusy(true);setError('');try{const result=await api<DouyinPreview>('/douyin/preview','POST',{url:post.externalUrl});if(!douyinPlayerUrl(result.videoId))throw new Error('抖音の再生情報を確認できませんでした。');if(mounted.current&&request.current===generation){setPreview(result);setPlaying(true);}}catch(e){if(mounted.current&&request.current===generation)setError((e as Error).message);}finally{pending.current=false;if(mounted.current&&request.current===generation)setBusy(false);}}
  return <section className="douyin-media" aria-label="抖音の公式プレーヤー"><div className="embed-placeholder short-video-link"><small>FROM ANOTHER LITTLE WORLD</small><h3>抖音で見つけた一本</h3><p>公式の再生情報を確認して、抖音のプレーヤーで開きます。操作すると抖音へ接続します。再生はプレーヤーの再生ボタンで始めます。</p>{sourceInfo(post.externalUrl)?.shortLink&&<p>共有短縮リンクです。確認できた動画IDだけを公式APIへ送ります。投稿者名は自動確認していません。</p>}<p>同期視聴にはまだ対応していません。WALKの人数は、この投稿カードを開いている人です。外部動画の再生人数ではありません。</p><p>ログイン・地域・広告・公開設定は、提供元の条件に従います。</p></div>{error&&<p className="source-link-notice" role="alert">{error} 下の元投稿リンクから開くこともできます。</p>}
    {preview&&playing?<><div className="douyin-player-stage" style={{aspectRatio:`${preview.width} / ${preview.height}`}}><iframe className="douyin-player" src={douyinPlayerUrl(preview.videoId)} title={preview.title+'（抖音公式）'} allow="fullscreen; encrypted-media; picture-in-picture" allowFullScreen referrerPolicy="strict-origin-when-cross-origin"/></div><p className="fineprint">抖音の再生情報を確認：{new Date(preview.checkedAt).toLocaleString('ja-JP')}。取得は実再生の保証ではありません。表示・再生できない場合は元投稿を開いてください。</p><button className="outline" onClick={()=>setPlaying(false)}>プレーヤーを閉じる</button></>:<button className="primary full" disabled={busy} onClick={()=>void load()}>{busy?<RefreshCw size={18}/>:<Play size={18}/>} {busy?'抖音に確認しています…':error?'再生情報を確認し直す':'公式プレーヤーを開く'}</button>}
  </section>;
}
