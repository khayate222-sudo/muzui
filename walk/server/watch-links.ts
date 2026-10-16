import {createHash,randomBytes} from 'node:crypto';
import type {FastifyInstance} from 'fastify';
import {z} from 'zod';
import type {PublicUser} from '../shared/community';
import type {WatchLinkPreview} from '../shared/watch-links';
type Context={app:FastifyInstance;hosting:(id:string)=>{id:string;postId:string}|null;person:(id:string)=>PublicUser|null;post:(id:string)=>{id:string;title:string}|undefined;blocked:(a:string,b:string)=>boolean};
type Link={hostId:string;groupId:string;postId:string;expiresAt:number};
export function watchLinks(c:Context){
  const links=new Map<string,Link>(),hash=(token:string)=>createHash('sha256').update(token).digest('hex');
  function valid(link:Link){const group=c.hosting(link.hostId);return link.expiresAt>Date.now()&&group?.id===link.groupId&&group.postId===link.postId&&!!c.post(link.postId);}
  function clean(){for(const [key,link] of links)if(!valid(link))links.delete(key);}
  const timer=setInterval(clean,30000);timer.unref();
  const tokenOf=(params:unknown)=>z.object({token:z.string().regex(/^[a-f0-9]{48}$/)}).parse(params).token;
  c.app.post('/api/watch-links',{config:{rateLimit:{max:6,timeWindow:'1 minute'}}},async(req,reply)=>{
    z.object({consent:z.literal(true)}).strict().parse(req.body);
    clean();const hostId=req.session!.userId,group=c.hosting(hostId);
    if(!group)return reply.code(409).send({error:'動画の同期視聴を始めてから招待リンクを作ってください'});
    if(links.size>=1000)return reply.code(429).send({error:'いまは新しい招待リンクを作れません'});
    // One active link per host; replacing a link revokes the old URL.
    for(const [key,link]of links)if(link.hostId===hostId)links.delete(key);
    const token=randomBytes(24).toString('hex'),expiresAt=Date.now()+15*60000;
    links.set(hash(token),{hostId,groupId:group.id,postId:group.postId,expiresAt});return {token,expiresAt};
  });
  c.app.get('/api/watch-links/:token',{logLevel:'silent',config:{rateLimit:{max:60,timeWindow:'1 minute'}}},async(req,reply)=>{
    const token=tokenOf(req.params),key=hash(token);let link=links.get(key);if(link&&!valid(link)){links.delete(key);link=undefined;}const me=req.session!.userId;
    const from=link&&c.person(link.hostId),post=link&&c.post(link.postId);
    if(!link||!from||!post||c.blocked(me,link.hostId))return reply.code(404).send({error:'この招待は使えません。期限切れ・取消・ホストの退出などの可能性があります。'});
    return {from,post:{id:post.id,title:post.title},expiresAt:link.expiresAt} satisfies WatchLinkPreview;
  });
  c.app.delete('/api/watch-links/:token',{logLevel:'silent'},async(req,reply)=>{
    const token=tokenOf(req.params),key=hash(token),link=links.get(key);
    if(!link||link.hostId!==req.session!.userId)return reply.code(404).send({error:'招待が見つかりません'});
    links.delete(key);return {ok:true};
  });
  return {close:()=>{clearInterval(timer);links.clear();}};
}
