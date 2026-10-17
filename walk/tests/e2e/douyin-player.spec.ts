import {test,expect,type Page} from '@playwright/test';
import {resolve} from 'node:path';
import {createApp} from '../../server/app';
import {sourceInfo} from '../../shared/community';

const id='7123456789012345678',id2='7222222222222222222',title='検証用：抖音の制作時間';
const metadata=(id:string)=>({err_no:0,data:{video_title:title,video_width:720,video_height:1280,iframe_code:'<iframe src="https://open.douyin.com/player/video?vid='+id+'&autoplay=0"></iframe>'}});
let instance:Awaited<ReturnType<typeof createApp>>,origin:string,load:(id:string)=>Promise<unknown>,calls:string[];
const request=async(p:Page,path:string)=>{const r=await p.request.get(origin+'/api'+path);expect(r.ok()).toBe(true);return r.json();};
test.beforeEach(async()=>{
  calls=[];load=async id=>metadata(id);instance=await createApp({database:':memory:',adminKey:'douyin-browser-test-only-admin-key',douyinLoader:async id=>{calls.push(id);return load(id);},douyinResolver:async url=>sourceInfo(url)?.videoId||id});
  await instance.app.register(import('@fastify/static'),{root:resolve('dist')});origin=await instance.app.listen({host:'127.0.0.1',port:0});
});
test.afterEach(async({page})=>{await page.close();instance.io.disconnectSockets(true);await instance.app.close();});
async function start(p:Page){
  // Only the provider and iframe boundaries use fixtures. WALK APIs, sessions,
  // saves, canonical import, navigation and world sockets run against the server.
  await p.route('https://open.douyin.com/player/**',route=>route.fulfill({contentType:'text/html; charset=utf-8',body:'<!doctype html><html lang="ja"><head><meta charset="utf-8"></head><body style="background:#222;color:white">検証用の公式プレーヤー境界。実動画ではありません。</body></html>'}));
  await p.goto(origin);await p.getByRole('button',{name:'まず動画を見てみる',exact:true}).click();await p.getByRole('dialog',{name:'今日の動画の棚',exact:true}).getByRole('button',{name:'閉じる',exact:true}).click();await expect(p.locator('[role=application][data-ready=true]')).toBeVisible();
}
async function imports(p:Page){await p.locator('.quick-discovery').getByRole('button',{name:'投稿を集める',exact:true}).click();return p.getByRole('dialog',{name:'外部の投稿を集める',exact:true});}

test('a phone confirms Douyin metadata without viewing, saves a canonical video in its world and explicitly opens a stable official iframe',async({page:p})=>{
  await p.setViewportSize({width:390,height:844});await start(p);const before=await request(p,'/bootstrap'),f=await imports(p);
  await f.getByLabel('投稿のURL').fill('分享 https://v.douyin.com/Test123/ 复制链接');expect(calls).toEqual([]);await f.getByRole('button',{name:'抖音の再生情報を確認',exact:true}).click();
  await expect(f.getByRole('region',{name:'抖音から取得した再生情報'})).toContainText(title);await expect(f.getByLabel('タイトル',{exact:true})).toHaveValue(title);await expect(f.getByLabel('投稿のURL')).toHaveValue('https://www.douyin.com/video/'+id);await expect(f.getByLabel('元の投稿者名')).toHaveValue('');
  expect((await request(p,'/bootstrap')).posts).toEqual(before.posts);expect((await request(p,'/bootstrap')).favorites).toEqual(before.favorites);await expect(p.locator('iframe')).toHaveCount(0);
  await f.getByLabel('元の投稿者名').fill('検証用の作者');await f.getByRole('combobox',{name:'ジャンル',exact:true}).selectOption('game');await f.getByLabel('外部投稿を置く世界').selectOption('world:game-rpg');await f.getByRole('button',{name:'確認して世界に置く',exact:true}).click();
  await expect(p.locator('.post-detail h2')).toHaveText(title);await expect(p.locator('.map-top')).toContainText('RPGの世界');await expect(p.locator('.douyin-player')).toHaveCount(0);
  await p.getByRole('button',{name:'公式プレーヤーを開く',exact:true}).click();const player=p.locator('.douyin-player');await expect(player).toHaveAttribute('src','https://open.douyin.com/player/video?vid='+id+'&autoplay=0');await expect(player).toHaveAttribute('referrerpolicy','strict-origin-when-cross-origin');await expect(p.getByTestId('together-controls')).toHaveCount(0);
  const boot=await request(p,'/bootstrap'),post=boot.posts.find((v:{title:string})=>v.title===title);expect(post.externalUrl).toBe('https://www.douyin.com/video/'+id);expect(boot.favorites).toContain(post.id);expect(boot.user.shareActivity).toBe(false);expect(calls).toEqual([id]);
  await player.evaluate(el=>el.setAttribute('data-persisted','yes'));await p.getByRole('button',{name:'大画面で見る',exact:true}).click();await expect(player).toHaveAttribute('data-persisted','yes');
  for(const width of [320,390]){await p.setViewportSize({width,height:844});await player.scrollIntoViewIfNeeded();expect(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);expect((await player.boundingBox())!.width).toBeGreaterThan(200);}
  await p.screenshot({path:'artifacts/douyin-player-390.png',animations:'disabled'});await p.getByRole('button',{name:'プレーヤーを閉じる',exact:true}).click();await expect(player).toHaveCount(0);
});

test('late metadata never fills a changed URL, and a non-public provider response offers retry without a fake player',async({page:p})=>{
  await p.setViewportSize({width:320,height:844});await start(p);let release=()=>{};
  try{
    const gate=new Promise<void>(r=>{release=r;});load=async id=>{await gate;return metadata(id);};const f=await imports(p);await f.getByLabel('投稿のURL').fill('https://www.douyin.com/video/'+id);await f.getByRole('button',{name:'抖音の再生情報を確認',exact:true}).click();await expect.poll(()=>calls.length).toBe(1);await f.getByLabel('投稿のURL').fill('https://v.kuaishou.com/Test123/');const returned=p.waitForResponse(r=>r.url().endsWith('/api/douyin/preview'));release();await returned;
    await expect(f.getByLabel('タイトル',{exact:true})).toHaveValue('');await expect(f.getByRole('region',{name:'抖音から取得した再生情報'})).toHaveCount(0);
    load=async()=>({err_no:28003004,err_msg:'非公开视频',data:{}});await f.getByLabel('投稿のURL').fill('https://www.douyin.com/video/'+id2);await f.getByRole('button',{name:'抖音の再生情報を確認',exact:true}).click();await expect(f.getByRole('alert')).toContainText('再生情報を確認できませんでした');await f.getByLabel('タイトル',{exact:true}).fill('検証用：再生条件を満たさない動画');await f.getByLabel('元の投稿者名').fill('手入力の作者');await f.getByRole('button',{name:'確認して世界に置く',exact:true}).click();
    await p.getByRole('button',{name:'公式プレーヤーを開く',exact:true}).click();await expect(p.locator('.douyin-media [role=alert]')).toContainText('元投稿リンク');await expect(p.locator('.douyin-player')).toHaveCount(0);await expect(p.getByRole('link',{name:'抖音 を開く',exact:true})).toHaveAttribute('href','https://www.douyin.com/video/'+id2);
    load=async id=>metadata(id);await p.getByRole('button',{name:'再生情報を確認し直す',exact:true}).click();await expect(p.locator('.douyin-player')).toHaveAttribute('src','https://open.douyin.com/player/video?vid='+id2+'&autoplay=0');
  }finally{release();}
});

test('closing a post while its confirmed player response is delayed does not reopen it later',async({page:p})=>{
  await p.setViewportSize({width:390,height:844});await start(p);const f=await imports(p);await f.getByLabel('投稿のURL').fill('https://www.douyin.com/video/'+id);await f.getByLabel('タイトル',{exact:true}).fill('検証用：閉じた後の応答');await f.getByLabel('元の投稿者名').fill('検証用の作者');await f.getByRole('button',{name:'確認して世界に置く',exact:true}).click();await expect(p.locator('.post-detail h2')).toHaveText('検証用：閉じた後の応答');
  let release=()=>{},reached=()=>{};const gate=new Promise<void>(r=>{release=r;}),started=new Promise<void>(r=>{reached=r;});
  try{
    await p.route('**/api/douyin/preview',async route=>{const result=await route.fetch();reached();await gate;await route.fulfill({response:result});});await p.getByRole('button',{name:'公式プレーヤーを開く',exact:true}).click();await started;
    await p.locator('.watch-controls').getByRole('button',{name:'閉じる',exact:true}).click();release();await expect(p.locator('.post-detail')).toHaveCount(0);await expect(p.locator('.douyin-player')).toHaveCount(0);await expect(p.locator('.watch-frame')).toHaveCount(0);
  }finally{release();}
});
