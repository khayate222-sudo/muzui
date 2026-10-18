import {test,expect,type Page} from '@playwright/test';
import {resolve} from 'node:path';
import {createApp} from '../../server/app';
import {t,type Locale} from '../../src/i18n';
const key='connection-browser-fixture-key';
let instance:Awaited<ReturnType<typeof createApp>>,origin:string;
test.beforeEach(async()=>{
  instance=await createApp({database:':memory:',adminKey:key});
  await instance.app.register(import('@fastify/static'),{root:resolve('dist')});
  origin=await instance.app.listen({host:'127.0.0.1',port:0});
});
test.afterEach(async()=>{instance.io.disconnectSockets(true);await instance.app.close();});
const cases:[string,Locale,'offline'|'html'|'json'][]=[['en-US','en','offline'],['zh-CN','zh-Hans','html'],['zh-TW','zh-Hant','json']];
const fit=async(p:Page)=>{
 expect(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 for(const modal of await p.getByRole('dialog').all())expect(await modal.evaluate(el=>({width:el.clientWidth,scrollWidth:el.scrollWidth,scrollLeft:el.scrollLeft}))).toMatchObject({scrollLeft:0});
 for(const modal of await p.getByRole('dialog').all())expect(await modal.evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true);
};
async function onboard(p:Page,locale:Locale){await p.goto('/');await p.getByLabel(t('ニックネーム',locale),{exact:true}).fill('Network guest');await p.getByRole('button',{name:t('WALKをはじめる',locale),exact:true}).click();await expect(p.getByRole('application')).toHaveAttribute('data-ready','true');}
async function compose(p:Page,locale:Locale){await p.locator('.quick-discovery').getByRole('button',{name:t('＋ WALKに投稿',locale),exact:true}).click();return p.getByRole('dialog',{name:t('WALKに投稿する',locale),exact:true});}
for(const [device,locale,mode] of cases){
 test('initial connection retry keeps the existing identity and document in '+device,async({browser})=>{
  const context=await browser.newContext({baseURL:origin,locale:device,viewport:{width:320,height:844}}),p=await context.newPage();let fail=true,bootCalls=0;
  try{
   const original=await(await p.request.get('/api/bootstrap')).json(),userCount=instance.store.sqlite.prepare('SELECT COUNT(*) AS n FROM users').get();
   await p.route('**/api/bootstrap',async r=>{bootCalls++;if(!fail)return r.continue();if(mode==='offline')return r.abort('internetdisconnected');return r.fulfill({status:mode==='html'?503:200,contentType:mode==='html'?'text/html':'application/json',body:mode==='html'?'<html>private-proxy-diagnostic-do-not-show</html>':'{}'});});
   await p.goto('/');await expect(p.locator('.auth-gate')).toBeVisible();await expect(p.locator('.auth-gate')).not.toContainText('private-proxy');await expect(p.locator('.auth-gate')).not.toContainText('Unexpected token');
   await expect(p.getByRole('button',{name:t('新しいゲストとして始める',locale),exact:true})).toHaveCount(0);
   await p.evaluate(()=>document.documentElement.dataset.recoveryDocument='same');fail=false;
   await p.getByRole('button',{name:t('もう一度接続する',locale),exact:true}).click();await expect(p.locator('.profile-form')).toBeVisible();
   await expect(p.locator('html')).toHaveAttribute('data-recovery-document','same');expect((await(await p.request.get('/api/bootstrap')).json()).user.id).toBe(original.user.id);expect(instance.store.sqlite.prepare('SELECT COUNT(*) AS n FROM users').get()).toEqual(userCount);expect(bootCalls).toBeGreaterThanOrEqual(2);await fit(p);
  }finally{await context.close();}
 });
 test('offline publishing preserves the draft and waits for an explicit retry in '+device,async({browser})=>{
  const context=await browser.newContext({baseURL:origin,locale:device,viewport:{width:320,height:844}}),p=await context.newPage();let posts=0;
  try{
   await onboard(p,locale);const before=await(await p.request.get('/api/bootstrap')).json(),form=await compose(p,locale),title='Network draft $& {count}',body='保留这段文字 · Keep this text';
   await form.getByLabel(t('投稿タイトル',locale),{exact:true}).fill(title);await form.getByLabel(t('本文',locale),{exact:true}).fill(body);await form.evaluate(el=>el.setAttribute('data-same-draft','yes'));
   await p.route('**/api/posts',r=>{if(r.request().method()==='POST')posts++;return r.continue();});
   await context.setOffline(true);await expect(p.locator('.connection-notice')).toBeAttached();
   await form.getByRole('button',{name:t('広場に公開する',locale),exact:true}).click();await expect(form.getByRole('alert')).toContainText(t('結果を確認できませんでした。保存されている可能性があります。接続が戻ったら状態を確認してから操作してください。',locale));
   await expect(form).toHaveAttribute('data-same-draft','yes');await expect(form.getByLabel(t('投稿タイトル',locale),{exact:true})).toHaveValue(title);await expect(form.getByLabel(t('本文',locale),{exact:true})).toHaveValue(body);
   const attempts=posts;await context.setOffline(false);await expect(p.locator('.connection-notice')).toHaveCount(0);await expect(p.locator('.connection')).toHaveClass(/is-live/);expect(posts).toBe(attempts);
   expect(instance.store.sqlite.prepare('SELECT COUNT(*) AS n FROM posts WHERE title=?').get(title)).toEqual({n:0});await expect(form).toHaveAttribute('data-same-draft','yes');
   await form.getByRole('button',{name:t('広場に公開する',locale),exact:true}).click();await expect(form).toHaveCount(0);await expect(p.locator('.post-detail h2')).toHaveText(title);expect(posts).toBe(attempts+1);
   const after=await(await p.request.get('/api/bootstrap')).json();expect(after.user.id).toBe(before.user.id);expect(after.user.shareActivity).toBe(false);expect(after.posts.filter((post:{title:string})=>post.title===title)).toHaveLength(1);await fit(p);
  }finally{await context.setOffline(false);await context.close();}
 });
}
test('a confirmed post whose refresh fails is reopened without a second publication',async({browser})=>{
 const context=await browser.newContext({baseURL:origin,locale:'en-US',viewport:{width:320,height:844}}),p=await context.newPage();let broken=false,posts=0;
 try{
  await onboard(p,'en');const before=await(await p.request.get('/api/bootstrap')).json(),form=await compose(p,'en'),title='Confirmed, only once';await form.getByLabel('Post title',{exact:true}).fill(title);await form.getByLabel(t('本文','en'),{exact:true}).fill('Already acknowledged');
  await p.route('**/api/bootstrap',r=>broken?r.fulfill({status:503,contentType:'text/html',body:'<html>private-upstream-body</html>'}):r.continue());
  await p.route('**/api/posts',r=>{if(r.request().method()==='POST')posts++;return r.continue();});broken=true;
  await form.getByRole('button',{name:t('広場に公開する','en'),exact:true}).click();const reopen=form.getByRole('button',{name:'Open saved post',exact:true});await expect(reopen).toBeEnabled();await expect(form.getByLabel('Post title',{exact:true})).toBeDisabled();await expect(form).not.toContainText('private-upstream-body');expect(posts).toBe(1);
  expect(instance.store.sqlite.prepare('SELECT COUNT(*) AS n FROM posts WHERE title=?').get(title)).toEqual({n:1});await fit(p);await p.screenshot({path:'artifacts/connection-saved-post-320.png',animations:'disabled'});
  broken=false;await reopen.click();await expect(form).toHaveCount(0);await expect(p.locator('.post-detail h2')).toHaveText(title);expect(posts).toBe(1);expect((await(await p.request.get('/api/bootstrap')).json()).user.id).toBe(before.user.id);
 }finally{await context.close();}
});
test('an HTML 401 still requires session recovery and never creates a replacement guest',async({browser})=>{
 const context=await browser.newContext({baseURL:origin,locale:'en-US',viewport:{width:320,height:844}}),p=await context.newPage();let denied=true,guestRequests=0;
 try{
  const original=await(await p.request.get('/api/bootstrap')).json(),before=await context.cookies();
  await p.route('**/api/bootstrap',r=>denied?r.fulfill({status:401,contentType:'text/html',body:'<html>not a JSON authentication response</html>'}):r.continue());
  await p.route('**/api/auth/guest',r=>{guestRequests++;return r.continue();});
  await p.goto('/');await expect(p.getByRole('button',{name:t('ログイン・復旧する','en'),exact:true})).toBeVisible();await expect(p.getByRole('button',{name:t('新しいゲストとして始める','en'),exact:true})).toBeVisible();expect(guestRequests).toBe(0);expect((await context.cookies()).find(c=>c.name==='walk_session')?.value).toBe(before.find(c=>c.name==='walk_session')?.value);
  denied=false;await p.getByRole('button',{name:t('もう一度接続する','en'),exact:true}).click();await expect(p.locator('.profile-form')).toBeVisible();expect((await(await p.request.get('/api/bootstrap')).json()).user.id).toBe(original.user.id);expect(guestRequests).toBe(0);
 }finally{await context.close();}
});
test('a failed image upload can select the same file again without losing the draft',async({browser})=>{
 const context=await browser.newContext({baseURL:origin,locale:'zh-TW',viewport:{width:320,height:844}}),p=await context.newPage();let uploads=0;
 try{
  await onboard(p,'zh-Hant');const form=await compose(p,'zh-Hant');await form.getByLabel(t('投稿タイトル','zh-Hant'),{exact:true}).fill('同じ写真で再試行');
  await p.route('**/api/uploads',r=>{uploads++;return uploads===1?r.fulfill({status:503,contentType:'text/html',body:'<html>proxy diagnostic</html>'}):r.continue();});
  const file={name:'same-photo.png',mimeType:'image/png',buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aN1cAAAAASUVORK5CYII=','base64')};
  await form.locator('input[type=file]').setInputFiles(file);await expect(p.locator('.toast')).toContainText('內容可能已儲存');await expect(form.getByLabel(t('投稿タイトル','zh-Hant'),{exact:true})).toHaveValue('同じ写真で再試行');
  await form.locator('input[type=file]').setInputFiles(file);await expect(form.getByRole('img',{name:t('添付プレビュー','zh-Hant'),exact:true})).toBeVisible();expect(uploads).toBe(2);
  await form.getByRole('button',{name:t('広場に公開する','zh-Hant'),exact:true}).click();await expect(p.locator('.post-detail h2')).toHaveText('同じ写真で再試行');await expect(p.locator('.post-detail .detail-image')).toBeVisible();await fit(p);
 }finally{await context.close();}
});
test('a post saved before realtime reconnect stays recoverable until its visit succeeds',async({browser})=>{
 const context=await browser.newContext({baseURL:origin,locale:'en-US',viewport:{width:320,height:844}}),p=await context.newPage();let posts=0;
 try{
  await onboard(p,'en');const form=await compose(p,'en'),title='Saved before socket reconnect';await form.getByLabel('Post title',{exact:true}).fill(title);
  await p.route('**/api/posts',r=>{if(r.request().method()==='POST')posts++;return r.continue();});
  await p.evaluate(()=>window.dispatchEvent(new Event('walk:background')));await expect(p.locator('.connection')).not.toHaveClass(/is-live/);
  await form.getByRole('button',{name:t('広場に公開する','en'),exact:true}).click();const reopen=form.getByRole('button',{name:'Open saved post',exact:true});await expect(reopen).toBeEnabled();await expect(form.getByRole('alert')).toContainText(t('接続が戻ってから投稿を開いてください','en'));expect(posts).toBe(1);await expect(form.getByLabel('Post title',{exact:true})).toBeDisabled();
  await p.evaluate(()=>window.dispatchEvent(new Event('walk:foreground')));await expect(p.locator('.connection')).toHaveClass(/is-live/);
  await reopen.click();await expect(form).toHaveCount(0);await expect(p.locator('.post-detail h2')).toHaveText(title);expect(posts).toBe(1);
 }finally{await context.close();}
});
test('a delayed old bootstrap cannot hide a newly published post',async({browser})=>{
 const context=await browser.newContext({baseURL:origin,locale:'en-US',viewport:{width:390,height:844}}),p=await context.newPage();let release=()=>{};
 try{
  await onboard(p,'en');const form=await compose(p,'en'),title='Newer than the delayed snapshot';await form.getByLabel('Post title',{exact:true}).fill(title);
  let reached=()=>{},hold=true;const reachedOld=new Promise<void>(r=>{reached=r;}),gate=new Promise<void>(r=>{release=r;});
  await p.route('**/api/bootstrap',async route=>{if(!hold)return route.continue();hold=false;const response=await route.fetch();reached();await gate;await route.fulfill({response,headers:{...response.headers(),'x-walk-test-stale':'1'}});});
  await p.evaluate(()=>window.dispatchEvent(new Event('online')));await reachedOld;
  await form.getByRole('button',{name:t('広場に公開する','en'),exact:true}).click();await expect(form).toHaveCount(0);await expect(p.locator('.post-detail h2')).toHaveText(title);
  const stale=p.waitForResponse(r=>r.url().endsWith('/api/bootstrap')&&r.headers()['x-walk-test-stale']==='1');release();await(await stale).finished();await p.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));
  await expect(p.locator('.post-detail h2')).toHaveText(title);expect(instance.store.sqlite.prepare('SELECT COUNT(*) AS n FROM posts WHERE title=?').get(title)).toEqual({n:1});
 }finally{release();await context.close();}
});
for(const [device,locale] of cases){
 test('a lost publish acknowledgement survives reload and retries exactly once in '+device,async({browser})=>{
  const context=await browser.newContext({baseURL:origin,locale:device,viewport:{width:320,height:844},isMobile:true,hasTouch:true}),p=await context.newPage();
  const requests:Record<string,unknown>[]=[];let lose=true;
  try{
   await onboard(p,locale);let form=await compose(p,locale);const title='Lost acknowledgement '+device;
   await form.getByLabel(t('投稿タイトル',locale),{exact:true}).fill(title);
   await form.getByLabel(t('本文',locale),{exact:true}).fill('Do not change $& {count} · 私密草稿');
   await p.route('**/api/posts',async route=>{
    if(route.request().method()!=='POST')return route.continue();requests.push(route.request().postDataJSON());
    if(!lose)return route.continue();lose=false;
    const response=await route.fetch();expect(response.status()).toBe(200);await route.abort('connectionreset');
   });
   await form.getByRole('button',{name:t('広場に公開する',locale),exact:true}).click();
   await expect(form.getByRole('alert')).toBeVisible();await expect(form.getByLabel(t('投稿タイトル',locale),{exact:true})).toBeDisabled();
   expect(instance.store.sqlite.prepare('SELECT COUNT(*) AS n FROM posts WHERE title=?').get(title)).toEqual({n:1});
   await p.reload();await expect(p.getByRole('application')).toHaveAttribute('data-ready','true');form=await compose(p,locale);
   await expect(form.getByLabel(t('投稿タイトル',locale),{exact:true})).toHaveValue(title);
   await expect(form.getByLabel(t('本文',locale),{exact:true})).toHaveValue('Do not change $& {count} · 私密草稿');
   await expect(form.getByLabel(t('投稿タイトル',locale),{exact:true})).toBeDisabled();expect(requests).toHaveLength(1);await fit(p);
   await form.getByRole('button',{name:t('広場に公開する',locale),exact:true}).click();await expect(form).toHaveCount(0);
   await expect(p.locator('.post-detail h2')).toHaveText(title);expect(requests).toHaveLength(2);expect(requests[1]).toEqual(requests[0]);
   expect(instance.store.sqlite.prepare('SELECT COUNT(*) AS n FROM posts WHERE title=?').get(title)).toEqual({n:1});
   expect(await p.evaluate(()=>Object.keys(localStorage).filter(k=>k.startsWith('walk-post-draft-v1:')))).toEqual([]);
  }finally{await context.close();}
 });
}
test('a private text and image draft survives close and reload, then publishes its original attachment',async({browser})=>{
 const context=await browser.newContext({baseURL:origin,locale:'en-US',viewport:{width:320,height:844},isMobile:true,hasTouch:true}),p=await context.newPage();
 try{
  await onboard(p,'en');let form=await compose(p,'en');await form.getByLabel('Post title',{exact:true}).fill('Not public yet');await form.getByLabel(t('本文','en'),{exact:true}).fill('Only on my device');
  await form.locator('input[type=file]').setInputFiles({name:'draft.png',mimeType:'image/png',buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aN1cAAAAASUVORK5CYII=','base64')});
  await expect(form.getByRole('img',{name:t('添付プレビュー','en'),exact:true})).toBeVisible();const url=await form.getByRole('img',{name:t('添付プレビュー','en'),exact:true}).getAttribute('src');
  await form.getByRole('button',{name:'Close',exact:true}).click();form=await compose(p,'en');await expect(form.getByLabel('Post title',{exact:true})).toHaveValue('Not public yet');
  await p.reload();await expect(p.getByRole('application')).toHaveAttribute('data-ready','true');form=await compose(p,'en');
  await expect(form.getByRole('img',{name:t('添付プレビュー','en'),exact:true})).toHaveAttribute('src',url!);await expect(form.getByLabel(t('本文','en'),{exact:true})).toHaveValue('Only on my device');
  const outsider=await browser.newContext({baseURL:origin});try{expect((await outsider.request.get(url!)).status()).toBe(404);}finally{await outsider.close();}
  expect(instance.store.sqlite.prepare('SELECT COUNT(*) AS n FROM posts WHERE title=?').get('Not public yet')).toEqual({n:0});
  await fit(p);await p.screenshot({path:'artifacts/private-draft-restored-320.png',animations:'disabled'});
  await form.getByRole('button',{name:t('広場に公開する','en'),exact:true}).click();await expect(p.locator('.post-detail h2')).toHaveText('Not public yet');await expect(p.locator('.post-detail .detail-image')).toHaveAttribute('src',url!);
 }finally{await context.close();}
});
test('discard is confirmed and clears the draft without deleting a post whose acknowledgement was lost',async({browser})=>{
 const context=await browser.newContext({baseURL:origin,locale:'en-US',viewport:{width:320,height:844}}),p=await context.newPage();
 try{
  await onboard(p,'en');const form=await compose(p,'en');await form.getByLabel('Post title',{exact:true}).fill('Keep the published post');
  await p.route('**/api/posts',async route=>{const response=await route.fetch();expect(response.status()).toBe(200);await route.abort('connectionreset');});
  await form.getByRole('button',{name:t('広場に公開する','en'),exact:true}).click();await expect(form.getByRole('alert')).toBeVisible();
  await form.getByRole('button',{name:'Discard draft',exact:true}).click();await expect(form).toBeVisible();await fit(p);
  await form.getByRole('button',{name:'Confirm discard draft',exact:true}).click();await expect(form).toHaveCount(0);
  expect(instance.store.sqlite.prepare('SELECT COUNT(*) AS n FROM posts WHERE title=?').get('Keep the published post')).toEqual({n:1});
  const fresh=await compose(p,'en');await expect(fresh.getByLabel('Post title',{exact:true})).toHaveValue('');await expect(fresh.getByLabel('Post title',{exact:true})).toBeEnabled();
 }finally{await context.close();}
});
test('signing out clears local drafts before the next identity starts',async({browser})=>{
 const context=await browser.newContext({baseURL:origin,locale:'en-US',viewport:{width:390,height:844}}),p=await context.newPage();
 try{
  await onboard(p,'en');
  const registered=await p.request.post('/api/account/register',{headers:{'X-Walk-Client':'1'},data:{handle:'draft_owner',password:'draft owner passphrase',accepted:true,policyVersion:'development-2026-10'}});expect(registered.status()).toBe(200);
  await p.reload();await expect(p.getByRole('application')).toHaveAttribute('data-ready','true');
  const form=await compose(p,'en');await form.getByLabel('Post title',{exact:true}).fill('Do not show the next person');
  await expect.poll(()=>p.evaluate(()=>Object.keys(localStorage).filter(k=>k.startsWith('walk-post-draft-v1:')).length)).toBe(1);
  await form.getByRole('button',{name:'Close',exact:true}).click();
  await p.locator('.mobile-nav').getByRole('button',{name:t('あなた','en'),exact:true}).click();await p.getByRole('button',{name:t('アカウントとデータ','en'),exact:true}).click();
  await p.getByRole('button',{name:t('この端末からログアウト','en'),exact:true}).click();
  await expect.poll(()=>p.evaluate(()=>Object.keys(localStorage).filter(k=>k.startsWith('walk-post-draft-v1:')).length)).toBe(0);
 }finally{await context.close();}
});
test('blocked draft storage warns the author and still allows a deliberate publication',async({browser})=>{
 const context=await browser.newContext({baseURL:origin,locale:'en-US',viewport:{width:320,height:844}}),p=await context.newPage();
 try{
  await onboard(p,'en');await p.evaluate(()=>{const original=Storage.prototype.setItem;Storage.prototype.setItem=function(key,value){if(key.startsWith('walk-post-draft-v1:'))throw new DOMException('Storage full','QuotaExceededError');return original.call(this,key,value);};});
  const form=await compose(p,'en');await form.getByLabel('Post title',{exact:true}).fill('Storage is unavailable');
  await expect(form.getByRole('alert')).toHaveText(t('この端末に下書きを保存できません。画面を閉じると入力が失われる可能性があります。','en'));await fit(p);
  await form.getByRole('button',{name:t('広場に公開する','en'),exact:true}).click();await expect(p.locator('.post-detail h2')).toHaveText('Storage is unavailable');
 }finally{await context.close();}
});
test('a rate-limited retry preserves the original uncertain request identifier',async({browser})=>{
 const context=await browser.newContext({baseURL:origin,locale:'en-US',viewport:{width:320,height:844}}),p=await context.newPage();let calls=0;const keys:string[]=[];
 try{
  await onboard(p,'en');const form=await compose(p,'en');await form.getByLabel('Post title',{exact:true}).fill('Still one after rate limiting');
  await p.route('**/api/posts',async route=>{
   keys.push(route.request().postDataJSON().requestId);calls++;
   if(calls===1){await route.fetch();return route.abort('connectionreset');}
   if(calls===2)return route.fulfill({status:429,json:{error:'Please wait'}});
   return route.continue();
  });
  const publish=form.getByRole('button',{name:t('広場に公開する','en'),exact:true});
  await publish.click();await expect(form.getByRole('alert')).toBeVisible();
  await publish.click();await expect(form.getByRole('alert')).toHaveText('Please wait');await expect(form.getByLabel('Post title',{exact:true})).toBeDisabled();
  await publish.click();await expect(form).toHaveCount(0);expect(keys).toHaveLength(3);expect(new Set(keys).size).toBe(1);
  expect(instance.store.sqlite.prepare('SELECT COUNT(*) AS n FROM posts WHERE title=?').get('Still one after rate limiting')).toEqual({n:1});
 }finally{await context.close();}
});
test('erasing all text does not resurrect an older draft on reopen',async({browser})=>{
 const context=await browser.newContext({baseURL:origin,locale:'en-US'}),p=await context.newPage();
 try{
  await onboard(p,'en');let form=await compose(p,'en');const input=form.getByLabel('Post title',{exact:true});await input.fill('Erase me');
  await expect.poll(()=>p.evaluate(()=>Object.keys(localStorage).filter(k=>k.startsWith('walk-post-draft-v1:')).length)).toBe(1);
  await input.fill('');await expect.poll(()=>p.evaluate(()=>Object.keys(localStorage).filter(k=>k.startsWith('walk-post-draft-v1:')).length)).toBe(0);
  await form.getByRole('button',{name:'Close',exact:true}).click();form=await compose(p,'en');await expect(form.getByLabel('Post title',{exact:true})).toHaveValue('');
 }finally{await context.close();}
});
