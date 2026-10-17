import type {Store} from './db';
import {posts} from './schema';
import {postPosition} from './placement';
import {curatedVideos,type CuratedVideo} from '../shared/curated-videos';
export function seedCuratedVideos(store:Store,videos:readonly CuratedVideo[]=curatedVideos){
  const {sqlite,db}=store;
  sqlite.transaction(()=>{
    for(const [i,video]of videos.entries()){
      if(sqlite.prepare('SELECT bvid FROM curated_video_seeds WHERE bvid=?').get(video.bvid))continue;
      sqlite.prepare('INSERT INTO curated_video_seeds(bvid) VALUES (?)').run(video.bvid);
      const id='walk-curated-'+video.bvid;
      const existing=sqlite.prepare('SELECT id FROM posts WHERE external_url=? AND is_sample=0').get(video.url);
      if(existing)continue;
      db.insert(posts).values({id,type:'external',origin:'external',provider:'bilibili',title:video.title,authorName:video.authorName,body:'Original title: '+video.sourceTitle+'\n\nWatch with the official bilibili player. WALK links to the original; video files are not copied. Playback availability is controlled by the provider.',genre:video.genre,externalUrl:video.url,mediaUrl:'',isSample:false,...postPosition(store,video.genre),createdAt:Date.now()}).onConflictDoNothing().run();
      // A library can grow beyond the 100 manually selected shelf positions.
      if(i+10<=100)sqlite.prepare('INSERT OR IGNORE INTO discovery_picks(post_id,position) VALUES (?,?)').run(id,i+10);
    }
    sqlite.prepare('INSERT OR IGNORE INTO seed_state(id) VALUES (4)').run();
  })();
}
