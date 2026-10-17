import { count } from 'drizzle-orm';
import type { Store } from './db.js';
import { posts } from './schema.js';
import { areas, type PostInput } from '../shared/model.js';
import {originalFilms} from '../shared/discovery.js';
import {starterShorts} from '../shared/starter-shorts.js';
import {postPosition} from './placement.js';
import {seedCuratedVideos} from './curated-videos.js';
export function seed(store:Store){
  seedSamples(store);
  seedLandscapes(store);
  seedCuratedVideos(store);
  const {sqlite,db}=store;
  if(sqlite.prepare('SELECT id FROM seed_state WHERE id=3').get())return;
  sqlite.transaction(()=>{
    const now=Date.now();
    for(const [i,film]of starterShorts.entries()){
      const id='walk-short-'+film.slug;
      db.insert(posts).values({id,type:'video',title:film.title,body:film.description+'\n\n見終わったら：'+film.question+'\n\nWALK制作のオリジナル描画アニメーションです。実写や人の手描き作業を撮影したものではありません。映像・合成音はこのアプリのために制作し、第三者の映像や楽曲は取り込んでいません。物語はフィクションです。',authorName:'WALK STUDIO',genre:film.genre,mediaUrl:'/films/walk-short-'+film.slug+'.mp4',provider:'WALK SHORTS · 描画アニメーション',origin:'editorial',isSample:false,...postPosition(store,film.genre),createdAt:now}).onConflictDoNothing().run();
      sqlite.prepare('INSERT OR IGNORE INTO discovery_picks(post_id,position) VALUES (?,?)').run(id,i+1);
    }
    sqlite.prepare('INSERT INTO seed_state(id) VALUES (3)').run();
  })();
}
function seedLandscapes(store:Store){
  const {sqlite,db}=store;
  if(sqlite.prepare('SELECT id FROM seed_state WHERE id=2').get())return;
  sqlite.transaction(()=>{
    for(const [i,film] of originalFilms.entries()){
      const id='walk-film-'+film.genre;
      db.insert(posts).values({id,type:'video',title:film.title,body:'WALKのために制作した風景イラストを、ゆっくり眺める12秒のオリジナル映像にしました。音声はありません。実写やアニメ作品の映像ではありません。気になった世界を歩いたり、友達を誘って同じ瞬間を眺めたりしてみてください。',authorName:'WALK STUDIO',genre:film.genre,mediaUrl:'/films/walk-'+film.genre+'.mp4',provider:'WALK ORIGINAL · 風景映像',origin:'editorial',isSample:false,...postPosition(store,film.genre),createdAt:Date.UTC(2026,9,16)}).onConflictDoNothing().run();
      sqlite.prepare('INSERT OR IGNORE INTO discovery_picks(post_id,position) VALUES (?,?)').run(id,i+1);
    }
    sqlite.prepare('INSERT INTO seed_state(id) VALUES (2)').run();
  })();
}
function seedSamples({ db, sqlite }: Store) {
  if (sqlite.prepare('SELECT id FROM seed_state WHERE id=1').get()) return;
  if (db.select({ n: count() }).from(posts).get()!.n) {sqlite.prepare('INSERT OR IGNORE INTO seed_state VALUES (1)').run();return;}
  const text = [
    ['ちょっと遠回りして、帰ろう。', 'いつもの帰り道を一本だけ変えてみた。小さな花屋さんと、いい匂いのパン屋さんを発見。偶然って、案外すぐそこにある。'],
    ['ここでは、寄り道が正解。', 'WALKへようこそ。気になるカードに近づいて開いてみよう。同じ投稿を開いている人がいたら、小さな「好き」をきっかけに。'],
    ['今日見つけた、小さないいこと。', 'コーヒーを淹れる音。窓から入る風。知らない誰かの優しさ。あなたの「今日のよかったこと」は何ですか？'],
    ['雨の日のプレイリスト', '窓に当たる雨粒が、今日はドラムみたいに聴こえる。ジャズとアンビエントを交互にかける午後。'],
    ['レコードの、針を落とす瞬間。', 'パチッという小さな音のあと、部屋の空気が変わる。音楽を聴くためだけに座る時間が好き。'],
    ['まだ名前のないバンドへ', '小さなライブハウス、20人のお客さん、忘れられない一曲。大きなステージだけが音楽じゃない。'],
    ['映画のエンドロールが好き', '物語が終わったあとも、少しだけその世界にいられる時間。最後の一行まで観てしまいます。'],
    ['15秒で残す、いつもの街', '短い映像にすると、毎日見ている景色も少し特別になる。今日は駅までの道を撮ってみよう。'],
    ['今夜は、短編映画を一本。', '長い一日には短い物語を。観終わったあと、誰かと感想を話したくなる作品に出会いたい。'],
    ['光を集める散歩', '午後4時の、影が長くなる頃。建物と木の間を抜ける光だけを探して歩いています。'],
    ['色に、名前をつけてみる。', '朝のパンの色、旅先の海の色、使い込んだノートの色。名前にできない色を描いてみた。'],
    ['下手でも、描いていい。', '今日のスケッチは、少し曲がったマグカップ。うまく描くより、ちゃんと見ることから始めよう。'],
    ['猫にキーボードを取られた日', '作業を始めようとした瞬間、猫が着席。締切を説明したら、あくびで返事がきました。'],
    ['週末まであと何コーヒー？', '月曜の自分へ。大丈夫、金曜の自分も同じことを考えています。ひとまず一杯どうぞ。'],
    ['脳内タブが多すぎる', 'やりたいことが多すぎて、何をしようとしたか忘れた。まずは散歩して、タブを少し閉じよう。'],
  ];
  const now = Date.now();
  const entries: (PostInput & { id: string; createdAt: number;origin:'sample' })[] = [];
  areas.slice(0,5).forEach((a, ai) => {
    for (let j=0; j<3; j++) {
      const item = text[ai*3+j];
      entries.push({ id: `text-${ai}-${j}`, type: 'text', title: item[0], body: item[1], authorName: ['WALK EDITORIAL', 'よりみちノート', '日々のかけら'][j], genre: a.id, mediaUrl: '', externalUrl: '', provider: 'WALK ORIGINAL', mapX: a.x + [-175, 0, 175][j], mapY: a.y + [-65, 120, -65][j], isSample: true, origin:'sample' as const, createdAt: now-(ai*3+j)*3600000 });
    }
    entries.push({ id: `image-${ai}`, type: 'image', title: ['The art of slowing down', '音のある風景', 'A little frame of life', 'Somewhere, in green.', 'なんでもない日の、冒険。'][ai], body: 'WALKのために制作したオリジナルイラスト。少し立ち止まって、色と余白を楽しんでください。', mediaUrl: `/art/scene-${ai}.svg`, externalUrl: '', provider: 'WALK STUDIO', authorName: 'WALK STUDIO', genre: a.id, mapX: a.x-100, mapY: a.y-235, isSample: true, origin:'sample' as const, createdAt: now-ai*7200000 });
    entries.push({ id: `youtube-${ai}`, type: 'youtube', title: ['街を歩く、音を探す', 'A soundtrack for your walk', '小さな映像館', 'アトリエを訪ねて', 'ひと休みの動画'][ai], body: 'YouTube設定用サンプルです。動画の権利・公開状態・埋め込み許可を確認し、管理画面から差し替えてください。外部再生は未確認のため、このサンプルでは埋め込みません。', mediaUrl: '', externalUrl: 'https://www.youtube.com/watch?v=aqz-KE-bpKQ', provider: 'YouTube · 設定用サンプル', authorName: 'WALK CURATION', genre: a.id, mapX: a.x+130, mapY: a.y+240, isSample: true, origin:'sample' as const, createdAt: now-ai*10800000 });
  });
  db.transaction(tx=>{tx.insert(posts).values(entries).run();sqlite.prepare('INSERT OR IGNORE INTO seed_state VALUES (1)').run();});
}
