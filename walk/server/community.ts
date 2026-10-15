import type { FastifyInstance } from 'fastify';
import type { Server, Socket } from 'socket.io';
import type { Store } from './db';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import * as t from './schema';
import { postPosition } from './placement';
import { genres } from '../shared/model';
import { roomSchema, sourceInfo, type Room, type Party, type PartyState, type PublicUser } from '../shared/community';

type Context={app:FastifyInstance;io:Server;store:Store;blocked:(a:string,b:string)=>boolean;connected:(a:string,b:string)=>boolean;notify:(id:string,event?:string)=>void;broadcast:()=>void;exitRoom:(id:string)=>void};
type RoomRow={id:string;owner_id:string;title:string;description:string;is_public:number;theme:Room['theme'];layout:string;updated_at:number;ownerName:string;revision:number};
export function community(c:Context){
  const {app,io,store:{sqlite,db},blocked,connected,notify}=c;
  const person=(id:string):PublicUser=>{const u=db.select().from(t.users).where(eq(t.users.id,id)).get()!;return {id:u.id,displayName:u.displayName,color:u.color,style:u.style};};
  const readRoom=(id:string):Room|null=>{
    const r=sqlite.prepare('SELECT r.*, u.display_name AS ownerName FROM rooms r JOIN users u ON r.owner_id=u.id WHERE r.id=?').get(id) as RoomRow|undefined;
    return r?{id:r.id,ownerId:r.owner_id,ownerName:r.ownerName,title:r.title,description:r.description,isPublic:!!r.is_public,theme:r.theme,updatedAt:r.updated_at,revision:r.revision,...JSON.parse(r.layout),items:(JSON.parse(r.layout).items as Room['items']).filter(i=>!!db.select({id:t.posts.id}).from(t.posts).where(eq(t.posts.id,i.postId)).get())}:null;
  };
  const accessible=(r:Room|null,id:string):r is Room=>!!r&&(r.ownerId===id||r.isPublic)&&!blocked(r.ownerId,id);
  app.get('/api/rooms',async req=>{
    const id=req.session!.userId;
    return (sqlite.prepare('SELECT id FROM rooms WHERE is_public=1 OR owner_id=? ORDER BY (owner_id=?) DESC,updated_at DESC LIMIT 100').all(id,id) as {id:string}[]).map(r=>readRoom(r.id)).filter(r=>accessible(r,id));
  });
  app.get('/api/rooms/:id',async(req,reply)=>{const r=readRoom((req.params as {id:string}).id);return accessible(r,req.session!.userId)?r:reply.code(404).send({error:'ルームを表示できません'});});
  app.post('/api/rooms',async(req,reply)=>{
    const id=req.session!.userId,p=roomSchema.parse(req.body);
    if((sqlite.prepare('SELECT COUNT(*) AS n FROM rooms WHERE owner_id=?').get(id) as {n:number}).n>=5)return reply.code(409).send({error:'ルームは5つまで作れます'});
    const roomId=randomUUID();
    if(!validItems(p.items,id))return reply.code(400).send({error:'保存・いいねした投稿を選んでください'});
    sqlite.prepare('INSERT INTO rooms (id,owner_id,title,description,is_public,theme,layout,updated_at) VALUES (?,?,?,?,?,?,?,?)').run(roomId,id,p.title,p.description,Number(p.isPublic),p.theme,JSON.stringify({items:p.items,decorations:p.decorations}),Date.now());
    io.emit('rooms');return readRoom(roomId);
  });
  function validItems(items:{postId:string}[],id:string){return items.every(i=>!!sqlite.prepare("SELECT id FROM posts WHERE id=? AND ((owner_id=? AND origin='walk') OR id IN (SELECT post_id FROM favorites WHERE user_id=?) OR id IN (SELECT post_id FROM reactions WHERE user_id=? AND kind='heart'))").get(i.postId,id,id,id));}
  app.put('/api/rooms/:id',async(req,reply)=>{
    const id=(req.params as {id:string}).id,r=readRoom(id),me=req.session!.userId,p=roomSchema.parse(req.body);
    if(!r||r.ownerId!==me)return reply.code(403).send({error:'自分のルームだけ編集できます'});
    const revision=z.object({revision:z.number().int()}).parse(req.body).revision;
    // Existing placements may stay even if their save was removed afterwards.
    if(!validItems(p.items.filter(i=>!r.items.some(old=>old.postId===i.postId)),me))return reply.code(400).send({error:'保存・いいねした投稿を選んでください'});
    const changed=sqlite.prepare('UPDATE rooms SET title=?,description=?,is_public=?,theme=?,layout=?,updated_at=?,revision=revision+1 WHERE id=? AND revision=?').run(p.title,p.description,Number(p.isPublic),p.theme,JSON.stringify({items:p.items,decorations:p.decorations}),Date.now(),id,revision);
    if(!changed.changes)return reply.code(409).send({error:'別の画面で更新されました。一度閉じて開き直してください'});
    if(!p.isPublic)c.exitRoom(id);io.emit('rooms');c.broadcast();return readRoom(id);
  });
  app.delete('/api/rooms/:id',async(req,reply)=>{
    const id=(req.params as {id:string}).id,r=readRoom(id);if(!r||r.ownerId!==req.session!.userId)return reply.code(403).send({error:'自分のルームだけ削除できます'});
    sqlite.prepare('DELETE FROM rooms WHERE id=?').run(id);c.exitRoom(id);io.emit('rooms');c.broadcast();return {ok:true};
  });
  app.post('/api/imports',{config:{rateLimit:{max:8,timeWindow:'1 minute'}}},async(req,reply)=>{
    const p=z.object({url:z.string().max(2048),title:z.string().trim().min(1).max(120),authorName:z.string().trim().min(1).max(60),body:z.string().max(1000).default(''),genre:z.enum(genres)}).parse(req.body),source=sourceInfo(p.url);
    if(!source)return reply.code(400).send({error:'YouTubeの動画URL、Xの投稿URL、TikTokの @ユーザー名/video/番号 のURLを入力してください。短縮URLは元の投稿URLに開いてから貼り付けてください。'});
    const existing=db.select().from(t.posts).where(and(eq(t.posts.externalUrl,source.url),eq(t.posts.isSample,false))).get();
    if(existing){db.insert(t.favorites).values({userId:req.session!.userId,postId:existing.id,createdAt:Date.now()}).onConflictDoNothing().run();notify(req.session!.userId);return {id:existing.id,existing:true};}
    const owner=req.session!.userId;
    if((sqlite.prepare('SELECT COUNT(*) AS n FROM posts WHERE owner_id=?').get(owner) as {n:number}).n>=200)return reply.code(409).send({error:'登録は1人200件までです'});
    const id=randomUUID(),position=postPosition(c.store,p.genre);
    db.insert(t.posts).values({id,type:source.provider==='YouTube'?'youtube':'external',title:p.title,body:p.body,mediaUrl:'',externalUrl:source.url,origin:'external',provider:source.provider,authorName:p.authorName,genre:p.genre,mapX:position.mapX,mapY:position.mapY,isSample:false,createdAt:Date.now()}).run();
    sqlite.prepare('UPDATE posts SET owner_id=? WHERE id=?').run(owner,id);
    db.insert(t.favorites).values({userId:owner,postId:id,createdAt:Date.now()}).run();notify(owner);io.emit('posts');return {id,existing:false};
  });
  app.delete('/api/imports/:id',async(req,reply)=>{
    const id=(req.params as {id:string}).id;
    const r=sqlite.prepare('SELECT owner_id FROM posts WHERE id=?').get(id) as {owner_id:string}|undefined;
    if(!r||r.owner_id!==req.session!.userId)return reply.code(403).send({error:'自分が登録した投稿だけ削除できます'});
    db.delete(t.posts).where(eq(t.posts.id,id)).run();c.broadcast();io.emit('posts');io.emit('rooms');return {ok:true};
  });
  const membership=(user:string)=>(sqlite.prepare('SELECT party_id FROM party_members WHERE user_id=?').get(user) as {party_id:string}|undefined)?.party_id;
  const getParty=(id:string):Party|null=>{
    const p=sqlite.prepare('SELECT * FROM parties WHERE id=?').get(id) as {id:string;owner_id:string}|undefined;
    return p?{id:p.id,ownerId:p.owner_id,members:(sqlite.prepare('SELECT user_id FROM party_members WHERE party_id=?').all(id) as {user_id:string}[]).map(r=>person(r.user_id))}:null;
  };
  const partyState=(user:string):PartyState=>({party:getParty(membership(user)||''),invites:(sqlite.prepare('SELECT * FROM party_invites WHERE target_id=?').all(user) as {id:string;party_id:string;sender_id:string}[]).filter(i=>connected(user,i.sender_id)).map(i=>({id:i.id,partyId:i.party_id,from:person(i.sender_id)}))});
  const changed=()=>io.emit('party');
  app.get('/api/party',async req=>partyState(req.session!.userId));
  app.post('/api/party/invite',async(req,reply)=>{
    const me=req.session!.userId,{targetId}=z.object({targetId:z.string().uuid()}).parse(req.body);
    if(!connected(me,targetId))return reply.code(403).send({error:'承認済みの友達だけ招待できます'});
    let id=membership(me);
    if(!id){id=randomUUID();sqlite.transaction(()=>{sqlite.prepare('INSERT INTO parties VALUES (?,?)').run(id,me);sqlite.prepare('INSERT INTO party_members VALUES (?,?)').run(me,id);})();}
    const party=getParty(id)!;
    if(party.members.length>=6)return reply.code(409).send({error:'パーティは6人までです'});
    if(membership(targetId))return reply.code(409).send({error:'相手はすでにパーティに参加しています'});
    if(party.members.some(m=>blocked(m.id,targetId)))return reply.code(403).send({error:'この相手は招待できません'});
    sqlite.prepare('INSERT OR IGNORE INTO party_invites VALUES (?,?,?,?)').run(randomUUID(),id,me,targetId);changed();return {ok:true};
  });
  app.post('/api/party/respond',async(req,reply)=>{
    const {id,accept}=z.object({id:z.string().uuid(),accept:z.boolean()}).parse(req.body),me=req.session!.userId;
    const inv=sqlite.prepare('SELECT * FROM party_invites WHERE id=? AND target_id=?').get(id,me) as {party_id:string;sender_id:string}|undefined;
    if(!inv)return reply.code(404).send({error:'招待が見つかりません'});
    const party=getParty(inv.party_id);
    if(accept&&(!party||party.members.length>=6||membership(me)||!connected(me,inv.sender_id)||party.members.some(m=>blocked(me,m.id))))return reply.code(409).send({error:'この招待には参加できません'});
    sqlite.transaction(()=>{if(accept)sqlite.prepare('INSERT INTO party_members VALUES (?,?)').run(me,inv.party_id);sqlite.prepare('DELETE FROM party_invites WHERE id=?').run(id);if(accept)sqlite.prepare('DELETE FROM party_invites WHERE target_id=?').run(me);})();changed();return {ok:true};
  });
  const voice=new Map<string,{userId:string;partyId:string;displayName:string}>();
  const voiceMembers=(id:string)=>[...voice].filter(([,v])=>v.partyId===id).map(([socketId,v])=>({socketId,userId:v.userId,displayName:v.displayName}));
  const voiceChanged=(id:string)=>{for(const [sid,v]of voice)if(v.partyId===id)io.to(sid).emit('voice:members',voiceMembers(id));};
  const stopVoice=(sid:string)=>{const v=voice.get(sid);if(v){voice.delete(sid);io.to(sid).emit('voice:stopped');voiceChanged(v.partyId);}};
  const leave=(me:string)=>{
    const id=membership(me);if(!id)return;
    for(const [sid,v]of voice)if(v.userId===me)stopVoice(sid);
    sqlite.prepare('DELETE FROM party_members WHERE user_id=?').run(me);sqlite.prepare('DELETE FROM party_invites WHERE sender_id=?').run(me);
    const p=getParty(id)!;if(!p.members.length)sqlite.prepare('DELETE FROM parties WHERE id=?').run(id);else if(p.ownerId===me)sqlite.prepare('UPDATE parties SET owner_id=? WHERE id=?').run(p.members[0].id,id);changed();
  };
  app.post('/api/party/leave',async req=>{leave(req.session!.userId);return {ok:true};});
  const iceServers=()=>{
    const result:RTCIceServer[]=[];
    if(process.env.WALK_STUN_URL!=='off')result.push({urls:process.env.WALK_STUN_URL||'stun:stun.l.google.com:19302'});
    if(process.env.WALK_TURN_URL&&process.env.WALK_TURN_USERNAME&&process.env.WALK_TURN_CREDENTIAL)result.push({urls:process.env.WALK_TURN_URL,username:process.env.WALK_TURN_USERNAME,credential:process.env.WALK_TURN_CREDENTIAL});
    return result;
  };
  function attach(socket:Socket,userId:string){
    let signals=0,reset=0,lastJoin=0;
    socket.on('voice:join',(_data,ack)=>{
      const id=membership(userId);if(typeof ack!=='function')return;
      if(!id)return ack({ok:false,error:'パーティに参加してください'});
      if(Date.now()-lastJoin<500)return ack({ok:false,error:'少し待ってください'});lastJoin=Date.now();
      for(const [sid,v]of voice)if(v.userId===userId&&sid!==socket.id)stopVoice(sid);
      voice.set(socket.id,{userId,partyId:id,displayName:person(userId).displayName});ack({ok:true,members:voiceMembers(id),iceServers:iceServers()});voiceChanged(id);
    });
    socket.on('voice:signal',(data,ack)=>{
      const p=z.object({to:z.string().max(80),description:z.object({type:z.enum(['offer','answer']),sdp:z.string().max(20000)}).optional(),candidate:z.object({candidate:z.string().max(2000),sdpMid:z.string().max(80).nullable().optional(),sdpMLineIndex:z.number().int().min(0).max(100).nullable().optional(),usernameFragment:z.string().max(256).nullable().optional()}).optional()}).safeParse(data);
      const from=voice.get(socket.id),to=p.success?voice.get(p.data.to):null;
      if(Date.now()>reset){signals=0;reset=Date.now()+1000;}
      const ok=p.success&&!!from&&!!to&&from.partyId===to.partyId&&from.userId!==to.userId&&!blocked(from.userId,to.userId)&&membership(from.userId)===from.partyId&&membership(to.userId)===to.partyId&&++signals<=40;
      if(ok&&p.success)io.to(p.data.to).emit('voice:signal',{from:socket.id,description:p.data.description,candidate:p.data.candidate});
      if(typeof ack==='function')ack({ok});
    });
    socket.on('voice:leave',()=>stopVoice(socket.id));socket.on('disconnect',()=>stopVoice(socket.id));
  }
  return {readRoom,accessible,attach,removeUser:(id:string)=>{leave(id);sqlite.prepare('DELETE FROM party_invites WHERE sender_id=? OR target_id=?').run(id,id);},evictRooms:()=>c.exitRoom('*'),onBlock:(a:string,b:string)=>{if(membership(a)&&membership(a)===membership(b))leave(a);c.exitRoom('*');}};
}
