import {useCallback,useEffect,useRef,useState,type ReactNode,type RefObject} from 'react';
import {Play,RefreshCw} from 'lucide-react';
import {t} from './i18n';
import type {Post} from './model';
import {starterShort,shortPoster} from '../shared/starter-shorts';
import {originalFilm} from '../shared/discovery';
import {serviceUrl} from './native';
import './playback.css';

export default function NativeVideoMedia({post,video,autoPlay,canControl,publish,ended,report,alternatives}:{
  post:Post;video:RefObject<HTMLVideoElement|null>;autoPlay:boolean;canControl:boolean;
  publish:()=>void;ended?:()=>void;report?:()=>void;alternatives?:ReactNode;
}){
  const [phase,setPhase]=useState<'loading'|'ready'|'buffering'|'slow'|'failed'>('loading'),[blocked,setBlocked]=useState(false);
  const live=useRef(true),attempt=useRef(0),controls=useRef(canControl);
  controls.current=canControl;
  const play=useCallback(async()=>{
    const el=video.current;if(!el||!controls.current)return;
    const version=++attempt.current;
    try{await el.play();if(live.current&&attempt.current===version)setBlocked(false);}
    catch(e){
      if(!live.current||attempt.current!==version)return;
      const name=(e as Error).name;
      if(name==='NotAllowedError'){setBlocked(true);setPhase('ready');}
      else if(name!=='AbortError'){setBlocked(false);setPhase('failed');}
    }
  },[video]);
  useEffect(()=>{
    live.current=true;if(autoPlay&&controls.current)void play();
    return()=>{live.current=false;attempt.current++;};
  },[autoPlay,play]);
  useEffect(()=>{
    if(phase!=='loading'&&phase!=='buffering')return;
    const timer=setTimeout(()=>setPhase('slow'),12000);
    return()=>clearTimeout(timer);
  },[phase]);
  function retry(){
    setBlocked(false);setPhase('loading');video.current?.load();
    if(autoPlay&&canControl)void play();
  }
  const issue=phase==='failed'||phase==='slow',waiting=phase==='loading'||phase==='buffering';
  return <div className="native-media" data-playback-state={blocked?'blocked':phase}>
    <video ref={video} className="native-video" poster={starterShort(post)?shortPoster(starterShort(post)!.slug):originalFilm(post)?'/art/world-'+post.genre+'.webp':undefined}
      src={post.mediaUrl.startsWith('/media/')?serviceUrl(post.mediaUrl):post.mediaUrl} controls={canControl} playsInline preload="metadata"
      onError={()=>{setBlocked(false);setPhase('failed');}}
      onLoadedMetadata={()=>setPhase(p=>p==='loading'?'ready':p)}
      onLoadedData={()=>setPhase('ready')} onCanPlay={()=>setPhase('ready')}
      onWaiting={()=>{if(!blocked)setPhase('buffering');}}
      onStalled={()=>{if(!video.current?.paused)setPhase('buffering');}}
      onPlaying={()=>{setBlocked(false);setPhase('ready');}}
      onPlay={()=>{setBlocked(false);publish();}} onPause={()=>{setPhase(p=>p==='buffering'?'ready':p);publish();}}
      onSeeked={publish} onEnded={()=>{publish();ended?.();}} onRateChange={publish}/>
    {(waiting||issue||blocked)&&<section className={'playback-status '+(issue?'has-issue':'')} role={phase==='failed'?'alert':'status'}>
      <p>{blocked?t('端末の設定で自動再生が止まっています。タップして始められます。'):phase==='failed'?t('動画を読み込めませんでした。接続を確認して、もう一度お試しください。'):phase==='slow'?t('動画の読み込みに時間がかかっています。待つか、別の一本を選べます。'):phase==='buffering'?t('続きを読み込んでいます…'):t('動画を準備しています…')}</p>
      {blocked&&canControl&&<button className="primary" onClick={()=>void play()}><Play size={17}/>{t('タップして再生')}</button>}
      {issue&&<><div className="playback-actions"><button className="outline" onClick={retry}><RefreshCw size={17}/>{t('動画を読み直す')}</button>{report&&<button className="outline" onClick={report}>{t('再生の問題を知らせる')}</button>}</div><small>{t('読み直すと再生位置が最初に戻ります。')}</small>{alternatives}</>}
    </section>}
  </div>;
}
