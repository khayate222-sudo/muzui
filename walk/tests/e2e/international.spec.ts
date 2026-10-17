import {t} from '../../src/i18n';
import {test,expect} from '@playwright/test';
import {resolve} from 'node:path';
import {createApp} from '../../server/app';
// Each workflow has a real, separate server and database. Creating guests for
// multiple unrelated tests must not exhaust the production IP rate limit.
let instance:Awaited<ReturnType<typeof createApp>>,origin:string;
test.beforeEach(async()=>{
 instance=await createApp({database:':memory:',adminKey:'international-browser-test-admin-key'});
 await instance.app.register(import('@fastify/static'),{root:resolve('dist')});
 origin=await instance.app.listen({host:'127.0.0.1',port:0});
});
test.afterEach(async()=>{instance.io.disconnectSockets(true);await instance.app.close();});
const cases=[{locale:'en-US',tag:'en',start:'Find your first video',shelf:'Today’s video shelf',save:'Save to my window',confirm:'Save and open at my window',room:'My window',close:'Close'},
  {locale:'zh-CN',tag:'zh-Hans',start:'先找一段视频',shelf:'今天的视频架',save:'放到自己的窗边',confirm:'收藏并在窗边打开',room:'我的窗边',close:'关闭'},
  {locale:'zh-TW',tag:'zh-Hant',start:'先找一段影片',shelf:'今天的影片架',save:'放到自己的窗邊',confirm:'收藏並在窗邊開啟',room:'我的窗邊',close:'關閉'}];
for(const language of cases)test('first video and private window in '+language.locale,async({browser})=>{
  const context=await browser.newContext({baseURL:origin,locale:language.locale,viewport:{width:390,height:844}}),page=await context.newPage();
  try{await page.goto('/');await expect(page.locator('html')).toHaveAttribute('lang',language.tag);await page.getByRole('button',{name:language.start,exact:true}).click();const shelf=page.getByRole('dialog',{name:language.shelf,exact:true});await expect(shelf).toBeVisible();
    const me=(await(await page.request.get('/api/bootstrap')).json()).user;await shelf.locator('.discovery-cover').first().click();await expect(page.locator('.viewing-box')).toContainText('1');await expect(page.locator('.viewer-avatars button')).toHaveCount(0);await expect(page.locator('.bilibili-player')).toHaveCount(0);
    await page.getByRole('button',{name:language.save,exact:true}).click();await page.getByRole('button',{name:language.confirm,exact:true}).click();await expect(page.getByTestId('room-interior')).toBeVisible();
    const visibleRooms=await(await page.request.get('/api/rooms')).json(),rooms=visibleRooms.filter((room:{ownerId:string})=>room.ownerId===me.id);expect(rooms).toHaveLength(1);expect(rooms[0]).toMatchObject({title:language.room,isPublic:false,ownerId:me.id});expect(rooms[0].items).toHaveLength(1);for(const width of [320,390]){await page.setViewportSize({width,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await expect(page.getByTestId('room-interior')).toBeVisible();}await page.screenshot({path:'artifacts/international-'+language.tag+'-window.png',animations:'disabled'});
    const after=await(await page.request.get('/api/bootstrap')).json();expect(after.user.id).toBe(me.id);expect(after.user.shareActivity).toBe(false);expect(after.friendships).toEqual([]);
  }finally{await context.close();}
});
test('language choice persists without changing the account at 320px',async({browser})=>{
  const context=await browser.newContext({baseURL:origin,locale:'en-US',viewport:{width:320,height:844}}),p=await context.newPage();
  try{await p.goto('/');await expect(p.locator('.profile-form')).toBeVisible();const before=(await(await p.request.get('/api/bootstrap')).json()).user;await p.locator('.profile-form').getByRole('combobox',{name:'Language',exact:true}).selectOption('zh-Hant');await expect(p.getByRole('button',{name:'先找一段影片',exact:true})).toBeVisible();await p.reload();await expect(p.locator('.profile-form')).toBeVisible();await expect(p.locator('html')).toHaveAttribute('lang','zh-Hant');expect((await(await p.request.get('/api/bootstrap')).json()).user).toEqual(before);expect(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  }finally{await context.close();}
});

test('English account deletion requires an explicit DELETE and only removes the current guest',async({browser})=>{
 const context=await browser.newContext({baseURL:origin,locale:'en-US',viewport:{width:390,height:844}}),page=await context.newPage();
 try{
  await page.goto('/');await expect(page.locator('.profile-form')).toBeVisible();const before=(await(await page.request.get('/api/bootstrap')).json()).user;
  await page.getByRole('textbox',{name:t('ニックネーム','en'),exact:true}).fill('International visitor');
  await page.getByRole('button',{name:t('WALKをはじめる','en'),exact:true}).click();
  await page.locator('.mobile-nav').getByRole('button',{name:'You',exact:true}).click();
  await page.getByRole('button',{name:'Account and data',exact:true}).click();
  const account=page.getByRole('dialog',{name:'Account and data',exact:true});
  await account.getByRole('button',{name:t('このゲストのデータを削除','en'),exact:true}).click();
  const confirmation=account.getByRole('textbox',{name:'Deletion confirmation',exact:true});
  await expect(confirmation).toHaveAttribute('pattern','DELETE');await confirmation.fill('delete');
  await account.getByRole('button',{name:t('データの削除を実行','en'),exact:true}).click();
  expect((await(await page.request.get('/api/bootstrap')).json()).user.id).toBe(before.id);
  await confirmation.fill('DELETE');await account.getByRole('button',{name:t('データの削除を実行','en'),exact:true}).click();
  await expect(page.locator('.profile-form')).toBeVisible();await expect.poll(async()=>(await(await page.request.get('/api/bootstrap')).json()).user.id).not.toBe(before.id);
  await expect(page.locator('html')).toHaveAttribute('lang','en');
 }finally{await context.close();}
});

test('changing language keeps the selected video element, position and privacy settings',async({browser})=>{
 const context=await browser.newContext({baseURL:origin,locale:'en-US',viewport:{width:1512,height:982}}),page=await context.newPage();
 try{
  await page.goto('/');await page.getByRole('button',{name:'Find your first video',exact:true}).click();
  await page.getByRole('dialog',{name:'Today’s video shelf',exact:true}).locator('.discovery-cover').first().click();
  const video=page.locator('.post-detail video');await expect.poll(()=>video.evaluate((node:HTMLVideoElement)=>node.readyState)).toBeGreaterThanOrEqual(2);
  const title=await page.locator('.post-detail h2').textContent(),before=(await(await page.request.get('/api/bootstrap')).json()).user;
  await video.evaluate((node:HTMLVideoElement)=>{node.pause();node.currentTime=3;node.dataset.localeStable='same';});
  await page.getByRole('button',{name:t('箱庭と見る','en'),exact:true}).click();
  await page.getByRole('button',{name:t('プロフィール設定','en'),exact:true}).click();
  await page.locator('.profile-form').getByRole('combobox',{name:'Language',exact:true}).selectOption('zh-Hant');
  await expect(page.locator('html')).toHaveAttribute('lang','zh-Hant');
  await expect(video).toHaveAttribute('data-locale-stable','same');expect(await video.evaluate((node:HTMLVideoElement)=>node.currentTime)).toBeGreaterThanOrEqual(2.9);
  await expect(page.locator('.post-detail h2')).toHaveText(title||'');
  await page.locator('.profile-form').getByRole('button',{name:t('変更を保存','zh-Hant'),exact:true}).click();
  await expect(video).toHaveAttribute('data-locale-stable','same');const after=(await(await page.request.get('/api/bootstrap')).json()).user;expect(after.id).toBe(before.id);expect(after.shareActivity).toBe(before.shareActivity);
 }finally{await context.close();}
});
