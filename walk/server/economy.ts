import type {FastifyInstance} from 'fastify';
import {randomInt,randomUUID} from 'node:crypto';
import {z} from 'zod';
import type {Store} from './db';
import {cosmeticCatalog,type GameJob,type ArcadeRound} from '../shared/economy';
import {buildingPiecesSchema} from '../shared/building';
type JobRow={id:string;owner_id:string;worker_id:string|null;title:string;description:string;reward:number;state:GameJob['state'];delivery:string|null;created_at:number;updated_at:number;request_id:string};
const fail=(statusCode:number,message:string):never=>{throw Object.assign(new Error(message),{statusCode});};
export function economy({app,store,blocked,changed}:{app:FastifyInstance;store:Store;blocked:(a:string,b:string)=>boolean;changed:()=>void}){
 app.addHook('onResponse',async req=>{if(req.url.startsWith('/api/economy/')&&req.method!=='GET')changed();});
 const sql=store.sqlite,rate={config:{rateLimit:{max:30,timeWindow:'1 minute'}}};
 const enabled=()=>process.env.WALK_PUBLIC_RELEASE!=='true'||process.env.WALK_ARCADE_ENABLED==='true';
 const balance=(table:string,user:string)=>(sql.prepare(`SELECT COALESCE(SUM(delta),0) AS amount FROM ${table} WHERE user_id=?`).get(user) as {amount:number}).amount;
 const entry=(table:string,user:string,delta:number,reference:string)=>sql.prepare(`INSERT INTO ${table} VALUES (?,?,?,?,?)`).run(randomUUID(),user,delta,reference,Date.now());
 const day=()=>new Date().toISOString().slice(0,10);
 const owned=(user:string)=>(sql.prepare('SELECT item_id FROM game_cosmetics WHERE user_id=? ORDER BY item_id').all(user) as {item_id:string}[]).map(r=>r.item_id);
 function job(id:string){const row=sql.prepare('SELECT * FROM game_jobs WHERE id=?').get(id) as JobRow|undefined;if(!row)fail(404,'依頼が見つかりません');return row!;}
 function present(row:JobRow,user:string):GameJob{
  const name=(id:string|null)=>id?(sql.prepare('SELECT display_name AS name FROM users WHERE id=?').get(id) as {name:string}|undefined)?.name||null:null;
  return {id:row.id,ownerId:row.owner_id,ownerName:name(row.owner_id)||'',workerId:row.worker_id,workerName:name(row.worker_id),title:row.title,description:row.description,reward:row.reward,state:row.state,delivery:(user===row.owner_id||user===row.worker_id)&&row.delivery?JSON.parse(row.delivery):null,createdAt:row.created_at,updatedAt:row.updated_at};
 }
 app.get('/api/economy',async req=>{
  const user=req.session!.userId,today='daily:'+day();
  const rows=sql.prepare("SELECT * FROM game_jobs j WHERE (state='open' OR owner_id=? OR worker_id=?) AND NOT EXISTS (SELECT 1 FROM user_moderation WHERE user_id=j.owner_id) ORDER BY updated_at DESC LIMIT 80").all(user,user) as JobRow[];
  return {coinHistory:(sql.prepare('SELECT id,delta,reference,created_at AS createdAt FROM game_coin_entries WHERE user_id=? ORDER BY created_at DESC,rowid DESC LIMIT 20').all(user) as {id:string;delta:number;reference:string;createdAt:number}[]).map(({reference,...row})=>({...row,kind:reference.startsWith('daily:')?'daily':reference.startsWith('shop:')?'shop':reference.startsWith('job:reserve:')?'job_reserve':reference.startsWith('job:refund:')?'job_refund':'job_reward'})),coins:balance('game_coin_entries',user),chips:balance('play_chip_entries',user),coinClaimed:!!sql.prepare('SELECT 1 FROM game_coin_entries WHERE user_id=? AND reference=?').get(user,today),chipClaimed:!!sql.prepare('SELECT 1 FROM play_chip_entries WHERE user_id=? AND reference=?').get(user,today),owned:owned(user),catalog:cosmeticCatalog,jobs:rows.filter(r=>r.owner_id===user||!blocked(user,r.owner_id)).map(r=>present(r,user)),rounds:sql.prepare('SELECT request_id AS requestId,choice,outcome,bet,net,created_at AS createdAt FROM arcade_rounds WHERE user_id=? ORDER BY created_at DESC LIMIT 10').all(user) as ArcadeRound[],arcadeEnabled:enabled(),realMoneyPurchases:false,cashOut:false};
 });
 for(const [path,table,amount]of [['coins','game_coin_entries',200],['chips','play_chip_entries',100]] as const)app.post('/api/economy/'+path+'/claim',rate,async(req)=>{
  z.object({}).strict().parse(req.body);if(path==='chips'&&!enabled())fail(409,'この遊びは公開準備中です');
  const user=req.session!.userId,reference='daily:'+day();sql.transaction(()=>{if(!sql.prepare(`SELECT 1 FROM ${table} WHERE user_id=? AND reference=?`).get(user,reference))entry(table,user,amount,reference);}).immediate();return {balance:balance(table,user)};
 });
 app.post('/api/economy/shop',rate,async req=>{
  const {itemId}=z.object({itemId:z.enum(cosmeticCatalog.map(item=>item.id))}).strict().parse(req.body),user=req.session!.userId,item=cosmeticCatalog.find(i=>i.id===itemId)!;
  sql.transaction(()=>{if(owned(user).includes(itemId))return;if(balance('game_coin_entries',user)<item.cost)fail(409,'建築用コインが足りません');entry('game_coin_entries',user,-item.cost,'shop:'+itemId);sql.prepare('INSERT INTO game_cosmetics VALUES (?,?,?)').run(user,itemId,Date.now());}).immediate();return {owned:owned(user),coins:balance('game_coin_entries',user)};
 });
 app.post('/api/economy/jobs',rate,async req=>{
  const p=z.object({requestId:z.string().uuid(),title:z.string().trim().min(1).max(80),description:z.string().trim().min(1).max(800),reward:z.number().int().min(1).max(1000),consent:z.literal(true)}).strict().parse(req.body),user=req.session!.userId;
  return sql.transaction(()=>{
   const old=sql.prepare('SELECT * FROM game_jobs WHERE owner_id=? AND request_id=?').get(user,p.requestId) as JobRow|undefined;
   if(old){if(old.title!==p.title||old.description!==p.description||old.reward!==p.reward)fail(409,'同じ依頼操作の内容が変わっています');return present(old,user);}
   if((sql.prepare("SELECT COUNT(*) AS n FROM game_jobs WHERE owner_id=? AND state NOT IN ('completed','cancelled')").get(user) as {n:number}).n>=10)fail(409,'進行中の依頼は10件までです');
   if(balance('game_coin_entries',user)<p.reward)fail(409,'建築用コインが足りません');
   const id=randomUUID(),now=Date.now();entry('game_coin_entries',user,-p.reward,'job:reserve:'+id);sql.prepare("INSERT INTO game_jobs VALUES (?,?,NULL,?,?,?,'open',NULL,?,?,?)").run(id,user,p.title,p.description,p.reward,now,now,p.requestId);return present(job(id),user);
  }).immediate();
 });
 app.post('/api/economy/jobs/:id/action',rate,async req=>{
  const p=z.object({action:z.enum(['request','accept','decline','withdraw','submit','approve','cancel']),consent:z.boolean().optional(),delivery:z.object({note:z.string().trim().min(1).max(800),blueprint:buildingPiecesSchema.optional()}).strict().optional()}).strict().parse(req.body),user=req.session!.userId;
  return sql.transaction(()=>{
   const r=job((req.params as {id:string}).id),owner=r.owner_id===user,worker=r.worker_id===user;
   if(sql.prepare('SELECT 1 FROM user_moderation WHERE user_id=?').get(r.owner_id))fail(403,'この依頼は現在利用できません');
   if(p.action==='request'){
    if(owner||r.state!=='open'||blocked(user,r.owner_id)||p.consent!==true)fail(409,'この依頼には参加できません');
    sql.prepare("UPDATE game_jobs SET worker_id=?,state='requested',updated_at=? WHERE id=?").run(user,Date.now(),r.id);
   }else if(p.action==='accept'||p.action==='decline'){
    if(!owner||r.state!=='requested'||!r.worker_id||blocked(user,r.worker_id))fail(403,'依頼の承認権限を確認してください');
    if(p.action==='accept')sql.prepare("UPDATE game_jobs SET state='assigned',updated_at=? WHERE id=?").run(Date.now(),r.id);
    else sql.prepare("UPDATE game_jobs SET state='open',worker_id=NULL,updated_at=? WHERE id=?").run(Date.now(),r.id);
   }else if(p.action==='withdraw'){
    if(!worker||!['requested','assigned'].includes(r.state))fail(403,'この依頼から辞退できません');sql.prepare("UPDATE game_jobs SET state='open',worker_id=NULL,delivery=NULL,updated_at=? WHERE id=?").run(Date.now(),r.id);
   }else if(p.action==='submit'){
    if(!worker||r.state!=='assigned'||!p.delivery||blocked(user,r.owner_id))fail(403,'この依頼には提出できません');sql.prepare("UPDATE game_jobs SET state='submitted',delivery=?,updated_at=? WHERE id=?").run(JSON.stringify(p.delivery),Date.now(),r.id);
   }else if(p.action==='approve'){
    if(!owner)fail(403,'依頼の承認権限を確認してください');if(r.state==='completed')return present(r,user);if(r.state!=='submitted'||!r.worker_id)fail(409,'提出後に完了を承認してください');
    entry('game_coin_entries',r.worker_id!,r.reward,'job:reward:'+r.id);sql.prepare("UPDATE game_jobs SET state='completed',updated_at=? WHERE id=?").run(Date.now(),r.id);
   }else{
    if(!owner)fail(403,'依頼の承認権限を確認してください');if(r.state==='cancelled')return present(r,user);if(!['open','requested'].includes(r.state))fail(409,'作業前の依頼だけ取り消せます');entry('game_coin_entries',user,r.reward,'job:refund:'+r.id);sql.prepare("UPDATE game_jobs SET state='cancelled',worker_id=NULL,updated_at=? WHERE id=?").run(Date.now(),r.id);
   }
   return present(job(r.id),user);
  }).immediate();
 });
 app.post('/api/economy/arcade/round',rate,async req=>{
  if(!enabled())fail(409,'この遊びは公開準備中です');
  const p=z.object({requestId:z.string().uuid(),choice:z.enum(['sun','moon']),bet:z.number().int().min(1).max(20)}).strict().parse(req.body),user=req.session!.userId;
  return sql.transaction(()=>{
   const old=sql.prepare('SELECT request_id AS requestId,choice,outcome,bet,net,created_at AS createdAt FROM arcade_rounds WHERE user_id=? AND request_id=?').get(user,p.requestId) as ArcadeRound|undefined;
   if(old){if(old.choice!==p.choice||old.bet!==p.bet)fail(409,'同じ遊びの内容が変わっています');return old;}
   if(balance('play_chip_entries',user)<p.bet)fail(409,'遊び用チップが足りません');
   const outcome=randomInt(2)===0?'sun':'moon',net=outcome===p.choice?p.bet:-p.bet,now=Date.now();entry('play_chip_entries',user,net,'round:'+p.requestId);sql.prepare('INSERT INTO arcade_rounds VALUES (?,?,?,?,?,?,?)').run(user,p.requestId,p.choice,outcome,p.bet,net,now);return {requestId:p.requestId,choice:p.choice,outcome,bet:p.bet,net,createdAt:now};
  }).immediate();
 });
}
