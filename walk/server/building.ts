import type {FastifyInstance} from 'fastify';
import {createHash,randomUUID} from 'node:crypto';
import {z} from 'zod';
import type {Store} from './db';
import {buildingPiecesSchema,canonicalPieces,emptyBuilding,type Building,type BuildingSnapshot} from '../shared/building';
type Row={revision:number;pieces:string;last_request_id:string;last_hash:string;updated_at:number};
export function readBuilding(store:Store,roomId:string):Building{
 const row=store.sqlite.prepare('SELECT * FROM room_builds WHERE room_id=?').get(roomId) as Row|undefined;
 return row?{revision:row.revision,pieces:JSON.parse(row.pieces),updatedAt:row.updated_at}:emptyBuilding();
}
export function building({app,store,changed}:{app:FastifyInstance;store:Store;changed:()=>void}){
 const sql=store.sqlite,owned=(room:string,user:string)=>!!sql.prepare('SELECT id FROM rooms WHERE id=? AND owner_id=?').get(room,user);
 const rate={config:{rateLimit:{max:30,timeWindow:'1 minute'}}};
 app.get('/api/rooms/:id/build/history',async(req,reply)=>{
  const id=(req.params as {id:string}).id;if(!owned(id,req.session!.userId))return reply.code(403).send({error:'自分のルームだけ編集できます'});
  return sql.prepare('SELECT id,revision,created_at AS createdAt,json_array_length(pieces) AS pieceCount FROM room_build_history WHERE room_id=? ORDER BY revision DESC LIMIT 8').all(id) as BuildingSnapshot[];
 });
 const saveSchema=z.object({revision:z.number().int().min(0),requestId:z.string().uuid(),pieces:buildingPiecesSchema}).strict();
 function save(room:string,user:string,revision:number,requestId:string,pieces:Building['pieces'],operation='save'){
  return sql.transaction(()=>{
   if(!owned(room,user))return {status:403,error:'自分のルームだけ編集できます'};
   for(const color of ['sakura','midnight','copper'])if(pieces.some(p=>p.color===color)&&!sql.prepare('SELECT 1 FROM game_cosmetics WHERE user_id=? AND item_id=?').get(user,color))return {status:403,error:'この素材はコインのお店で入手してください'};
   const current=readBuilding(store,room),data=JSON.stringify(canonicalPieces(pieces)),hash=operation+':'+createHash('sha256').update(data).digest('hex');
   const row=sql.prepare('SELECT * FROM room_builds WHERE room_id=?').get(room) as Row|undefined;
   if(row?.last_request_id===requestId){if(row.last_hash!==hash)return {status:409,error:'同じ保存操作の内容が変わっています'};return {build:current};}
   if(current.revision!==revision)return {status:409,error:'別の画面で建築が更新されました。入力を保ったまま最新版を確認してください。'};
   if(data===JSON.stringify(canonicalPieces(current.pieces)))return {build:current};
   const now=Date.now();
   sql.prepare('INSERT INTO room_build_history VALUES (?,?,?,?,?)').run(randomUUID(),room,current.revision,JSON.stringify(current.pieces),now);
   sql.prepare('DELETE FROM room_build_history WHERE room_id=? AND id NOT IN (SELECT id FROM room_build_history WHERE room_id=? ORDER BY revision DESC LIMIT 8)').run(room,room);
   sql.prepare('INSERT INTO room_builds VALUES (?,?,?,?,?,?) ON CONFLICT(room_id) DO UPDATE SET revision=excluded.revision,pieces=excluded.pieces,last_request_id=excluded.last_request_id,last_hash=excluded.last_hash,updated_at=excluded.updated_at').run(room,revision+1,data,requestId,hash,now);
   sql.prepare('UPDATE rooms SET revision=revision+1,updated_at=? WHERE id=?').run(now,room);
   return {build:readBuilding(store,room)};
  }).immediate();
 }
 app.put('/api/rooms/:id/build',rate,async(req,reply)=>{
  const p=saveSchema.parse(req.body),r=save((req.params as {id:string}).id,req.session!.userId,p.revision,p.requestId,p.pieces);
  if(r.status!==undefined)return reply.code(r.status).send({error:r.error});changed();return r.build;
 });
 app.post('/api/rooms/:id/build/restore',rate,async(req,reply)=>{
  const id=(req.params as {id:string}).id,p=z.object({revision:z.number().int().min(0),requestId:z.string().uuid(),snapshotId:z.string().uuid()}).strict().parse(req.body);
  if(!owned(id,req.session!.userId))return reply.code(403).send({error:'自分のルームだけ編集できます'});
  const previous=sql.prepare('SELECT * FROM room_builds WHERE room_id=?').get(id) as Row|undefined;
  if(previous?.last_request_id===p.requestId){if(!previous.last_hash.startsWith('restore:'+p.snapshotId+':'))return reply.code(409).send({error:'同じ保存操作の内容が変わっています'});return readBuilding(store,id);}
  const snapshot=sql.prepare('SELECT pieces FROM room_build_history WHERE id=? AND room_id=?').get(p.snapshotId,id) as {pieces:string}|undefined;
  if(!snapshot)return reply.code(404).send({error:'建築の履歴が見つかりません'});
  const r=save(id,req.session!.userId,p.revision,p.requestId,buildingPiecesSchema.parse(JSON.parse(snapshot.pieces)),'restore:'+p.snapshotId);
  if(r.status!==undefined)return reply.code(r.status).send({error:r.error});changed();return r.build;
 });
}
