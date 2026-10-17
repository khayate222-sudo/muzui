import type {Store} from './db';
import {posts} from './schema';
import {postPosition} from './placement';
import {curatedVideos} from '../shared/curated-videos';
export function seedCuratedVideos(store:Store){
  const {sqlite,db}=store;
  if(sqlite.prepare('SELECT id FROM seed_state WHERE id=4').get())return;
  sqlite.transaction(()=>{
    for(const [i,video]of curatedVideos.entries()){
      const id='walk-curated-'+video.bvid;
      const existing=sqlite.prepare('SELECT id FROM posts WHERE external_url=? AND is_sample=0').get(video.url);
      if(existing)continue;
      db.insert(posts).values({id,type:'external',origin:'external',provider:'bilibili',title:video.title,authorName:video.authorName,body:'元の題名：'+video.sourceTitle+'\n\n日本語の題名はWALK編集部による紹介です。動画はbilibiliの公式プレーヤーで開き、ファイルを転載しません。再生条件は提供元に従います。',genre:video.genre,externalUrl:video.url,mediaUrl:'',isSample:false,...postPosition(store,video.genre),createdAt:Date.now()}).onConflictDoNothing().run();
      sqlite.prepare('INSERT OR IGNORE INTO discovery_picks(post_id,position) VALUES (?,?)').run(id,i+10);
    }
    sqlite.prepare('INSERT INTO seed_state(id) VALUES (4)').run();
  })();
}
