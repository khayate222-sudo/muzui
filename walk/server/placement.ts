import type {Store} from './db';
import {areas,genres} from '../shared/model';
export function postPosition(store:Store,genre:typeof genres[number]){const a=areas.find(a=>a.id===genre)!;const n=(store.sqlite.prepare('SELECT COUNT(*) AS n FROM posts WHERE genre=?').get(genre) as {n:number}).n;return {mapX:a.x-200+(n%4)*135,mapY:Math.max(100,Math.min(1320,a.y-100+(Math.floor(n/4)%3)*85))};}
