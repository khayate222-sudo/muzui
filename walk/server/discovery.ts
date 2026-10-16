import type {FastifyInstance} from 'fastify';
import {z} from 'zod';
import type {Store} from './db';
import type {DiscoveryPick} from '../shared/discovery';
import {discoverableVideo} from '../shared/discovery';
import type {Post} from '../shared/model';

export function videoDiscovery(app:FastifyInstance,store:Store,posts:()=>Post[],changed:()=>void){
  const picks=(available=posts()):DiscoveryPick[]=>{
    const visible=new Set(available.filter(discoverableVideo).map(p=>p.id));
    return (store.sqlite.prepare('SELECT post_id AS postId,position FROM discovery_picks ORDER BY position,post_id').all() as DiscoveryPick[]).filter(p=>visible.has(p.postId));
  };
  app.put('/api/admin/discovery/:id',async(req,reply)=>{
    const {position}=z.object({position:z.number().int().min(1).max(100).nullable()}).strict().parse(req.body);
    const id=z.string().min(1).max(80).parse((req.params as {id:string}).id);
    const post=posts().find(p=>p.id===id);
    if(!post)return reply.code(404).send({error:'投稿が見つかりません'});
    if(position!==null&&!discoverableVideo(post))return reply.code(400).send({error:'サンプル以外の再生できる動画を選んでください'});
    if(position===null)store.sqlite.prepare('DELETE FROM discovery_picks WHERE post_id=?').run(id);
    else store.sqlite.prepare('INSERT INTO discovery_picks(post_id,position) VALUES (?,?) ON CONFLICT(post_id) DO UPDATE SET position=excluded.position').run(id,position);
    changed();return {ok:true};
  });
  return {picks};
}
