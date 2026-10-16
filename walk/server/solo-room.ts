import {randomUUID} from 'node:crypto';
import type {FastifyInstance} from 'fastify';
import {z} from 'zod';
import type {Room} from '../shared/community';
import type {Store} from './db';

type Context={app:FastifyInstance;store:Store;readRoom:(id:string)=>Room|null;eligible:(id:string)=>boolean;changed:(userId:string)=>void};
const fail=(statusCode:number,message:string):never=>{throw Object.assign(new Error(message),{statusCode});};

export function soloRoom(c:Context){
  const sql=c.store.sqlite;
  // A retry reuses an owned private room; it never creates a second room or duplicates a card.
  const prepare=sql.transaction((userId:string,postId:string,roomId?:string)=>{
    if(!c.eligible(postId))fail(404,'この動画は今は置けません。動画の棚から選び直してください。');
    const own=roomId?c.readRoom(roomId):null;
    if(roomId&&(!own||own.ownerId!==userId))fail(404,'自分の非公開の部屋を選んでください。');
    if(own?.isPublic)fail(409,'この部屋は公開されています。非公開の部屋を選んでください。');
    const existing=own||(()=>{const row=sql.prepare('SELECT id FROM rooms WHERE owner_id=? AND is_public=0 ORDER BY updated_at DESC,id LIMIT 1').get(userId) as {id:string}|undefined;return row?c.readRoom(row.id):null;})();
    if(existing&&existing.items.length>=40&&!existing.items.some(i=>i.postId===postId))fail(409,'この部屋の投稿は40件までです。別の非公開の部屋を選ぶか、配置を編集してください。');
    if(!existing&&(sql.prepare('SELECT COUNT(*) AS n FROM rooms WHERE owner_id=?').get(userId) as {n:number}).n>=5)fail(409,'ルームは5つまでです。ルーム一覧から自分の部屋を非公開にして、もう一度選んでください。');
    const id=existing?.id||randomUUID(),now=Date.now();
    if(!existing)sql.prepare('INSERT INTO rooms (id,owner_id,title,description,is_public,theme,layout,updated_at) VALUES (?,?,?,?,?,?,?,?)').run(id,userId,'わたしの窓辺','見つけた「好き」を、そっと並べる場所。',0,'studio',JSON.stringify({items:[],decorations:[{kind:'flower',x:760,y:1000},{kind:'bench',x:1300,y:1000}]}),now);
    const room=c.readRoom(id)!;
    if(!room.items.some(i=>i.postId===postId)){
      const n=room.items.length,point=n===0?{x:1000,y:700}:{x:440+(n%4)*370,y:300+Math.floor(n/4)*90};
      sql.prepare('UPDATE rooms SET layout=?,updated_at=?,revision=revision+1 WHERE id=?').run(JSON.stringify({items:[...room.items,{postId,...point}],decorations:room.decorations}),now,id);
    }
    sql.prepare('INSERT OR IGNORE INTO favorites(user_id,post_id,created_at) VALUES (?,?,?)').run(userId,postId,now);
    return c.readRoom(id)!;
  });
  c.app.post('/api/solo/room',{config:{rateLimit:{max:20,timeWindow:'1 minute'}}},async req=>{
    const p=z.object({postId:z.string().min(1).max(80),roomId:z.string().uuid().optional()}).strict().parse(req.body);
    const room=prepare(req.session!.userId,p.postId,p.roomId);c.changed(req.session!.userId);return room;
  });
}
