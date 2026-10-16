import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { places, findPlace, pathTo, canAddWorld, worldCreateSchema, worldDraftSchema, type Place, type Landscape } from '../shared/worlds';
import type { Store } from './db';

type Row = {id:string;parent_id:string;owner_id:string;title:string;description:string;landscape:Landscape;revision:number};
export function residentWorlds({app,store:{sqlite},changed}:{app:FastifyInstance;store:Store;changed:()=>void}) {
  // A catalog belongs to one database instance. Client-supplied parent, genre,
  // ownership and geometry never become authoritative lookup data.
  function catalog():Place[] {
    const result=[...places];
    const rows=sqlite.prepare('SELECT w.* FROM user_worlds w WHERE NOT EXISTS (SELECT 1 FROM user_moderation m WHERE m.user_id=w.owner_id) ORDER BY w.created_at,w.id').all() as Row[];
    const pending=[...rows];
    for(let pass=0;pending.length&&pass<8;pass++) for(let i=0;i<pending.length;) {
      const r=pending[i],parent=findPlace(r.parent_id,result);
      if(!parent?.genre){i++;continue;}
      const theme:Place['theme']=r.landscape==='japan'?'japan':r.landscape==='future'?'future':r.landscape==='fantasy'?'fantasy':'garden';
      result.push({id:r.id,parentId:r.parent_id,ownerId:r.owner_id,title:r.title,description:r.description,landscape:r.landscape,revision:r.revision,genre:parent.genre,theme,gate:'house',color:parent.color});
      pending.splice(i,1);
    }
    return result;
  }
  app.get('/api/worlds',async()=>catalog());
  app.post('/api/worlds',{config:{rateLimit:{max:6,timeWindow:'1 minute'}}},async(req,reply)=>{
    const p=worldCreateSchema.parse(req.body),owner=req.session!.userId,all=catalog(),parent=findPlace(p.parentId,all);
    if(process.env.WALK_PUBLIC_RELEASE==='true'&&!sqlite.prepare('SELECT user_id FROM accounts WHERE user_id=?').get(owner))return reply.code(403).send({error:'世界を作るには、無料のアカウント登録が必要です'});
    if(!canAddWorld(parent,owner))return reply.code(403).send({error:'趣味の入口、または自分で作った世界の先に追加できます'});
    if(pathTo(p.parentId,all).length>=8)return reply.code(409).send({error:'世界は駅を含めて8階層まで作れます'});
    if((sqlite.prepare('SELECT COUNT(*) AS n FROM user_worlds WHERE owner_id=?').get(owner) as {n:number}).n>=30)return reply.code(409).send({error:'作れる世界は1人30個までです'});
    const id='resident:'+randomUUID();
    sqlite.prepare('INSERT INTO user_worlds (id,parent_id,owner_id,title,description,landscape,created_at) VALUES (?,?,?,?,?,?,?)').run(id,parent!.id,owner,p.title,p.description,p.landscape,Date.now());
    changed();return findPlace(id,catalog());
  });
  const updateSchema=worldDraftSchema.extend({revision:z.number().int().positive()});
  app.put('/api/worlds/:id',async(req,reply)=>{
    const p=updateSchema.parse(req.body),id=(req.params as {id:string}).id;
    const row=sqlite.prepare('SELECT * FROM user_worlds WHERE id=?').get(id) as Row|undefined;
    if(!row||row.owner_id!==req.session!.userId&&!req.session!.isAdmin)return reply.code(403).send({error:'世界を編集できるのは作成者と管理者です'});
    if(!findPlace(id,catalog()))return reply.code(404).send({error:'利用停止中の世界は、作成者の利用再開後に編集できます'});
    const r=sqlite.prepare('UPDATE user_worlds SET title=?,description=?,landscape=?,revision=revision+1 WHERE id=? AND revision=?').run(p.title,p.description,p.landscape,id,p.revision);
    if(!r.changes)return reply.code(409).send({error:'別の画面で更新されています。行き先を開き直してください'});
    changed();return findPlace(id,catalog());
  });
  app.delete('/api/worlds/:id',async(req,reply)=>{
    const {revision}=z.object({revision:z.number().int().positive()}).strict().parse(req.body),id=(req.params as {id:string}).id;
    const row=sqlite.prepare('SELECT * FROM user_worlds WHERE id=?').get(id) as Row|undefined;
    if(!row||row.owner_id!==req.session!.userId&&!req.session!.isAdmin)return reply.code(403).send({error:'世界を片づけられるのは作成者と管理者です'});
    if(row.revision!==revision)return reply.code(409).send({error:'世界が更新されています。開き直してください'});
    if(sqlite.prepare('SELECT id FROM user_worlds WHERE parent_id=?').get(id)||sqlite.prepare('SELECT id FROM posts WHERE world_id=?').get(id))return reply.code(409).send({error:'投稿や奥の世界がある間は削除できません'});
    sqlite.prepare('DELETE FROM user_worlds WHERE id=?').run(id);changed();return {ok:true};
  });
  return {catalog};
}
