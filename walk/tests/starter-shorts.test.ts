import {it,expect} from 'vitest';
import {createApp} from '../server/app';
import {seed} from '../server/seed';
import {starterShorts,starterShort,isShortMedia} from '../shared/starter-shorts';
import {canSynchronize,discoverableVideo} from '../shared/discovery';
import type {Post} from '../shared/model';
it('publishes three drawing lessons and three animated stories as honest, synchronized originals',async()=>{
  const instance=await createApp({database:':memory:',adminKey:'short-film-testing-key'});
  try{const data=(await instance.app.inject({url:'/api/bootstrap'})).json();const films=(data.posts as Post[]).filter(p=>!!starterShort(p));expect(films).toHaveLength(6);expect(films.filter(p=>p.genre==='art')).toHaveLength(3);expect(films.filter(p=>p.genre==='discovery')).toHaveLength(3);expect(films.every(p=>canSynchronize(p)&&discoverableVideo(p)&&p.body.includes('実写や人の手描き作業を撮影したものではありません'))).toBe(true);for(const film of films){expect(canSynchronize({...film,origin:'external'})).toBe(false);expect(canSynchronize({...film,mediaUrl:'https://example.org/copied.mp4'})).toBe(false);expect(canSynchronize({...film,isSample:true})).toBe(false);}expect(isShortMedia('/films/walk-short-other.mp4')).toBe(false);expect(starterShorts.every(f=>f.question.length>0)).toBe(true);}finally{await instance.app.close();}
});
it('adds new shorts once without resetting old selections or restoring deleted short films',async()=>{
  const instance=await createApp({database:':memory:',adminKey:'short-film-testing-key'});
  try{
    const {sqlite}=instance.store;sqlite.prepare('DELETE FROM posts WHERE id LIKE ?').run('walk-short-%');sqlite.prepare('DELETE FROM seed_state WHERE id=3').run();sqlite.prepare('UPDATE discovery_picks SET position=99 WHERE post_id=?').run('walk-film-music');seed(instance.store);seed(instance.store);
    expect(sqlite.prepare('SELECT COUNT(*) AS n FROM posts WHERE id LIKE ?').get('walk-short-%')).toEqual({n:6});expect(sqlite.prepare('SELECT position FROM discovery_picks WHERE post_id=?').get('walk-film-music')).toEqual({position:99});
    sqlite.prepare('DELETE FROM posts WHERE id=?').run('walk-short-sketch-mug');seed(instance.store);expect(sqlite.prepare('SELECT id FROM posts WHERE id=?').get('walk-short-sketch-mug')).toBeUndefined();expect(sqlite.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
  }finally{await instance.app.close();}
});
