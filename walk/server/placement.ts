import type {Store} from './db';
import {areas,type Genre} from '../shared/model';

// The painted foreground compresses Y much more than X. Leave room for the
// visible 106×110 board. Only allocate new posts; never move existing work.
export function postPosition(store:Store,genre:Genre,worldId?:string|null){
  const area=areas.find(a=>a.id===genre)!;
  const occupied=store.sqlite.prepare("SELECT map_x AS x,map_y AS y FROM posts WHERE COALESCE(world_id,'world:' || genre)=?").all(worldId||'world:'+genre) as {x:number;y:number}[];
  const candidates=Array.from({length:48},(_,i)=>({mapX:100+(i%12)*160,mapY:140+Math.floor(i/12)*380}));
  const distance=(p:{mapX:number;mapY:number})=>(p.mapX-area.x)**2+(p.mapY-area.y)**2;
  const clearance=(p:{mapX:number;mapY:number})=>occupied.reduce((nearest,q)=>Math.min(nearest,Math.max(Math.abs(p.mapX-q.x)*1480/1920/118,Math.abs(p.mapY-q.y)*470/1290/116)),Infinity);
  candidates.sort((a,b)=>distance(a)-distance(b));
  const free=candidates.find(p=>clearance(p)>=1);
  if(free)return free;
  // Dense worlds use the largest remaining gap instead of repeating 12 slots.
  let best=candidates[0],score=-1;
  for(let x=80;x<=1920;x+=40)for(let y=100;y<=1320;y+=40){
    const p={mapX:x,mapY:y},gap=clearance(p);
    if(gap>score||gap===score&&distance(p)<distance(best)){best=p;score=gap;}
  }
  return best;
}
