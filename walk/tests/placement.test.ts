import {expect,it} from 'vitest';
import {createApp} from '../server/app';
import {postPosition} from '../server/placement';
import {boardAt,toCourtyard} from '../src/world-layout';
import type {Genre} from '../shared/model';
import {curatedVideos} from '../shared/curated-videos';

it('new library boards leave visible and clickable space while allocation preserves existing posts and ignores other worlds',async()=>{
 const instance=await createApp({database:':memory:',adminKey:'placement-test-admin-key'});
 try{
  const posts=instance.store.sqlite.prepare('SELECT id,genre,is_sample AS sample,map_x AS mapX,map_y AS mapY,world_id AS worldId FROM posts').all() as {id:string;genre:Genre;sample:number;mapX:number;mapY:number;worldId:string|null}[];
  expect(posts.filter(p=>p.id.startsWith('walk-curated-'))).toHaveLength(curatedVideos.length);
  for(const p of posts.filter(p=>!p.sample))for(const other of posts.filter(q=>q.id!==p.id&&q.genre===p.genre&&q.worldId===p.worldId)){
   const a=toCourtyard({x:p.mapX,y:p.mapY}),b=toCourtyard({x:other.mapX,y:other.mapY});
   expect(Math.abs(a.x-b.x)>=106||Math.abs(a.y-b.y)>=110,p.id+' / '+other.id).toBe(true);
  }
  const before=JSON.stringify(posts),position=postPosition(instance.store,'art','user:empty');
  expect(position).toMatchObject({mapX:expect.any(Number),mapY:expect.any(Number)});
  expect(position).toEqual(postPosition(instance.store,'art','user:another-empty'));
  expect(JSON.stringify(instance.store.sqlite.prepare('SELECT id,genre,is_sample AS sample,map_x AS mapX,map_y AS mapY,world_id AS worldId FROM posts').all())).toBe(before);
 }finally{await instance.app.close();}
});
it('legacy overlapping boards choose the nearest visible center independently of insertion order',()=>{
 const posts=[{id:'first',mapX:600,mapY:600},{id:'last',mapX:610,mapY:685}],first=toCourtyard({x:600,y:600}),last=toCourtyard({x:610,y:685});
 for(const ordered of [posts,[...posts].reverse()]){
  expect(boardAt(ordered,{x:first.x,y:first.y-133})).toBe('first');
  expect(boardAt(ordered,{x:last.x,y:last.y-133})).toBe('last');
  expect(boardAt(ordered,{x:0,y:0})).toBeUndefined();
 }
});
