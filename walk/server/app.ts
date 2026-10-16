import { mkdtempSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname,join } from 'node:path';
import { publishing } from './publishing.js';
import { collector,type FeedLoader } from './collector.js';
import { activities } from './activities.js';
import {moderation} from './moderation.js';
import {accounts,anonymousAccountRoutes,type Session} from './accounts.js';
import {dataManagement} from './data-management.js';
import {legalConfiguration,releaseProblems} from '../shared/release.js';
import { nativeOrigins } from '../shared/native.js';
import { findPlace as lookupPlace, postWorld as lookupPostWorld, pathTo as lookupPath } from '../shared/worlds.js';
import {residentWorlds} from './worlds.js';
import { community } from './community.js';
import {cooperativePlay} from './play.js';
import { synchronizedWatching } from './watching.js';
import { destinationInvitations } from './meetups.js';
import Fastify, { type FastifyRequest } from 'fastify';
import cookie from '@fastify/cookie';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { Server } from 'socket.io';
import { randomBytes, randomUUID, createHash, timingSafeEqual } from 'node:crypto';
import { and, eq, or, count, lt, desc } from 'drizzle-orm';
import { z } from 'zod';
import { openDatabase } from './db.js';
import { seed } from './seed.js';
import {watchLinks} from './watch-links.js';
import {videoDiscovery} from './discovery.js';
import {canSynchronize} from '../shared/discovery.js';
import * as t from './schema.js';
import { areaAt, moveSchema, makePostSchema, profileSchema, type Peer, type WorldState } from '../shared/model.js';

declare module 'fastify' { interface FastifyRequest { session: Session | null } }
type Ack = (result: { ok: boolean; error?: string }) => void;
const hash = (s: string) => createHash('sha256').update(s).digest('hex');
const pub = (u: typeof t.users.$inferSelect) => ({ id: u.id, displayName: u.displayName, color: u.color, style: u.style });
export async function createApp(options: { database?: string; adminKey: string; logger?: boolean; origin?: string; secureCookie?: boolean;mediaDirectory?:string;collectionFeed?:FeedLoader } ) {
  if(process.env.WALK_PUBLIC_RELEASE==='true'){const problems=releaseProblems(process.env);if(problems.length)throw new Error(problems.join(' / '));}
  const app = Fastify({ logger: options.logger ?? false, bodyLimit: 32 * 1024, trustProxy: false });
  const store = openDatabase(options.database);
  const { db, sqlite } = store;
  seed(store);
  db.delete(t.sessions).where(lt(t.sessions.expiresAt, Date.now())).run();
  await app.register(cookie);
  await app.register(helmet, { contentSecurityPolicy: { directives: {
    defaultSrc: ["'self'"], scriptSrc: process.env.NODE_ENV === 'production' ? ["'self'"] : ["'self'", "'unsafe-inline'"],
    styleSrc: ["'self'", "'unsafe-inline'"], imgSrc: ["'self'", 'data:', 'blob:', 'https:'],
    mediaSrc: ["'self'", 'https:'],
    connectSrc: ["'self'", 'ws:', 'wss:'], frameSrc: ['https://www.youtube-nocookie.com','https://www.tiktok.com'],
    objectSrc: ["'none'"], baseUri: ["'self'"], formAction: ["'self'"], upgradeInsecureRequests: process.env.NODE_ENV === 'production' ? [] : null,
  } }, crossOriginEmbedderPolicy: false });
  await app.register(rateLimit, { max: 240, timeWindow: '1 minute', hook:'preHandler', allowList:req=>!req.url.startsWith('/api/')||req.url==='/api/health', keyGenerator:req=>req.session?.userId||req.ip });
  app.decorateRequest('session', null);
  const readSession = (token?: string): Session | null => {
    if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
    let row = db.select().from(t.sessions).where(eq(t.sessions.tokenHash, hash(token))).get();
    if(row?.isAdmin&&row.adminExpiresAt<=Date.now()){db.update(t.sessions).set({isAdmin:false,adminExpiresAt:0}).where(eq(t.sessions.tokenHash,row.tokenHash)).run();row={...row,isAdmin:false,adminExpiresAt:0};}
    if(row&&row.expiresAt>Date.now()&&row.expiresAt<Date.now()+7*86400000&&sqlite.prepare('SELECT user_id FROM accounts WHERE user_id=?').get(row.userId)){const expiresAt=Date.now()+30*86400000;db.update(t.sessions).set({expiresAt}).where(eq(t.sessions.tokenHash,row.tokenHash)).run();row={...row,expiresAt};}
    return row && row.expiresAt > Date.now() ? row : null;
  };
  const validOrigin = (origin: string | undefined, host: string | undefined) => {
    if (!origin) return true; // non-browser clients still need the session and CSRF header
    try { return options.origin ? origin === options.origin : new URL(origin).host === host; } catch { return false; }
  };
  app.addHook('onRequest', async (req, reply) => {
    const bearer=/^Bearer ([a-f0-9]{64})$/.exec(req.headers.authorization||'')?.[1];
    req.session=readSession(bearer||req.cookies.walk_session);
    const path=req.url.split('?')[0],publicAccount=anonymousAccountRoutes.has(path);
    // The app shell must remain reachable after session expiry so that it can
    // show login/recovery. Authentication is enforced on the API, not assets.
    if (!path.startsWith('/api/')) return;
    reply.header('Cache-Control', 'no-store');
    if((req.headers.authorization||req.cookies.walk_session)&&!req.session&&!publicAccount)return reply.code(401).send({error:'セッションが使えません。ログインして記録に戻れます。新しいゲストには切り替えていません。'});
    if(req.session&&req.cookies.walk_session&&sqlite.prepare('SELECT user_id FROM accounts WHERE user_id=?').get(req.session.userId))reply.setCookie('walk_session',req.cookies.walk_session,{httpOnly:true,sameSite:'strict',secure:options.secureCookie??false,path:'/',maxAge:30*86400});
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && (req.headers['x-walk-client'] !== '1' || !(validOrigin(req.headers.origin,req.headers.host)||(!!bearer&&!!req.session||publicAccount)&&nativeOrigins.includes(req.headers.origin||'')))) return reply.code(403).send({ error: 'リクエスト元を確認できません。ページを再読み込みしてください。' });
    if(req.session&&!publicAccount&&path!=='/api/bootstrap'&&path!=='/api/health'&&!path.startsWith('/api/account')&&sqlite.prepare('SELECT user_id FROM user_moderation WHERE user_id=?').get(req.session.userId))return reply.code(403).send({error:'このアカウントは利用停止中です。アカウント設定からデータの取得・削除や問い合わせ先を確認できます。'});
    if(process.env.WALK_PUBLIC_RELEASE==='true'&&req.session&&req.method==='POST'&&['/api/uploads','/api/posts','/api/imports'].includes(path)&&!sqlite.prepare('SELECT user_id FROM accounts WHERE user_id=?').get(req.session.userId))return reply.code(403).send({error:'投稿するには、今のゲストを無料でアカウント登録してください'});
    // Native sessions use a capability token stored in the device's secure storage.
    if (!['/api/bootstrap','/api/native/session'].includes(req.url.split('?')[0]) && req.url !== '/api/health' && !publicAccount && !req.session) return reply.code(401).send({ error: 'セッションの有効期限が切れました。再読み込みしてください。' });
    if (req.url.startsWith('/api/admin/') && req.url !== '/api/admin/login' && !req.session?.isAdmin) return reply.code(403).send({ error: '管理者の認証が必要です' });
  });
  app.setErrorHandler((error, req, reply) => {
    if (error instanceof z.ZodError) return reply.code(400).send({ error: error.issues[0]?.message || '入力が正しくありません' });
    const status = error instanceof Error && 'statusCode' in error && typeof error.statusCode === 'number' ? error.statusCode : 500;
    if (status >= 500) req.log.error(error);
    reply.code(status).send({ error: status === 429 ? '操作が多すぎます。少し待ってください。' : status >= 500 ? 'サーバーでエラーが発生しました' : error instanceof Error ? error.message : 'リクエストが正しくありません' });
  });
  const worldFeatures=residentWorlds({app,store,changed:changedWorlds});
  const findPlace=(id:string)=>lookupPlace(id,worldFeatures.catalog());
  const postWorld=(post:Parameters<typeof lookupPostWorld>[0])=>lookupPostWorld(post,worldFeatures.catalog());
  const pathTo=(id:string)=>lookupPath(id,worldFeatures.catalog());
  const uid = (r: FastifyRequest) => r.session!.userId;
  const isSuspended=(id:string)=>!!sqlite.prepare('SELECT user_id FROM user_moderation WHERE user_id=?').get(id);
  const blocked = (a: string,b: string) => isSuspended(a)||isSuspended(b)||!!db.select().from(t.blocks).where(or(and(eq(t.blocks.userId,a),eq(t.blocks.targetId,b)),and(eq(t.blocks.userId,b),eq(t.blocks.targetId,a)))).get();
  const connected = (a: string,b: string) => !blocked(a,b) && !!db.select().from(t.friendships).where(and(eq(t.friendships.status,'accepted'),or(and(eq(t.friendships.requesterId,a),eq(t.friendships.receiverId,b)),and(eq(t.friendships.requesterId,b),eq(t.friendships.receiverId,a))))).get();
  const readablePost=(id:string)=>{const p=db.select().from(t.posts).where(eq(t.posts.id,id)).get();return p&&(!p.ownerId||!isSuspended(p.ownerId))?p:undefined;};
  const postList = () => db.select().from(t.posts).all().filter(p=>!p.ownerId||!isSuspended(p.ownerId)).map(p => ({ ...p, saves: db.select({ n: count() }).from(t.favorites).where(eq(t.favorites.postId,p.id)).get()!.n, reactions: Object.fromEntries(db.select({kind:t.reactions.kind,n:count()}).from(t.reactions).where(eq(t.reactions.postId,p.id)).groupBy(t.reactions.kind).all().map(r=>[r.kind,r.n])) }));
  const friendList = (id: string) => db.select().from(t.friendships).where(or(eq(t.friendships.requesterId,id),eq(t.friendships.receiverId,id))).all().flatMap(f => {
    const target = f.requesterId === id ? f.receiverId : f.requesterId;
    const user = db.select().from(t.users).where(eq(t.users.id,target)).get();
    return user && !blocked(id,target) ? [{ ...f, user: pub(user) }] : [];
  });
  const io = new Server(app.server, { maxHttpBufferSize: 32768, pingTimeout: 15000, pingInterval: 10000, allowRequest: (req, cb) => cb(null, validOrigin(req.headers.origin,req.headers.host)||nativeOrigins.includes(req.headers.origin||'')) });
  const positions = new Map<string, { x: number; y: number; time: number; worldId: string }>();
  const userChatTimes = new Map<string, number>();
  const sessionCreations = new Map<string, {count:number;reset:number}>();
  const sockets = new Map<string, { tokenHash:string;userId: string; postId: string | null; expiresAt: number; last: Map<string, number> }>();
  const activeUsers = () => new Set([...sockets.values()].map(s => s.userId));
  function broadcast() {
    watchingFeatures.refresh();
    playFeatures.refresh();
    meetupFeatures.refresh();
    const online = activeUsers();
    const counts: Record<string,number> = {};
    const viewing = new Map<string,Set<string>>();
    for(const s of sockets.values())if(s.postId&&!readablePost(s.postId))s.postId=null;
    for (const s of sockets.values()) if (s.postId) {
      if (!viewing.has(s.postId)) viewing.set(s.postId,new Set());
      viewing.get(s.postId)!.add(s.userId);
    }
    for (const [id,people] of viewing) counts[id] = people.size;
    // Visiting moves an avatar to the post. Hiding only currentPost still
    // exposes private viewing through the avatar's exact location.
    const viewingUsers = new Set([...viewing.values()].flatMap(ids => [...ids]));
    const people = db.select().from(t.users).all().filter(u => online.has(u.id));
    for (const [sid, socket] of io.sockets.sockets) {
      const me = sockets.get(sid); if (!me) continue;
      const context=positions.get(me.userId)?.worldId||'public';
      const visible = people.filter(u => !blocked(me.userId,u.id) && (positions.get(u.id)?.worldId||'public')===context && (u.id===me.userId || u.shareActivity || !viewingUsers.has(u.id)));
      const viewers: WorldState['viewers'] = {};
      for (const [id, ids] of viewing) viewers[id] = people.filter(u => !blocked(me.userId,u.id) && u.shareActivity && ids.has(u.id)).map(u=>({...pub(u),reaction:db.select().from(t.reactions).where(and(eq(t.reactions.userId,u.id),eq(t.reactions.postId,id))).get()?.kind||null}));
      const peers: Peer[] = visible.map(u => {
        const p = positions.get(u.id) || { x: 1100,y: 750,worldId:'public' };
        const current = u.shareActivity ? [...sockets.values()].find(s => s.userId === u.id && s.postId)?.postId || null : null;
        return { ...pub(u), x:p.x,y:p.y,area:areaAt(p.x,p.y),worldId:p.worldId,currentPost:current };
      });
      socket.emit('world', { peers, counts, viewers, online: online.size, activities: activityFeatures.ghosts(me.userId,context,online) } satisfies WorldState);
    }
  }
  const notify = (id: string, event = 'social') => { for (const [sid,s] of sockets) if (s.userId === id) io.to(sid).emit(event); };
  function changeWorld(userId:string,worldId:string){
    positions.set(userId,{x:1100,y:750,time:Date.now(),worldId});
    for(const [sid,client]of sockets)if(client.userId===userId){client.postId=null;io.to(sid).emit('context',{worldId,reset:true});io.to(sid).emit('position',{x:1100,y:750});}
  }
  const features=community({app,io,store,blocked,connected,notify,broadcast,exitRoom:(id)=>{
    for(const [userId,p]of positions)if(!findPlace(p.worldId)&&(id==='*'||p.worldId===id)){
      const r=features.readRoom(p.worldId);if(!features.accessible(r,userId))changeWorld(userId,'public');
    }
  }});
  const discovery=videoDiscovery(app,store,postList,()=>io.emit('posts'));
  const watchingFeatures=synchronizedWatching({io,connected,blocked,person:id=>{const u=db.select().from(t.users).where(eq(t.users.id,id)).get();return u?pub(u):null;},video:id=>{const p=readablePost(id);return p&&canSynchronize(p)?{id:p.id,title:p.title,source:p.mediaUrl}:null;},viewer:id=>{const s=sockets.get(id);if(!s)return null;const session=db.select().from(t.sessions).where(eq(t.sessions.tokenHash,s.tokenHash)).get();return session&&session.expiresAt>Date.now()&&!isSuspended(s.userId)?{userId:s.userId,postId:s.postId}:null;}});
  const watchLinkFeatures=watchLinks({app,hosting:watchingFeatures.hosting,person:id=>{const u=db.select().from(t.users).where(eq(t.users.id,id)).get();return u?pub(u):null;},post:readablePost,blocked});
  const playFeatures=cooperativePlay({io,blocked,person:id=>{const u=db.select().from(t.users).where(eq(t.users.id,id)).get();return u?pub(u):null;},allowed:(id,userId)=>findPlace(id)?.genre==='game'||features.accessible(features.readRoom(id),userId),viewer:id=>{const s=sockets.get(id);if(!s)return null;const session=db.select().from(t.sessions).where(eq(t.sessions.tokenHash,s.tokenHash)).get();return session&&session.expiresAt>Date.now()&&!isSuspended(s.userId)?{userId:s.userId,worldId:positions.get(s.userId)?.worldId||'public'}:null;},entered:id=>{const s=sockets.get(id);if(s)s.postId=null;broadcast();}});
  const meetupFeatures=destinationInvitations({app,connected,notify,person:id=>{const u=db.select().from(t.users).where(eq(t.users.id,id)).get();return u?pub(u):null;},resolve:(target,userId)=>{
    if(target.kind==='room'){const r=features.readRoom(target.id);return r?.isPublic&&features.accessible(r,userId)?{title:r.title,path:['不思議な駅','住人のルーム',r.title]}:null;}
    const p=target.kind==='post'?readablePost(target.id):null;
    if(target.kind==='post'&&(!p||p.ownerId&&blocked(userId,p.ownerId)))return null;
    const place=findPlace(p?postWorld(p):target.id);return place?{title:p?.title||place.title,path:pathTo(place.id).map(p=>p.title)}:null;
  }});
  io.use((socket,next) => {
    let token: string | undefined;
    try { token = app.parseCookie(socket.request.headers.cookie || '').walk_session; } catch { /* malformed cookie */ }
    const nativeToken=socket.handshake.auth?.token;
    const session = readSession(typeof nativeToken==='string'?nativeToken:token);
    if(nativeOrigins.includes(socket.request.headers.origin||'')&&typeof nativeToken!=='string')return next(new Error('ネイティブ認証が必要です'));
    if (!session) return next(new Error('セッションが必要です'));
    if(isSuspended(session.userId))return next(new Error('利用停止中のアカウントです'));
    socket.data.session = session; next();
  });
  io.on('connection', socket => {
    const session = socket.data.session as Session;
    const s = { tokenHash:session.tokenHash,userId:session.userId,postId:null as string|null,expiresAt:session.expiresAt,last:new Map<string,number>() };
    sockets.set(socket.id,s);
    if (!positions.has(s.userId)) positions.set(s.userId,{ x:1100,y:750,time:Date.now(),worldId:'public' });
    const respond = (ack: unknown, result: {ok:boolean;error?:string}) => { if (typeof ack === 'function') (ack as Ack)(result); };
    const limit = (key:string,ms:number) => { const now=Date.now(); if(now-(s.last.get(key)||0)<ms)return false; s.last.set(key,now); return true; };
    socket.use((_packet,next) => { const active=db.select().from(t.sessions).where(eq(t.sessions.tokenHash,s.tokenHash)).get();if (!active||Date.now() >= active.expiresAt||active.userId!==s.userId) { socket.disconnect(true); return; }s.expiresAt=active.expiresAt;next(); });
    socket.on('move', data => {
      const parsed=moveSchema.safeParse(data); if(!parsed.success)return;
      const old=positions.get(s.userId)!; const now=Date.now(); if(now-old.time<75)return;
      const distance=Math.hypot(parsed.data.x-old.x,parsed.data.y-old.y);
      // Server speed cap, shared across tabs. Area shortcuts are deliberate teleports.
      if(distance>Math.min(500,(now-old.time)/1000*420+35)){socket.emit('position',{x:old.x,y:old.y});return;}
      positions.set(s.userId,{...parsed.data,time:now,worldId:old.worldId}); broadcast();
    });
    socket.on('teleport',(data,ack) => {
      const parsed=moveSchema.safeParse(data); if(!parsed.success || !limit('teleport',500))return respond(ack,{ok:false,error:'少し待ってください'});
      positions.set(s.userId,{...parsed.data,time:Date.now(),worldId:positions.get(s.userId)?.worldId||'public'}); for (const [sid,client] of sockets) if (client.userId===s.userId) io.to(sid).emit('position',parsed.data); broadcast(); respond(ack,{ok:true});
    });
    socket.on('room:enter',(data,ack)=>{
      const p=z.object({worldId:z.string().max(80)}).safeParse(data);
      if(!p.success||!limit('room:enter',200))return respond(ack,{ok:false,error:'少し待ってからルームを選んでください'});
      if(!findPlace(p.data.worldId)&&!features.accessible(features.readRoom(p.data.worldId),s.userId))return respond(ack,{ok:false,error:'ルームを表示できません'});
      changeWorld(s.userId,p.data.worldId);broadcast();respond(ack,{ok:true});
    });
    socket.on('visit',(data,ack)=>{
      const p=z.object({postId:z.string().max(80)}).safeParse(data);
      if(!p.success||!limit('visit',150))return respond(ack,{ok:false,error:'少し待ってください'});
      const post=readablePost(p.data.postId);
      if(!post)return respond(ack,{ok:false,error:'投稿が見つかりません'});
      let worldId=positions.get(s.userId)?.worldId||'public',point={x:post.mapX,y:Math.min(1360,post.mapY+85)};
      if(!findPlace(worldId)){
        const room=features.readRoom(worldId),item=room?.items.find(i=>i.postId===post.id);
        if(features.accessible(room,s.userId)&&item)point={x:item.x,y:item.y+85};else {worldId=postWorld(post);changeWorld(s.userId,worldId);}
      }
      if(findPlace(worldId)&&worldId!==postWorld(post)){worldId=postWorld(post);changeWorld(s.userId,worldId);}
      positions.set(s.userId,{...point,time:Date.now(),worldId});s.postId=post.id;
      for(const [sid,client]of sockets)if(client.userId===s.userId)io.to(sid).emit('position',point);
      broadcast();respond(ack,{ok:true});
    });
    features.attach(socket,s.userId);
    watchingFeatures.attach(socket,s.userId);
    playFeatures.attach(socket);
    socket.emit('context',{worldId:positions.get(s.userId)?.worldId||'public'});
    socket.on('view',(data,ack) => {
      const parsed=z.object({postId:z.string().max(80).nullable()}).safeParse(data);
      if(!parsed.success)return respond(ack,{ok:false,error:'投稿が正しくありません'});
      if(parsed.data.postId && !readablePost(parsed.data.postId))return respond(ack,{ok:false,error:'投稿が見つかりません'});
      if(parsed.data.postId){const post=db.select().from(t.posts).where(eq(t.posts.id,parsed.data.postId)).get()!;const context=positions.get(s.userId)?.worldId||'public';if(findPlace(context)?context!==postWorld(post):!features.readRoom(context)?.items.some(i=>i.postId===post.id))return respond(ack,{ok:false,error:'投稿の場所へ移動してください'});}
      s.postId=parsed.data.postId; broadcast(); respond(ack,{ok:true});
    });
    socket.on('chat',(data,ack) => {
      const parsed=z.object({to:z.string().max(80),content:z.string().trim().min(1).max(1000),clientId:z.string().uuid()}).safeParse(data);
      if(!parsed.success)return respond(ack,{ok:false,error:'メッセージは1〜1000文字で入力してください'});
      const p=parsed.data;
      if(!connected(s.userId,p.to))return respond(ack,{ok:false,error:'承認済みの相手にだけ送信できます'});
      const existing=db.select().from(t.messages).where(eq(t.messages.id,p.clientId)).get();
      if(existing)return respond(ack,{ok:existing.senderId===s.userId});
      if(Date.now()-(userChatTimes.get(s.userId)||0)<700)return respond(ack,{ok:false,error:'送信間隔を少し空けてください'});
      userChatTimes.set(s.userId,Date.now());
      const message={id:p.clientId,senderId:s.userId,receiverId:p.to,content:p.content,createdAt:Date.now()};
      db.insert(t.messages).values(message).run();
      for(const [sid,client] of sockets)if([s.userId,p.to].includes(client.userId))io.to(sid).emit('message',message);
      respond(ack,{ok:true});
    });
    socket.emit('position',positions.get(s.userId));
    socket.on('disconnect',() => { sockets.delete(socket.id); if(!activeUsers().has(s.userId)){positions.delete(s.userId);userChatTimes.delete(s.userId);} broadcast(); });
    broadcast();
  });
  const expiryTimer=setInterval(() => {for(const [id,s]of sockets){const current=db.select().from(t.sessions).where(eq(t.sessions.tokenHash,s.tokenHash)).get();if(!current||current.expiresAt<=Date.now())io.sockets.sockets.get(id)?.disconnect(true);else s.expiresAt=current.expiresAt;}for(const [ip,b]of sessionCreations)if(b.reset<Date.now())sessionCreations.delete(ip);},30000);
  expiryTimer.unref();
  function changedWorlds(){
    for(const [userId,p]of positions)if(p.worldId.startsWith('resident:')&&!findPlace(p.worldId))changeWorld(userId,'public');
    io.emit('worlds');broadcast();
  }
  const changedPosts=()=>{broadcast();io.emit('posts');io.emit('rooms');};
  const temporaryMedia=options.database===':memory:'&&!options.mediaDirectory?mkdtempSync(join(tmpdir(),'walk-media-')):null;
  const mediaDirectory=options.mediaDirectory||temporaryMedia||join(dirname(options.database||process.env.DATABASE_PATH||'./data/walk.sqlite'),'uploads');
  await publishing({app,store,changed:changedPosts,mediaDirectory,catalog:worldFeatures.catalog});
  const disconnect=(userId:string,tokenHash?:string)=>{for(const [sid,s] of sockets)if(s.userId===userId&&(!tokenHash||s.tokenHash===tokenHash))io.sockets.sockets.get(sid)?.disconnect(true);};
  const management=dataManagement({store,mediaDirectory,leaveCommunity:features.removeUser,evictRooms:features.evictRooms,disconnect,changed:()=>{changedWorlds();changedPosts();io.emit('party');io.emit('social');}});
  void management.clean();
  const cleanupTimer=setInterval(()=>{void management.clean();},60000);cleanupTimer.unref();
  moderation({app,store,changed:(id,suspended)=>{if(suspended)features.removeUser(id);disconnect(id);features.evictRooms();changedWorlds();io.emit('social');changedPosts();}});
  const accountFeatures=accounts({app,store,secureCookie:options.secureCookie??false,legal:legalConfiguration(process.env),disconnect,removeUser:management.removeUser,guest:(req,reply)=>createGuest(req,reply)});
  const activityFeatures=activities({app,store,blocked,changed:(id)=>{notify(id,'activities');broadcast();}});
  let activitySignature=activityFeatures.signature();
  const activityTimer=setInterval(()=>{activityFeatures.settle();const next=activityFeatures.signature();if(next!==activitySignature){activitySignature=next;io.emit('activities');broadcast();}},1000);activityTimer.unref();
  const collections=collector({app,store,changed:changedPosts,loadFeed:options.collectionFeed});
  app.get('/api/health',async()=>{sqlite.prepare('SELECT 1').get();return {ok:true};});
  function createGuest(req:FastifyRequest,reply:import('fastify').FastifyReply){
    const id=randomUUID(),token=randomBytes(32).toString('hex'),createdAt=Date.now(),session={tokenHash:hash(token),userId:id,expiresAt:createdAt+30*86400000,isAdmin:false,createdAt};
    db.transaction(()=>{db.insert(t.users).values({id,displayName:'旅人',color:'#6d9c80',style:'cap',shareActivity:false,createdAt}).run();db.insert(t.sessions).values(session).run();});req.session=session;
    if(req.headers['x-walk-native']==='1'||req.url.split('?')[0]==='/api/native/session')return {token,ok:true,expiresAt:session.expiresAt};
    reply.setCookie('walk_session',token,{httpOnly:true,sameSite:'strict',secure:options.secureCookie??false,path:'/',maxAge:30*86400});return {ok:true,expiresAt:session.expiresAt};
  }
  app.post('/api/native/session',{config:{rateLimit:{max:12,timeWindow:'1 minute',keyGenerator:(req:FastifyRequest)=>req.ip}}},async(req,reply)=>createGuest(req,reply));
  app.get('/api/bootstrap',async(req,reply)=>{
    if(!req.session){
      const now=Date.now();let bucket=sessionCreations.get(req.ip);if(!bucket||bucket.reset<now){bucket={count:0,reset:now+60000};sessionCreations.set(req.ip,bucket);}if(++bucket.count>12)return reply.code(429).send({error:'ゲスト作成が多すぎます。1分ほど待ってください。'});
      createGuest(req,reply);
    }
    const availablePosts=postList();
    return {discoveryPicks:discovery.picks(availablePosts),worlds:worldFeatures.catalog(),user:db.select().from(t.users).where(eq(t.users.id,uid(req))).get(),posts:availablePosts,favorites:db.select().from(t.favorites).where(eq(t.favorites.userId,uid(req))).all().map(f=>f.postId),reactions:Object.fromEntries(db.select().from(t.reactions).where(eq(t.reactions.userId,uid(req))).all().map(r=>[r.postId,r.kind])),friendships:friendList(uid(req)),blocks:db.select().from(t.blocks).where(eq(t.blocks.userId,uid(req))).all().map(b=>b.targetId),isAdmin:req.session!.isAdmin,account:accountFeatures.summary(uid(req)),requireAccountForPublishing:process.env.WALK_PUBLIC_RELEASE==='true'};
  });
  app.patch('/api/profile',async req=>{ const p=profileSchema.parse(req.body);db.update(t.users).set(p).where(eq(t.users.id,uid(req))).run();broadcast();return {ok:true}; });
  app.put('/api/favorites/:id',async(req,reply)=>{
    const id=(req.params as {id:string}).id;const p=z.object({saved:z.boolean()}).parse(req.body);
    if(!db.select().from(t.posts).where(eq(t.posts.id,id)).get())return reply.code(404).send({error:'投稿が見つかりません'});
    if(p.saved)db.insert(t.favorites).values({userId:uid(req),postId:id,createdAt:Date.now()}).onConflictDoNothing().run();
    else db.delete(t.favorites).where(and(eq(t.favorites.userId,uid(req)),eq(t.favorites.postId,id))).run();
    notify(uid(req)); io.emit('posts');return {ok:true};
  });
  app.put('/api/reactions/:id',async(req,reply)=>{
    const id=(req.params as {id:string}).id;const {reaction}=z.object({reaction:z.enum(['heart','spark','wave']).nullable()}).parse(req.body);
    if(!db.select().from(t.posts).where(eq(t.posts.id,id)).get())return reply.code(404).send({error:'投稿が見つかりません'});
    if(reaction)db.insert(t.reactions).values({userId:uid(req),postId:id,kind:reaction,createdAt:Date.now()}).onConflictDoUpdate({target:[t.reactions.userId,t.reactions.postId],set:{kind:reaction}}).run();
    else db.delete(t.reactions).where(and(eq(t.reactions.userId,uid(req)),eq(t.reactions.postId,id))).run();broadcast();io.emit('posts');return {ok:true};
  });
  app.get('/api/users/:id',async(req,reply)=>{
    const target=db.select().from(t.users).where(eq(t.users.id,(req.params as {id:string}).id)).get();
    if(!target || blocked(uid(req),target.id))return reply.code(404).send({error:'プロフィールを表示できません'});
    const me=db.select().from(t.users).where(eq(t.users.id,uid(req))).get()!;
    const likes=(id:string)=>new Set([...db.select().from(t.favorites).where(eq(t.favorites.userId,id)).all().map(f=>f.postId),...db.select().from(t.reactions).where(and(eq(t.reactions.userId,id),eq(t.reactions.kind,'heart'))).all().map(f=>f.postId)]);
    const canMatch=me.shareActivity&&target.shareActivity,myFav=canMatch?likes(me.id):new Set<string>(),other=canMatch?likes(target.id):new Set<string>();
    const common=[...myFav].filter(id=>other.has(id));
    const posts=db.select().from(t.posts).all(),myGenres=new Set(posts.filter(p=>myFav.has(p.id)).map(p=>p.genre)),theirGenres=new Set(posts.filter(p=>other.has(p.id)).map(p=>p.genre));
    const commonGenres=[...myGenres].filter(g=>theirGenres.has(g));
    const matchScore=canMatch&&myFav.size&&other.size?Math.round(100*(.6*common.length/new Set([...myFav,...other]).size+.4*commonGenres.length/new Set([...myGenres,...theirGenres]).size)):null;
    return {...pub(target),shareActivity:target.shareActivity,commonCount:canMatch?common.length:null,commonGenres,matchScore};
  });
  app.get('/api/social',async req=>({friendships:friendList(uid(req)),blocks:db.select().from(t.blocks).where(eq(t.blocks.userId,uid(req))).all().map(b=>b.targetId)}));
  app.post('/api/friendships',async(req,reply)=>{
    const {targetId}=z.object({targetId:z.string().uuid()}).parse(req.body);const me=uid(req);
    if(targetId===me || blocked(me,targetId)||!db.select().from(t.users).where(eq(t.users.id,targetId)).get())return reply.code(400).send({error:'この相手にはリクエストできません'});
    const existing=db.select().from(t.friendships).where(or(and(eq(t.friendships.requesterId,me),eq(t.friendships.receiverId,targetId)),and(eq(t.friendships.requesterId,targetId),eq(t.friendships.receiverId,me)))).get();
    if(existing)return reply.code(409).send({error:'リクエストは送信済みです'});
    db.insert(t.friendships).values({id:randomUUID(),requesterId:me,receiverId:targetId,status:'pending',createdAt:Date.now()}).run();notify(me);notify(targetId);return {ok:true};
  });
  app.patch('/api/friendships/:id',async(req,reply)=>{
    const {action}=z.object({action:z.enum(['accept','decline'])}).parse(req.body);
    const f=db.select().from(t.friendships).where(eq(t.friendships.id,(req.params as {id:string}).id)).get();
    if(!f || f.receiverId!==uid(req)||f.status!=='pending'||blocked(f.requesterId,f.receiverId))return reply.code(403).send({error:'このリクエストを承認できません'});
    if(action==='decline')db.delete(t.friendships).where(eq(t.friendships.id,f.id)).run();
    else db.update(t.friendships).set({status:'accepted'}).where(eq(t.friendships.id,f.id)).run();
    notify(f.requesterId);notify(f.receiverId);return {ok:true};
  });
  app.get('/api/messages/:id',async(req,reply)=>{
    const target=(req.params as {id:string}).id;const me=uid(req);
    if(!connected(me,target))return reply.code(403).send({error:'承認済みの相手にだけアクセスできます'});
    return db.select().from(t.messages).where(or(and(eq(t.messages.senderId,me),eq(t.messages.receiverId,target)),and(eq(t.messages.senderId,target),eq(t.messages.receiverId,me)))).orderBy(desc(t.messages.createdAt)).limit(100).all().reverse();
  });
  app.put('/api/blocks/:id',async(req,reply)=>{
    const id=(req.params as {id:string}).id;const {blocked:enable}=z.object({blocked:z.boolean()}).parse(req.body);const me=uid(req);
    if(id===me || !db.select().from(t.users).where(eq(t.users.id,id)).get())return reply.code(400).send({error:'対象が見つかりません'});
    if(enable){db.insert(t.blocks).values({userId:me,targetId:id,createdAt:Date.now()}).onConflictDoNothing().run();db.delete(t.friendships).where(or(and(eq(t.friendships.requesterId,me),eq(t.friendships.receiverId,id)),and(eq(t.friendships.requesterId,id),eq(t.friendships.receiverId,me)))).run();}
    else db.delete(t.blocks).where(and(eq(t.blocks.userId,me),eq(t.blocks.targetId,id))).run();
    if(enable)features.onBlock(me,id);notify(me);notify(id);broadcast();return {ok:true};
  });
  app.post('/api/reports',async(req,reply)=>{
    const p=z.object({targetType:z.enum(['user','post']),targetId:z.string().min(1).max(80),reason:z.string().trim().min(3).max(1000)}).parse(req.body);
    const exists=p.targetType==='user'?db.select().from(t.users).where(eq(t.users.id,p.targetId)).get():db.select().from(t.posts).where(eq(t.posts.id,p.targetId)).get();
    if(!exists)return reply.code(404).send({error:'対象が見つかりません'});
    db.insert(t.reports).values({id:randomUUID(),reporterId:uid(req),...p,createdAt:Date.now()}).run();return {ok:true};
  });
  app.post('/api/admin/login',{config:{rateLimit:{max:5,timeWindow:'1 minute',keyGenerator:(req:FastifyRequest)=>req.ip}}},async(req,reply)=>{
    const {key}=z.object({key:z.string().min(1).max(256)}).parse(req.body);
    if(!timingSafeEqual(Buffer.from(hash(key)),Buffer.from(hash(options.adminKey))))return reply.code(403).send({error:'管理者キーが正しくありません'});
    db.update(t.sessions).set({isAdmin:true,adminExpiresAt:Date.now()+3600000}).where(eq(t.sessions.tokenHash,hash(/^Bearer ([a-f0-9]{64})$/.exec(req.headers.authorization||'')?.[1]||req.cookies.walk_session!))).run();return {ok:true};
  });
  app.post('/api/admin/posts',async req=>{const p=makePostSchema(worldFeatures.catalog()).parse(req.body); const id=randomUUID();db.insert(t.posts).values({id,...p,origin:p.isSample?'sample':p.externalUrl?'external':'editorial',createdAt:Date.now()}).run();io.emit('posts');return {id};});
  app.put('/api/admin/posts/:id',async(req,reply)=>{const p=makePostSchema(worldFeatures.catalog()).parse(req.body); const id=(req.params as {id:string}).id;if(!db.select().from(t.posts).where(eq(t.posts.id,id)).get())return reply.code(404).send({error:'投稿が見つかりません'});db.update(t.posts).set(p).where(eq(t.posts.id,id)).run();io.emit('posts');return {ok:true};});
  app.delete('/api/admin/posts/:id',async req=>{const id=(req.params as {id:string}).id;db.delete(t.posts).where(eq(t.posts.id,id)).run();for(const s of sockets.values())if(s.postId===id)s.postId=null;broadcast();io.emit('posts');io.emit('rooms');return {ok:true};});
  app.addHook('onClose',async()=>{meetupFeatures.close();watchLinkFeatures.close();watchingFeatures.close();playFeatures.close();clearInterval(expiryTimer);clearInterval(activityTimer);clearInterval(cleanupTimer);await collections.close();await new Promise<void>(resolve=>io.close(()=>resolve()));sqlite.close();if(temporaryMedia)rmSync(temporaryMedia,{recursive:true,force:true});});
  return {app,io,store};
}
