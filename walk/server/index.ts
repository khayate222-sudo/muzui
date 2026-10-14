import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { randomBytes } from 'node:crypto';
import { createApp } from './app.js';
const database=process.env.DATABASE_PATH||'./data/walk.sqlite';
const keyPath=resolve(dirname(database),'admin-key');
let adminKey=process.env.ADMIN_KEY;
if(!adminKey){
  mkdirSync(dirname(keyPath),{recursive:true,mode:0o700});
  if(!existsSync(keyPath))writeFileSync(keyPath,randomBytes(32).toString('hex'),{mode:0o600,flag:'wx'});
  adminKey=readFileSync(keyPath,'utf8').trim();
}
if(adminKey.length<24)throw new Error('ADMIN_KEY must contain at least 24 characters');
const {app}=await createApp({database,adminKey,logger:true,origin:process.env.APP_ORIGIN,secureCookie:process.env.COOKIE_SECURE==='true'});
if(process.env.NODE_ENV==='production'){
  await app.register(import('@fastify/static'),{root:resolve('dist'),maxAge:'1h'});
  app.setNotFoundHandler((req,reply)=>req.url.startsWith('/api/')?reply.code(404).send({error:'APIが見つかりません'}):reply.type('text/html').sendFile('index.html'));
}else{
  const {createServer}=await import('vite');
  const vite=await createServer({server:{middlewareMode:true},appType:'spa'});
  await app.register(import('@fastify/middie'));
  app.use((req,res,next)=>req.url?.startsWith('/api/')||req.url?.startsWith('/socket.io/')?next():vite.middlewares(req,res,next));
  app.addHook('onClose',async()=>{await vite.close();});
}
await app.listen({port:Number(process.env.PORT||3001),host:'0.0.0.0'});
console.log('WALK ready. Administrator key is stored locally in data/admin-key (never commit or share it).');
let closing=false;
for(const signal of ['SIGTERM','SIGINT'] as const)process.on(signal,()=>{if(!closing){closing=true;void app.close().then(()=>process.exit(0));}});
