import {t} from './i18n';
import {useState,type RefObject} from 'react';
import { Link, Video } from 'lucide-react';
import { youtubeId, type Post } from './model';
import {starterShort,shortPoster} from '../shared/starter-shorts';
import {originalFilm} from '../shared/discovery';
import { sourceInfo,shortVideoSources } from '../shared/community';
import { serviceUrl } from './native';
import DouyinMedia from './DouyinMedia';
import BilibiliMedia from './BilibiliMedia';

// Layout changes keep this component and its video/iframe mounted.
export default function PostMedia({ post, video, autoPlay, canControl, publish, ended, report }: {
  post: Post;
  video: RefObject<HTMLVideoElement | null>;
  autoPlay: boolean;
  canControl: boolean;
  publish: () => void;
  ended?: () => void;
  report?: () => void;
}) {
  const [failed,setFailed]=useState<string|null>(null);
  if (post.type === 'video') return <><video ref={video} key={post.id} onError={()=>setFailed(post.id)} onLoadedData={()=>setFailed(null)} onPlay={publish} onPause={publish} onSeeked={publish} onEnded={()=>{publish();ended?.();}} onRateChange={publish} className="native-video" poster={starterShort(post)?shortPoster(starterShort(post)!.slug):originalFilm(post)?'/art/world-'+post.genre+'.webp':undefined} src={post.mediaUrl.startsWith('/media/') ? serviceUrl(post.mediaUrl) : post.mediaUrl} controls={canControl} playsInline autoPlay={autoPlay} preload="metadata" />{failed===post.id&&<div className="discovery-error" role="alert"><p>{t("動画を読み込めませんでした。接続を確認して、もう一度お試しください。")}</p><button className="outline" onClick={()=>{setFailed(null);video.current?.load();}}>{t("動画を読み直す")}</button></div>}</>;
  if (post.type === 'image') return <img className="detail-image" src={post.mediaUrl.startsWith('/media/') ? serviceUrl(post.mediaUrl) : post.mediaUrl} alt={post.title} />;
  if (post.type === 'youtube') return post.isSample
    ? <div className="embed-placeholder"><Video size={30}/><h3>{t("動画設定用サンプル")}</h3><p>{t("再生・埋め込み許可は未確認です。管理者が確認済み動画に差し替えると、公式プレーヤーを表示します。")}</p></div>
    : <iframe key={post.id} className="youtube-player" src={'https://www.youtube-nocookie.com/embed/' + youtubeId(post.externalUrl) + (autoPlay ? '?autoplay=1' : '')} title={post.title} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" />;
  if (post.type === 'external' && post.provider === 'TikTok' && sourceInfo(post.externalUrl)?.videoId) return <iframe key={post.id} className="tiktok-player" src={'https://www.tiktok.com/player/v1/' + sourceInfo(post.externalUrl)?.videoId + (autoPlay ? '?autoplay=1' : '')} title={post.title} allow="autoplay; fullscreen; encrypted-media" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" />;
  if(post.type==='external'&&post.provider==='抖音'&&sourceInfo(post.externalUrl)?.provider==='抖音')return <DouyinMedia key={post.id} post={post} report={report}/>;
  if(post.type==='external'&&post.provider==='bilibili'&&sourceInfo(post.externalUrl)?.provider==='bilibili')return <BilibiliMedia key={post.id} post={post} report={report}/>;
  if(post.type==='external'&&shortVideoSources.some(s=>s.provider===post.provider))return <div className="embed-placeholder short-video-link" aria-label={t("中国SNSの元投稿リンク")}><Link size={26}/><small>FROM ANOTHER LITTLE WORLD</small><h3>{post.provider}{t("で見つけた投稿")}</h3><p>{t("この投稿は元のSNSで開きます。WALK内の動画再生・同期にはまだ対応していません。")}</p>{sourceInfo(post.externalUrl)?.shortLink&&<p>{t("共有短縮リンクです。移動先の内容・投稿者は自動確認していません。")}</p>}<p>{t("WALKの人数は、この投稿カードを開いている人です。外部動画の再生人数ではありません。")}</p><p>{t("ログイン・アプリ・地域などの条件は、提供元に従います。")}</p></div>;
  if (post.type === 'external') return <div className="embed-placeholder"><Link size={26}/><h3>{post.provider || t("外部SNS")}{" "}{t("の投稿")}</h3><p>{t("元のサービスで投稿をご覧ください。ログインや公開設定により表示が制限される場合があります。")}</p></div>;
  return <div className="room-text-preview"><span>{t("ひと息ついて、読む時間。")}</span><p>{t("文章の投稿です。下へスクロールしてお読みください。")}</p></div>;
}
