import {test,expect,type Page} from '@playwright/test';
import {resolve} from 'node:path';
import {createApp} from '../../server/app';

const videoId='M7lc1UVf-VE',channel='UC'+'a'.repeat(22),key='youtube-browser-fixture-only-key';
const title='検証用：小さな制作の時間';
const metadata=(id:string)=>({type:'video',provider_name:'YouTube',title:id===videoId?title:'検証用：別の一本',author_name:'検証用の作者',author_url:'https://www.youtube.com/channel/'+channel});
let instance:Awaited<ReturnType<typeof createApp>>,origin:string,load:(id:string)=>Promise<unknown>,calls:string[];
const request=async(p:Page,path:string,data?:object)=>{const response=await p.request.fetch(origin+'/api'+path,{method:data?'POST':'GET',headers:{'X-Walk-Client':'1'},data});const body=await response.json();return {ok:()=>response.ok(),json:()=>body};};
test.beforeEach(async()=>{
  calls=[];load=async id=>metadata(id);
  instance=await createApp({database:':memory:',adminKey:key,youtubeLoader:async id=>{calls.push(id);return load(id);},collectionFeed:async id=>`<feed xmlns:yt="http://www.youtube.com/xml/schemas/2015"><yt:channelId>${id}</yt:channelId><entry><yt:videoId>${videoId}</yt:videoId><title>検証用のチャンネル新着</title><author><name>検証用の作者</name></author><published>2026-10-01T10:00:00Z</published></entry></feed>`});
  await instance.app.register(import('@fastify/static'),{root:resolve('dist')});origin=await instance.app.listen({host:'127.0.0.1',port:0});
});
test.afterEach(async({page})=>{await page.close();instance.io.disconnectSockets(true);await instance.app.close();});
async function start(p:Page){
  // Only the upstream loaders and the cross-origin player/image boundary use fixtures.
  // All WALK preview, publish, collection, world, save and socket operations are real.
  await p.route('https://www.youtube-nocookie.com/embed/**',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><html><body>YouTube player boundary fixture; not live playback.</body></html>'}));
  await p.route('https://i.ytimg.com/**',route=>route.fulfill({contentType:'image/png',body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aN1cAAAAASUVORK5CYII=','base64')}));
  await p.goto(origin);await p.getByRole('button',{name:'まず動画を見てみる',exact:true}).click();await p.getByRole('dialog',{name:'今日の動画の棚',exact:true}).getByRole('button',{name:'閉じる',exact:true}).click();await expect(p.locator('[role=application][data-ready=true]')).toBeVisible();
}
async function openImports(p:Page){await p.locator('.quick-discovery').getByRole('button',{name:'投稿を集める',exact:true}).click();return p.getByRole('dialog',{name:'外部の投稿を集める',exact:true});}

test('phone preview fetches metadata only, then publishes to the chosen nested world using the official player',async({page:p})=>{
  await p.setViewportSize({width:390,height:844});await start(p);const before=(await request(p,'/bootstrap')).json();const form=await openImports(p);
  await form.getByLabel('投稿のURL').fill('https://www.youtube.com/shorts/'+videoId+'?tracking=1');await expect(form.getByRole('button',{name:'確認して世界に置く',exact:true})).toBeDisabled();expect(calls).toEqual([]);
  await form.getByRole('button',{name:'YouTubeの情報を取得',exact:true}).click();await expect(form.getByRole('region',{name:'YouTubeから取得した情報'})).toContainText(title);await expect(form.getByLabel('タイトル',{exact:true})).toHaveValue(title);await expect(form.getByLabel('元の投稿者名')).toHaveValue('検証用の作者');
  expect((await request(p,'/bootstrap')).json().posts).toEqual(before.posts);expect((await request(p,'/bootstrap')).json().favorites).toEqual([]);await expect(p.locator('.youtube-player')).toHaveCount(0);
  await form.getByRole('combobox',{name:'ジャンル',exact:true}).selectOption('game');await form.getByLabel('外部投稿を置く世界').selectOption('world:game-rpg');
  for(const width of [320,390]){await p.setViewportSize({width,height:844});expect(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);}
  await form.evaluate(el=>el.scrollTo(0,0));await p.screenshot({path:'artifacts/youtube-preview-390.png',animations:'disabled'});
  await form.getByRole('button',{name:'確認して世界に置く',exact:true}).click();await expect(p.locator('.post-detail h2')).toHaveText(title);await expect(p.locator('.map-top')).toContainText('RPGの世界');await expect(p.locator('.youtube-player')).toHaveAttribute('src','https://www.youtube-nocookie.com/embed/'+videoId);await expect(p.getByTestId('together-controls')).toHaveCount(0);
  const boot=(await request(p,'/bootstrap')).json(),post=boot.posts.find((post:{title:string})=>post.title===title);expect(post.worldId).toBe('world:game-rpg');expect(boot.favorites).toContain(post.id);expect(boot.user.shareActivity).toBe(false);expect(boot.friendships).toEqual([]);expect(calls).toEqual([videoId]);
  await p.screenshot({path:'artifacts/youtube-world-390.png',animations:'disabled'});
});

test('changed URLs ignore late metadata, unavailable lookup is explicit manual entry, and a closed slow publish never navigates later',async({page:p})=>{
  await p.setViewportSize({width:320,height:844});await start(p);let releaseMetadata=()=>{},releasePublish=()=>{};
  try{
    const gate=new Promise<void>(r=>{releaseMetadata=r;});load=async id=>{await gate;return metadata(id);};const form=await openImports(p);await form.getByLabel('投稿のURL').fill('https://youtu.be/'+videoId);await form.getByRole('button',{name:'YouTubeの情報を取得',exact:true}).click();await expect.poll(()=>calls.length).toBe(1);
    await form.getByLabel('投稿のURL').fill('https://youtu.be/aqz-KE-bpKQ');releaseMetadata();await expect(form.getByLabel('タイトル',{exact:true})).toHaveValue('');await expect(form.getByRole('region',{name:'YouTubeから取得した情報'})).toHaveCount(0);await expect(form.getByRole('button',{name:'確認して世界に置く',exact:true})).toBeDisabled();
    load=async()=>{throw new Error('fixture upstream failure');};await form.getByRole('button',{name:'YouTubeの情報を取得',exact:true}).click();await expect(form.getByRole('alert')).toContainText('取得できませんでした');await form.getByRole('button',{name:'情報を取得せず、手入力で続ける',exact:true}).click();await expect(form).toContainText('取得できた状態ではありません');
    await form.getByLabel('タイトル',{exact:true}).fill('手入力で持ち込む検証');await form.getByLabel('元の投稿者名').fill('出典の作者');await form.getByRole('combobox',{name:'ジャンル',exact:true}).selectOption('art');
    let reached=()=>{};const started=new Promise<void>(r=>{reached=r;}),waiting=new Promise<void>(r=>{releasePublish=r;});await p.route('**/api/imports',async route=>{const response=await route.fetch();reached();await waiting;await route.fulfill({response});});
    await form.getByRole('button',{name:'確認して世界に置く',exact:true}).click();await started;await form.getByRole('button',{name:'閉じる',exact:true}).click();releasePublish();await expect.poll(async()=> (await request(p,'/bootstrap')).json().posts.some((post:{title:string})=>post.title==='手入力で持ち込む検証')).toBe(true);await expect(p.locator('.youtube-player')).toHaveCount(0);await expect(p.locator('.map-top')).toContainText('不思議な駅');
  }finally{releaseMetadata();releasePublish();}
});

test('an administrator fetches real WALK candidates from the fixture feed, reviews before publication, and chooses a nested world',async({page:p})=>{
  await p.setViewportSize({width:1512,height:982});await start(p);expect((await request(p,'/admin/login',{key})).ok()).toBe(true);await p.reload();await p.getByRole('button',{name:'管理画面',exact:true}).click();await p.setViewportSize({width:390,height:844});
  const admin=p.getByRole('dialog',{name:'WALK STUDIO / 管理',exact:true});await expect(admin).toBeVisible();await admin.getByLabel('収集するチャンネル').fill(channel);await admin.getByLabel('収集元の名前').fill('検証用の収集元');await admin.getByLabel('収集ジャンル').selectOption('game');await admin.getByRole('button',{name:'収集元を追加',exact:true}).click();await admin.getByRole('button',{name:'今すぐ取得',exact:true}).click();
  await admin.getByRole('button',{name:'候補を確認',exact:true}).click();const review=admin.getByRole('region',{name:'検証用のチャンネル新着の公開前確認'});await expect(review.getByRole('button',{name:'広場に公開',exact:true})).toBeDisabled();expect((await request(p,'/bootstrap')).json().posts.some((post:{title:string})=>post.title==='検証用のチャンネル新着')).toBe(false);
  await review.getByLabel('検証用のチャンネル新着の公開先').selectOption('world:game-rpg');await review.getByLabel('出典・内容・掲載条件と公開先を確認しました').check();expect(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await p.screenshot({path:'artifacts/youtube-candidate-390.png',animations:'disabled'});await review.getByRole('button',{name:'広場に公開',exact:true}).click();
  await expect(admin.getByRole('button',{name:'候補を確認',exact:true})).toHaveCount(0);const state=(await request(p,'/bootstrap')).json();expect(state.posts.find((post:{title:string})=>post.title==='検証用のチャンネル新着').worldId).toBe('world:game-rpg');await admin.getByRole('button',{name:'今すぐ取得',exact:true}).click();expect((await request(p,'/bootstrap')).json().posts.filter((post:{title:string})=>post.title==='検証用のチャンネル新着')).toHaveLength(1);
});
