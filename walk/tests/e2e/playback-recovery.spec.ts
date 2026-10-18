import {test,expect,type Page} from '@playwright/test';
import {resolve} from 'node:path';
import {createApp} from '../../server/app';
import {starterShorts} from '../../shared/starter-shorts';
import {curatedVideos} from '../../shared/curated-videos';
import {t,type Locale} from '../../src/i18n';
let instance:Awaited<ReturnType<typeof createApp>>,origin:string;
const film=starterShorts[0],media='**/films/walk-short-'+film.slug+'.mp4',key='playback-recovery-fixture-admin';
test.beforeEach(async()=>{instance=await createApp({database:':memory:',adminKey:key});await instance.app.register(import('@fastify/static'),{root:resolve('dist')});origin=await instance.app.listen({host:'127.0.0.1',port:0});});
test.afterEach(async()=>{instance.io.disconnectSockets(true);await instance.app.close();});
async function shelf(p:Page,locale:Locale){await p.goto('/');await p.getByRole('button',{name:t('まず動画を見てみる',locale),exact:true}).click();return p.getByRole('dialog',{name:t('今日の動画の棚',locale),exact:true});}
async function watch(p:Page,locale:Locale){const d=await shelf(p,locale);await d.getByRole('button',{name:t('WALKの動画',locale),exact:true}).click();await d.getByRole('button',{name:film.title+t('を見る',locale),exact:true}).click();await expect(p.locator('.post-detail h2')).toHaveText(film.title);}
async function fit(p:Page){expect(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);for(const dialog of await p.getByRole('dialog').all())expect(await dialog.evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true);}
for(const [device,locale] of [['en-US','en'],['zh-CN','zh-Hans'],['zh-TW','zh-Hant']] as const){
 test('blocked autoplay has a working explicit play action and stable layouts in '+device,async({browser})=>{
  const context=await browser.newContext({baseURL:origin,locale:device,viewport:{width:320,height:844},isMobile:true,hasTouch:true}),p=await context.newPage(),errors:string[]=[];p.on('pageerror',e=>errors.push(e.message));
  try{
   await p.addInitScript(()=>{const actual=HTMLMediaElement.prototype.play;let first=true;HTMLMediaElement.prototype.play=function(){if(first){first=false;return Promise.reject(new DOMException('Blocked for this test','NotAllowedError'));}return actual.call(this);};});
   await watch(p,locale);await expect(p.locator('.native-media')).toHaveAttribute('data-playback-state','blocked');const video=p.locator('.native-video');await video.evaluate(el=>{(el as HTMLVideoElement).muted=true;el.setAttribute('data-original-player','yes');});
   await p.getByRole('button',{name:t('タップして再生',locale),exact:true}).click();await expect.poll(()=>video.evaluate((el:HTMLVideoElement)=>el.currentTime)).toBeGreaterThan(.1);await expect(p.locator('.native-media')).toHaveAttribute('data-playback-state','ready');
   await p.getByRole('button',{name:t('箱庭と見る',locale),exact:true}).click();await expect(video).toHaveAttribute('data-original-player','yes');await p.getByRole('button',{name:t('大画面で見る',locale),exact:true}).click();await expect(video).toHaveAttribute('data-original-player','yes');
   await fit(p);expect(errors).toEqual([]);expect((await(await p.request.get('/api/bootstrap')).json()).user.shareActivity).toBe(false);
  }finally{await context.close();}
 });
}
test('a slow response offers another film, cancels its timer on navigation and moves the actual viewer',async({browser})=>{
 const context=await browser.newContext({baseURL:origin,locale:'en-US',viewport:{width:320,height:844}}),p=await context.newPage();let release=()=>{};
 try{
  const gate=new Promise<void>(r=>{release=r;});await p.route(media,async route=>{await gate;try{await route.continue();}catch{/* Closing the old player aborts its pending request. */}});
  const d=await shelf(p,'en');await p.clock.install();await d.getByRole('button',{name:'WALK videos',exact:true}).click();await d.getByRole('button',{name:film.title+t('を見る','en'),exact:true}).click();
  await expect(p.locator('.native-media')).toHaveAttribute('data-playback-state',/loading|buffering/);await p.clock.fastForward(12500);await expect(p.locator('.native-media')).toHaveAttribute('data-playback-state','slow');await fit(p);await p.screenshot({path:'artifacts/playback-slow-320.png',animations:'disabled'});
  await p.getByRole('button',{name:'Try another video',exact:true}).click();await expect(p.locator('.post-detail h2')).not.toHaveText(film.title);release();
  await expect.poll(()=>p.locator('.native-video').evaluate((el:HTMLVideoElement)=>el.readyState)).toBeGreaterThanOrEqual(2);await p.clock.fastForward(13000);await expect(p.locator('.native-media')).toHaveAttribute('data-playback-state','ready');await expect(p.locator('.viewing-box')).toContainText('1');await expect(p.locator('.viewer-avatars button')).toHaveCount(0);
 }finally{release();await context.close();}
});
test('a failed native video can be reported and replaced from the WALK shelf without changing privacy',async({browser})=>{
 const context=await browser.newContext({baseURL:origin,locale:'zh-TW',viewport:{width:320,height:844},isMobile:true,hasTouch:true}),p=await context.newPage();
 try{
  await p.route(media,r=>r.abort());await watch(p,'zh-Hant');await expect(p.locator('.native-media')).toHaveAttribute('data-playback-state','failed');await fit(p);
  await p.getByRole('button',{name:t('再生の問題を知らせる','zh-Hant'),exact:true}).click();const form=p.getByRole('dialog',{name:t('再生の問題を知らせる','zh-Hant'),exact:true});await form.getByLabel(t('再生の状況','zh-Hant'),{exact:true}).fill('裝置上無法載入，這是測試回報。');await form.getByRole('button',{name:t('運営へ送る','zh-Hant'),exact:true}).click();await expect(form).toHaveCount(0);
  expect(instance.store.sqlite.prepare('SELECT target_id,reason FROM reports').get()).toEqual({target_id:'walk-short-'+film.slug,reason:'裝置上無法載入，這是測試回報。'});
  await p.getByRole('button',{name:t('WALKの動画から選ぶ','zh-Hant'),exact:true}).click();const d=p.getByRole('dialog',{name:t('今日の動画の棚','zh-Hant'),exact:true});await expect(d.getByRole('button',{name:t('WALKの動画','zh-Hant'),exact:true})).toHaveAttribute('aria-pressed','true');await expect(d.locator('.discovery-video')).toHaveCount(13);
  await d.getByRole('button',{name:starterShorts[1].title+t('を見る','zh-Hant'),exact:true}).click();await expect.poll(()=>p.locator('.native-video').evaluate((el:HTMLVideoElement)=>el.readyState)).toBeGreaterThanOrEqual(2);expect((await(await p.request.get('/api/bootstrap')).json()).user.shareActivity).toBe(false);
 }finally{await context.close();}
});
test('a failed private-room video keeps recovery controls inside the screen on phones',async({browser})=>{
 const context=await browser.newContext({baseURL:origin,locale:'en-US',viewport:{width:320,height:844}}),p=await context.newPage();
 try{
  await p.route(media,r=>r.abort());await watch(p,'en');await p.getByRole('button',{name:t('自分の窓辺に置く','en'),exact:true}).click();await p.getByRole('dialog',{name:t('自分の窓辺に置く','en'),exact:true}).getByRole('button',{name:t('保存して窓辺で開く','en'),exact:true}).click();
  await expect(p.getByTestId('room-interior')).toBeVisible();const status=p.locator('.in-room .playback-status'),retry=status.getByRole('button',{name:t('動画を読み直す','en'),exact:true});await retry.scrollIntoViewIfNeeded();
  const screen=(await p.locator('.in-room .room-player-content').boundingBox())!,button=(await retry.boundingBox())!;expect(button.y).toBeGreaterThanOrEqual(screen.y);expect(button.y+button.height).toBeLessThanOrEqual(screen.y+screen.height+1);expect(button.height).toBeGreaterThanOrEqual(44);await fit(p);
  await p.unroute(media);await retry.click();await expect.poll(()=>p.locator('.native-video').evaluate((el:HTMLVideoElement)=>el.readyState)).toBeGreaterThanOrEqual(2);await expect(status).toHaveCount(0);
 }finally{await context.close();}
});
test('official-player help offers a WALK fallback without claiming external playback or joining a group',async({browser})=>{
 const context=await browser.newContext({baseURL:origin,locale:'en-US',viewport:{width:320,height:844}}),p=await context.newPage();
 try{
  await p.route('https://player.bilibili.com/**',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><p>Provider boundary fixture, not a playing video.</p>'}));
  const d=await shelf(p,'en');await d.getByRole('button',{name:curatedVideos[0].title+t('を見る','en'),exact:true}).click();await p.getByRole('button',{name:t('bilibili公式プレーヤーを開く','en'),exact:true}).click();await p.getByText(t('再生できないとき','en'),{exact:true}).click();
  await p.getByRole('button',{name:'Choose a WALK video',exact:true}).click();await expect(p.getByRole('dialog',{name:t('今日の動画の棚','en'),exact:true}).getByRole('button',{name:'WALK videos',exact:true})).toHaveAttribute('aria-pressed','true');await expect(p.getByTestId('together-controls')).toHaveCount(0);await fit(p);
 }finally{await context.close();}
});
