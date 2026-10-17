import {afterEach,beforeEach,expect,it} from 'vitest';
import {createApp} from '../server/app';
import {sourceInfo} from '../shared/community';
import {bilibiliPlayerUrl} from '../shared/bilibili';
import {curatedVideo,curatedVideos} from '../shared/curated-videos';
import {canSynchronize,discoverableVideo} from '../shared/discovery';
import {seed} from '../server/seed';
import type {Bootstrap} from '../shared/model';

const bvid='BV15ftU6NEya',url='https://www.bilibili.com/video/'+bvid;
let instance:Awaited<ReturnType<typeof createApp>>,cookie:string;
const req=(path:string,method:'GET'|'POST'|'PUT'|'DELETE'='GET',payload?:object)=>instance.app.inject({url:'/api'+path,method,headers:{cookie,'x-walk-client':'1'},payload});
beforeEach(async()=>{instance=await createApp({database:':memory:',adminKey:'bilibili-curation-unit-admin-key'});const r=await instance.app.inject({url:'/api/bootstrap'});cookie=String(r.headers['set-cookie']).split(';')[0];});
afterEach(async()=>{await instance.app.close();});

it('canonicalizes official BV video links and preserves the selected episode while rejecting deceptive sources',()=>{
  expect(sourceInfo(url+'/?tracking=one#info')).toEqual({provider:'bilibili',url,videoId:bvid,page:1});expect(sourceInfo('https://m.bilibili.com/video/'+bvid+'?p=2')).toMatchObject({url:url+'?p=2',page:2});expect(bilibiliPlayerUrl(bvid,2)).toBe('https://player.bilibili.com/player.html?bvid='+bvid+'&p=2&autoplay=0');
  for(const value of ['https://www.bilibili.com.evil.test/video/'+bvid,'https://name:secret@www.bilibili.com/video/'+bvid,'https://www.bilibili.com:8443/video/'+bvid,'https://www.bilibili.com/video/not-a-bv','https://space.bilibili.com/123','https://b23.tv/Test123',url+'?p=0',url+'?p=101',url+'?p=1&p=2',url+'?p=1.5'])expect(sourceInfo(value),value).toBeNull();expect(bilibiliPlayerUrl('javascript:alert(1)')).toBe('');
});
it('includes real curated videos with provenance and measured progress without fabricating saves or permitting synchronization',async()=>{
  const boot=(await req('/bootstrap')).json() as Bootstrap;
  expect(curatedVideos.length).toBeGreaterThanOrEqual(16);expect(new Set(curatedVideos.map(v=>v.bvid)).size).toBe(curatedVideos.length);
  for(const entry of curatedVideos){
    expect(entry.observedTo-entry.observedFrom).toBeGreaterThanOrEqual(4);expect(entry.duration).toBeGreaterThan(entry.observedTo);expect(entry.authorName.length).toBeGreaterThan(0);expect(sourceInfo(entry.url)?.videoId).toBe(entry.bvid);
    const p=boot.posts.find(p=>p.id==='walk-curated-'+entry.bvid)!;expect(p).toMatchObject({origin:'external',provider:'bilibili',authorName:entry.authorName,isSample:false,saves:0});expect(curatedVideo(p)?.bvid).toBe(entry.bvid);expect(discoverableVideo(p)).toBe(true);expect(canSynchronize(p)).toBe(false);
    expect(curatedVideo({...p,externalUrl:'https://www.bilibili.com/video/BV1o2J46sEqf'})).toBeUndefined();
  }
  expect(boot.favorites).toEqual([]);expect(boot.user.shareActivity).toBe(false);
});
it('adds the library once and preserves edits, favorites, publication choices and deleted videos on repeated seeding',async()=>{
  const entry=curatedVideos[0],id='walk-curated-'+entry.bvid,other='walk-curated-'+curatedVideos[1].bvid;
  await req('/favorites/'+id,'PUT',{saved:true});await req('/admin/login','POST',{key:'bilibili-curation-unit-admin-key'});await req('/admin/discovery/'+id,'PUT',{position:99});
  instance.store.sqlite.prepare('UPDATE posts SET title=? WHERE id=?').run('運営が編集した題名',id);await req('/admin/posts/'+other,'DELETE');seed(instance.store);seed(instance.store);
  const boot=(await req('/bootstrap')).json() as Bootstrap;expect(boot.posts.find(p=>p.id===id)?.title).toBe('運営が編集した題名');expect(boot.posts.some(p=>p.id===other)).toBe(false);expect(boot.favorites).toContain(id);expect(boot.discoveryPicks).toContainEqual({postId:id,position:99});
});
it('does not overwrite an existing user import when adding the curated library to an existing database',async()=>{
  const sql=instance.store.sqlite;sql.prepare('DELETE FROM posts WHERE id LIKE ?').run('walk-curated-%');sql.prepare('DELETE FROM seed_state WHERE id=4').run();
  const imported=await req('/imports','POST',{url,title:'利用者の紹介',authorName:'入力した元投稿者',genre:'game',worldId:'world:game-rpg'});expect(imported.statusCode).toBe(200);seed(instance.store);
  const boot=(await req('/bootstrap')).json() as Bootstrap;expect(boot.posts.filter(p=>p.externalUrl===url)).toHaveLength(1);expect(boot.posts.find(p=>p.id===imported.json().id)).toMatchObject({title:'利用者の紹介',authorName:'入力した元投稿者',worldId:'world:game-rpg'});expect(boot.favorites).toContain(imported.json().id);
});
it('deduplicates repeated canonical links without moving posts, but keeps a different episode distinct',async()=>{
  const r=await req('/imports','POST',{url,title:'上書きしない',authorName:'別の人',genre:'game'});expect(r.json()).toMatchObject({existing:true,id:'walk-curated-'+bvid});
  const second=await req('/imports','POST',{url:url+'?p=2',title:'別の回',authorName:'元の作者',genre:'art'});expect(second.json().existing).toBe(false);expect(second.json().id).not.toBe(r.json().id);
});
