import {test,expect,type Page} from '@playwright/test';
import {resolve} from 'node:path';
import {createApp} from '../../server/app';
import {t,tr,type Locale} from '../../src/i18n';
let instance:Awaited<ReturnType<typeof createApp>>,origin:string;
const roomInput={title:'Our little workshop',description:'Keep the old room',isPublic:true,theme:'garden',items:[],decorations:[{kind:'tree',x:700,y:800}]};
const piece={x:2,y:2,z:0,kind:'wall',color:'cream',rotation:0};
const mutate=(p:Page,path:string,data:object,method='POST')=>p.request.fetch('/api'+path,{method,headers:{'X-Walk-Client':'1'},data});
test.beforeEach(async()=>{instance=await createApp({database:':memory:',adminKey:'building-economy-browser-key'});await instance.app.register(import('@fastify/static'),{root:resolve('dist')});origin=await instance.app.listen({host:'127.0.0.1',port:0});});
test.afterEach(async()=>{instance.io.disconnectSockets(true);await instance.app.close();});
async function onboard(p:Page,locale:Locale,name='Game resident'){await p.goto('/');await p.getByLabel(t('ニックネーム',locale),{exact:true}).fill(name);await p.getByRole('button',{name:t('WALKをはじめる',locale),exact:true}).click();await expect(p.getByRole('application')).toHaveAttribute('data-ready','true');}
async function rooms(p:Page,locale:Locale){await p.locator('.quick-discovery').getByRole('button',{name:new RegExp(t('ルームを探す',locale))}).click();return p.getByRole('dialog',{name:t('みんなのルーム',locale),exact:true});}
async function build(p:Page,locale:Locale){const r=await rooms(p,locale);await r.getByRole('button',{name:t('建築する',locale),exact:true}).click();return p.getByRole('dialog',{name:t('小さな建築工房',locale),exact:true});}
async function fit(p:Page){expect(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);for(const dialog of await p.getByRole('dialog').all())expect(await dialog.evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true);}
for(const [device,locale]of [['en-US','en'],['zh-CN','zh-Hans'],['zh-TW','zh-Hant']] as const)test('mobile building saves, exports and restores while preserving the old room in '+device,async({browser})=>{
 const context=await browser.newContext({baseURL:origin,locale:device,viewport:{width:320,height:844},isMobile:true,hasTouch:true}),p=await context.newPage();
 try{
  await onboard(p,locale);const created=await mutate(p,'/rooms',roomInput);expect(created.status()).toBe(200);const id=(await created.json()).id;let d=await build(p,locale);
  const cell=(x:number,y:number,z:number)=>d.getByRole('gridcell',{name:tr('マス {x}, {y}・高さ {z}',{x,y,z},locale),exact:true});
  await expect(cell(6,9,0)).toBeDisabled();await cell(3,3,0).click();await d.getByRole('button',{name:t('ひとつ戻す',locale),exact:true}).click();await expect(cell(3,3,0)).toHaveAttribute('aria-selected','false');await d.getByRole('button',{name:t('やり直す',locale),exact:true}).click();await expect(cell(3,3,0)).toHaveAttribute('aria-selected','true');
  await d.getByLabel(t('建築の高さ',locale),{exact:true}).selectOption('2');await d.getByRole('button',{name:t('屋根',locale),exact:true}).click();await cell(3,3,2).click();
  const download=p.waitForEvent('download');await d.getByRole('button',{name:t('設計図を保存',locale),exact:true}).click();const file=await download;expect(file.suggestedFilename()).toBe('walk-data.json');
  await d.getByRole('button',{name:t('建築を保存',locale),exact:true}).click();await expect(d.getByText(t('保存した建築です',locale),{exact:false})).toBeVisible();const saved=await(await p.request.get('/api/rooms/'+id)).json();expect(saved.build.pieces).toHaveLength(2);expect(saved.decorations).toEqual(roomInput.decorations);
  await fit(p);await p.screenshot({path:'artifacts/building-'+device+'-320.png',animations:'disabled'});
  await d.getByRole('button',{name:t('閉じる',locale),exact:true}).click();await p.getByRole('dialog',{name:t('みんなのルーム',locale),exact:true}).getByRole('button',{name:t('閉じる',locale),exact:true}).click();await p.reload();await expect(p.getByRole('application')).toHaveAttribute('data-ready','true');d=await build(p,locale);
  await d.locator('.building-history>button').first().click();await d.getByRole('button',{name:t('この履歴へ復元',locale),exact:true}).click();await expect.poll(async()=>(await(await p.request.get('/api/rooms/'+id)).json()).build.pieces.length).toBe(0);await fit(p);
 }finally{await context.close();}
});
test('a visitor sees published building updates but cannot edit or inspect private history',async({browser})=>{
 const ca=await browser.newContext({baseURL:origin,locale:'en-US',viewport:{width:390,height:844}}),cb=await browser.newContext({baseURL:origin,locale:'en-US',viewport:{width:320,height:844}}),a=await ca.newPage(),b=await cb.newPage();
 try{
  await onboard(a,'en','Builder');await onboard(b,'en','Visitor');const id=(await(await mutate(a,'/rooms',roomInput)).json()).id;
  const visitor=await rooms(b,'en');await expect(visitor.getByRole('button',{name:'Build',exact:true})).toHaveCount(0);await visitor.getByRole('button',{name:t('訪問する','en'),exact:true}).click();await expect(b.locator('.map-top')).toContainText(roomInput.title);
  const d=await build(a,'en');await d.getByRole('gridcell',{name:'Cell 3, 3, height 0',exact:true}).click();await d.getByRole('button',{name:'Save build',exact:true}).click();await expect(b.getByTestId('building-pieces')).toHaveText('This room has 1 building pieces.');
  expect((await mutate(b,'/rooms/'+id+'/build',{revision:1,requestId:crypto.randomUUID(),pieces:[]},'PUT')).status()).toBe(403);expect((await b.request.get('/api/rooms/'+id+'/build/history')).status()).toBe(403);await fit(b);
 }finally{await ca.close();await cb.close();}
});
test('a lost building acknowledgement retries the same request without duplicating history',async({browser})=>{
 const context=await browser.newContext({baseURL:origin,locale:'en-US',viewport:{width:320,height:844}}),p=await context.newPage();const requests:unknown[]=[];let lose=true;
 try{
  await onboard(p,'en');const id=(await(await mutate(p,'/rooms',roomInput)).json()).id,d=await build(p,'en');await d.getByRole('gridcell',{name:'Cell 3, 3, height 0',exact:true}).click();
  await p.route('**/api/rooms/'+id+'/build',async route=>{requests.push(route.request().postDataJSON());if(!lose)return route.continue();lose=false;const r=await route.fetch();expect(r.status()).toBe(200);return route.abort('connectionreset');});
  await d.getByRole('button',{name:'Save build',exact:true}).click();await expect(d.getByRole('alert')).toBeVisible();await expect(d.getByRole('gridcell',{name:'Cell 3, 3, height 0',exact:true})).toBeDisabled();
  await d.getByRole('button',{name:'Save build',exact:true}).click();await expect(d.getByText('This build is saved.',{exact:false})).toBeVisible();expect(requests).toHaveLength(2);expect(requests[0]).toEqual(requests[1]);expect((await(await p.request.get('/api/rooms/'+id+'/build/history')).json())).toHaveLength(1);await fit(p);
 }finally{await context.close();}
});
test('two residents complete an approved game request, unlock a material and play with separate free chips',async({browser})=>{
 const ca=await browser.newContext({baseURL:origin,locale:'en-US',viewport:{width:390,height:844}}),cb=await browser.newContext({baseURL:origin,locale:'en-US',viewport:{width:320,height:844}}),a=await ca.newPage(),b=await cb.newPage();
 try{
  await onboard(a,'en','Requester');await onboard(b,'en','Maker');for(const p of [a,b])await p.locator('.quick-discovery').getByRole('button',{name:'Life & coins',exact:true}).click();
  const da=a.getByRole('dialog',{name:'Life & coins',exact:true}),db=b.getByRole('dialog',{name:'Life & coins',exact:true});await da.getByRole('button',{name:"Claim today's 200 coins",exact:true}).click();
  for(const d of [da,db])await d.getByRole('button',{name:'Resident requests',exact:true}).click();await da.getByLabel('Request title',{exact:true}).fill('A tiny room blueprint');await da.getByLabel('Request details',{exact:true}).fill('Please make a blueprint inside WALK.');await da.getByLabel('Coin reward',{exact:true}).fill('60');await da.getByLabel('I agree to show my name when posting this in-game request.',{exact:true}).check();await da.getByRole('button',{name:'Reserve coins and post',exact:true}).click();
  const owned=da.locator('.game-jobs article').filter({hasText:'A tiny room blueprint'}),work=db.locator('.game-jobs article').filter({hasText:'A tiny room blueprint'});await expect(work).toBeVisible();await work.getByLabel('Share my name with the requester and ask to participate.',{exact:true}).check();await work.getByRole('button',{name:'Request to join',exact:true}).click();await owned.getByRole('button',{name:'Approve participant',exact:true}).click();
  await work.getByLabel('Work report',{exact:true}).fill('My game-only blueprint is ready.');await work.locator('input[type=file]').setInputFiles({name:'blueprint.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({format:'walk-blueprint-1',pieces:[piece]}))});await work.getByRole('button',{name:'Submit work',exact:true}).click();await owned.getByRole('button',{name:'Approve completion and pay coins',exact:true}).click();await expect(db.locator('.economy-balances')).toContainText('Building coins: 60');
  await db.getByRole('button',{name:'Material shop',exact:true}).click();await db.getByRole('button',{name:"Claim today's 200 coins",exact:true}).click();await db.locator('.cosmetic-grid article').filter({hasText:'Sakura material'}).getByRole('button',{name:'Unlock with coins',exact:true}).click();await expect(db.locator('.economy-balances')).toContainText('Building coins: 110');
  await db.getByRole('button',{name:'Star casino',exact:true}).click();await db.getByRole('button',{name:"Claim today's 100 chips",exact:true}).click();let lose=true;const rounds:unknown[]=[];await b.route('**/api/economy/arcade/round',async route=>{rounds.push(route.request().postDataJSON());if(!lose)return route.continue();lose=false;await route.fetch();return route.abort('connectionreset');});
  await db.getByRole('button',{name:'Play one round',exact:true}).click();await expect(db.getByRole('alert')).toBeVisible();await db.getByRole('button',{name:'Check this round again',exact:true}).click();await expect(db.locator('.arcade-result')).toBeVisible();expect(rounds).toHaveLength(2);expect(rounds[0]).toEqual(rounds[1]);await expect(db.locator('.economy-balances')).toContainText('Building coins: 110');expect(instance.store.sqlite.prepare('SELECT COUNT(*) AS n FROM arcade_rounds').get()).toEqual({n:1});await fit(a);await fit(b);await b.screenshot({path:'artifacts/game-economy-casino-320.png',animations:'disabled'});
 }finally{await ca.close();await cb.close();}
});

test('a confirmed request is not posted twice when refreshing the list fails',async({browser})=>{
 const context=await browser.newContext({baseURL:origin,locale:'en-US',viewport:{width:320,height:844}}),p=await context.newPage();
 try{
  await onboard(p,'en');await mutate(p,'/economy/coins/claim',{});await p.locator('.quick-discovery').getByRole('button',{name:'Life & coins',exact:true}).click();const d=p.getByRole('dialog',{name:'Life & coins',exact:true});await d.getByRole('button',{name:'Resident requests',exact:true}).click();await d.getByLabel('Request title',{exact:true}).fill('One confirmed request');await d.getByLabel('Request details',{exact:true}).fill('A game blueprint, only once.');await d.getByLabel('Coin reward',{exact:true}).fill('50');await d.getByLabel('I agree to show my name when posting this in-game request.',{exact:true}).check();
  let posts=0,failReads=true;await p.route('**/api/economy/jobs',route=>{posts++;return route.continue();});await p.route('**/api/economy',route=>failReads?route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'Temporary refresh outage'})}):route.continue());
  await d.getByRole('button',{name:'Reserve coins and post',exact:true}).click();await expect(d.getByRole('alert')).toBeVisible();await expect(d.getByLabel('Request title',{exact:true})).toBeDisabled();await d.getByRole('button',{name:'Check posted request',exact:true}).click();await expect(d.getByRole('alert')).toBeVisible();expect(posts).toBe(1);expect(instance.store.sqlite.prepare('SELECT COUNT(*) AS n FROM game_jobs').get()).toEqual({n:1});
  failReads=false;await d.getByRole('button',{name:'Check posted request',exact:true}).click();await expect(d.locator('.game-jobs article').filter({hasText:'One confirmed request'})).toBeVisible();expect(posts).toBe(1);await expect(d.locator('.economy-balances')).toContainText('Building coins: 150');await fit(p);
 }finally{await context.close();}
});
