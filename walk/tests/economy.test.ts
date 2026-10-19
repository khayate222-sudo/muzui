import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {randomUUID} from 'node:crypto';
import {createApp} from '../server/app';
let instance:Awaited<ReturnType<typeof createApp>>,a:string,b:string,c:string;
const req=(cookie:string,path:string,body?:object)=>instance.app.inject({url:'/api'+path,method:body?'POST':'GET',headers:{cookie,'x-walk-client':'1'},payload:body});
const state=async(cookie=a)=>(await req(cookie,'/economy')).json();
const claim=(cookie=a)=>req(cookie,'/economy/coins/claim',{});
const create=(reward=60,requestId=randomUUID())=>req(a,'/economy/jobs',{requestId,title:'A blueprint for my room',description:'Game-only creative help',reward,consent:true});
const act=(cookie:string,id:string,action:string,extra={})=>req(cookie,'/economy/jobs/'+id+'/action',{action,...extra});
beforeEach(async()=>{instance=await createApp({database:':memory:',adminKey:'economy-test-only-admin-key'});const cookies=[];for(let n=0;n<3;n++)cookies.push((await req('','/bootstrap')).headers['set-cookie']!.toString().split(';')[0]);[a,b,c]=cookies;});
afterEach(async()=>{vi.unstubAllEnvs();await instance.app.close();});
it('starts at zero, gives one server-day grant and keeps coin and chip balances separate',async()=>{
 expect(await state()).toMatchObject({coins:0,chips:0,cashOut:false,realMoneyPurchases:false});
 const results=await Promise.all([claim(),claim(),claim()]);expect(results.every(r=>r.statusCode===200)).toBe(true);expect((await state()).coins).toBe(200);
 await req(a,'/economy/chips/claim',{});await req(a,'/economy/chips/claim',{});expect(await state()).toMatchObject({coins:200,chips:100,coinClaimed:true,chipClaimed:true});expect((await state(b)).coins).toBe(0);
 expect((await req(a,'/economy/coins/claim',{amount:9999})).statusCode).toBe(400);
});
it('charges server catalog prices only once and prevents overspending, cash-out and chip purchases',async()=>{
 await claim();const buys=await Promise.all([req(a,'/economy/shop',{itemId:'sakura'}),req(a,'/economy/shop',{itemId:'sakura'})]);expect(buys.every(r=>r.statusCode===200)).toBe(true);expect(await state()).toMatchObject({coins:50,owned:['sakura']});
 expect((await req(a,'/economy/shop',{itemId:'midnight'})).statusCode).toBe(409);expect((await req(a,'/economy/shop',{itemId:'copper',price:0})).statusCode).toBe(400);expect((await req(a,'/economy/shop',{itemId:'chips'})).statusCode).toBe(400);
 expect((await req(a,'/economy/cash-out',{amount:10})).statusCode).toBe(404);expect((await req(a,'/economy/transfer',{targetId:'someone',amount:10})).statusCode).toBe(404);
});
it('reserves an offered reward once and pays only the assigned worker after separate approval',async()=>{
 await claim();const requestId=randomUUID(),created=await create(60,requestId);expect(created.statusCode,created.body).toBe(200);const job=created.json();expect((await create(60,requestId)).json().id).toBe(job.id);expect((await create(61,requestId)).statusCode).toBe(409);expect((await state()).coins).toBe(140);
 expect((await act(a,job.id,'request',{consent:true})).statusCode).toBe(409);expect((await act(b,job.id,'request',{consent:false})).statusCode).toBe(409);expect((await act(b,job.id,'request',{consent:true})).statusCode).toBe(200);
 expect((await act(c,job.id,'accept')).statusCode).toBe(403);expect((await act(b,job.id,'submit',{delivery:{note:'Premature'}})).statusCode).toBe(403);
 expect((await act(a,job.id,'accept')).json().state).toBe('assigned');expect((await act(a,job.id,'approve')).statusCode).toBe(409);
 expect((await act(b,job.id,'submit',{delivery:{note:'My private submission',blueprint:[]}})).json().state).toBe('submitted');expect((await state(c)).jobs).toEqual([]);expect((await state()).jobs[0].delivery.note).toBe('My private submission');
 expect((await act(c,job.id,'approve')).statusCode).toBe(403);expect((await act(a,job.id,'approve')).json().state).toBe('completed');await act(a,job.id,'approve');expect((await state(b)).coins).toBe(60);expect((await state()).coins).toBe(140);expect((await act(a,job.id,'cancel')).statusCode).toBe(409);
});
it('refunds cancellation once, supports declining or withdrawing, and respects blocks',async()=>{
 await claim();const j=(await create()).json();await act(b,j.id,'request',{consent:true});await act(a,j.id,'decline');await act(b,j.id,'request',{consent:true});await act(a,j.id,'accept');expect((await act(a,j.id,'cancel')).statusCode).toBe(409);await act(b,j.id,'withdraw');await act(a,j.id,'cancel');await act(a,j.id,'cancel');expect((await state()).coins).toBe(200);
 const next=(await create()).json();const id=(await req(a,'/bootstrap')).json().user.id;await instance.app.inject({url:'/api/blocks/'+id,method:'PUT',headers:{cookie:b,'x-walk-client':'1'},payload:{blocked:true}});expect((await state(b)).jobs).toEqual([]);expect((await act(b,next.id,'request',{consent:true})).statusCode).toBe(409);
});
it('resolves a simulated round on the server, retries identically and never changes building coins',async()=>{
 await claim();await req(a,'/economy/chips/claim',{});const request={requestId:randomUUID(),choice:'sun',bet:20};const one=await req(a,'/economy/arcade/round',request);expect(one.statusCode).toBe(200);const r=one.json();expect(r.net).toBe(r.outcome==='sun'?20:-20);
 expect((await req(a,'/economy/arcade/round',request)).json()).toEqual(r);expect(await state()).toMatchObject({coins:200,chips:100+r.net});expect((await state()).rounds).toHaveLength(1);
 expect((await req(a,'/economy/arcade/round',{...request,choice:'moon'})).statusCode).toBe(409);expect((await req(a,'/economy/arcade/round',{...request,requestId:randomUUID(),bet:21})).statusCode).toBe(400);expect((await req(b,'/economy/arcade/round',{...request,requestId:randomUUID()})).statusCode).toBe(409);
});
it('keeps the simulated casino off by default in public mode without assuming an audience age',async()=>{
 vi.stubEnv('WALK_PUBLIC_RELEASE','true');vi.stubEnv('WALK_ARCADE_ENABLED','false');expect((await state()).arcadeEnabled).toBe(false);expect((await req(a,'/economy/chips/claim',{})).statusCode).toBe(409);expect((await req(a,'/economy/arcade/round',{requestId:randomUUID(),choice:'sun',bet:1})).statusCode).toBe(409);
});
it('protects guest coins, chips and request participation when switching to another account',async()=>{
 await claim();await req(b,'/economy/chips/claim',{});const j=(await create()).json();await act(c,j.id,'request',{consent:true});
 const d=(await req('','/bootstrap')).headers['set-cookie']!.toString().split(';')[0];const registered=await req(d,'/account/register',{handle:'economy_keeper',password:'long economy test password',accepted:true,policyVersion:'development-2026-10'});expect(registered.statusCode).toBe(200);
 for(const cookie of [a,b,c]){expect((await req(cookie,'/account')).json().guestHasData).toBe(true);expect((await req(cookie,'/auth/login',{handle:'economy_keeper',password:'long economy test password'})).statusCode).toBe(409);}
 expect((await state()).coins).toBe(140);expect((await state(b)).chips).toBe(100);expect((await state(c)).jobs[0].state).toBe('requested');
});
it('exports only own balances and clears deleted worker submissions while returning the request to open',async()=>{
 await claim();await claim(b);const j=(await create()).json();await act(b,j.id,'request',{consent:true});await act(a,j.id,'accept');await act(b,j.id,'submit',{delivery:{note:'Delete my private work'}});
 const exported=(await req(b,'/account/export',{})).json();expect(exported.gameCoins).toHaveLength(1);expect(exported.gameJobs[0].delivery).toContain('Delete my private work');
 await req(b,'/account/delete',{confirm:'DELETE'});const current=(await state()).jobs[0];expect(current).toMatchObject({state:'open',workerId:null,delivery:null});await act(a,j.id,'cancel');expect((await state()).coins).toBe(200);
 const live=(await req(a,'/bootstrap')).json().user.id;await req(a,'/account/delete',{confirm:'DELETE'});expect(instance.store.sqlite.prepare('SELECT * FROM game_coin_entries WHERE user_id=?').all(live)).toEqual([]);expect(instance.store.sqlite.prepare('SELECT * FROM game_jobs').all()).toEqual([]);expect(instance.store.sqlite.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
});

it('shows only the owners real coin entries and charges a permanent catalog unlock once',async()=>{
 await claim();await req(a,'/economy/shop',{itemId:'armchair'});const mine=await state();expect(mine.coins).toBe(0);expect(mine.coinHistory.map((e:{kind:string;delta:number})=>[e.kind,e.delta])).toEqual([['shop',-200],['daily',200]]);expect(mine.coinHistory.every((e:{reference?:string})=>!e.reference)).toBe(true);expect((await state(b)).coinHistory).toEqual([]);
 expect(mine.catalog.filter((i:{kind?:string})=>i.kind)).toHaveLength(10);expect((await req(a,'/economy/shop',{itemId:'armchair'})).statusCode).toBe(200);expect((await state()).coinHistory).toHaveLength(2);expect((await req(a,'/economy/shop',{itemId:'arch'})).statusCode).toBe(409);
});
