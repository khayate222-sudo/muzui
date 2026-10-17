import {test,expect,type Page} from '@playwright/test';
import {resolve} from 'node:path';
import {createApp} from '../../server/app';

let instance:Awaited<ReturnType<typeof createApp>>,origin:string,externalCalls:string[],lookups:number;
const request=async(p:Page,path:string)=>{const response=await p.request.get(origin+'/api'+path);expect(response.ok()).toBe(true);return response.json();};
test.beforeEach(async()=>{
  externalCalls=[];lookups=0;
  instance=await createApp({database:':memory:',adminKey:'chinese-browser-only-test-key',youtubeLoader:async()=>{lookups++;throw new Error('Unexpected YouTube lookup');},collectionFeed:async()=>{throw new Error('Unexpected collection');}});
  await instance.app.register(import('@fastify/static'),{root:resolve('dist')});origin=await instance.app.listen({host:'127.0.0.1',port:0});
});
test.afterEach(async({page})=>{await page.close();instance.io.disconnectSockets(true);await instance.app.close();});
async function start(p:Page){
  p.on('request',r=>{if(/^https:\/\/(?:[^/]+\.)?(?:douyin|iesdouyin|kuaishou)\.com\//.test(r.url()))externalCalls.push(r.url());});
  await p.goto(origin);await p.getByRole('button',{name:'まず動画を見てみる',exact:true}).click();await p.getByRole('dialog',{name:'今日の動画の棚',exact:true}).getByRole('button',{name:'閉じる',exact:true}).click();await expect(p.locator('[role=application][data-ready=true]')).toBeVisible();
}
async function form(p:Page){await p.locator('.quick-discovery').getByRole('button',{name:'投稿を集める',exact:true}).click();return p.getByRole('dialog',{name:'外部の投稿を集める',exact:true});}

test('a phone imports copied Douyin sharing text as a clearly marked source link without fetching or pretending to play it',async({page:p})=>{
  await p.setViewportSize({width:390,height:844});await start(p);const before=await request(p,'/bootstrap'),f=await form(p);
  await expect(f.getByLabel('中国SNSの投稿リンク')).toContainText('抖音 / Douyin');await expect(f.getByLabel('中国SNSの投稿リンク')).toContainText('快手 / Kuaishou');
  await f.getByLabel('投稿のURL').fill('3.21 复制打开抖音，看看这条视频 https://v.douyin.com/Test123/ 复制此链接');
  await expect(f.getByRole('region',{name:'中国SNSリンクの確認'})).toContainText('共有短縮リンク');await expect(f.getByRole('region',{name:'中国SNSリンクの確認'})).toContainText('自動確認していません');
  await expect(f.getByRole('link',{name:'元のリンクを確認'})).toHaveAttribute('href','https://v.douyin.com/Test123/');
  await expect(f.getByRole('button',{name:'YouTubeの情報を取得',exact:true})).toHaveCount(0);expect((await request(p,'/bootstrap')).posts).toEqual(before.posts);expect(externalCalls).toEqual([]);
  await f.getByLabel('タイトル',{exact:true}).fill('検証用：抖音の小さな発見');await f.getByLabel('元の投稿者名').fill('検証用の元投稿者');await f.getByRole('combobox',{name:'ジャンル',exact:true}).selectOption('game');await f.getByLabel('外部投稿を置く世界').selectOption('world:game-rpg');
  for(const width of [320,390]){await p.setViewportSize({width,height:844});expect(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);}
  await f.locator('.short-video-sources').scrollIntoViewIfNeeded();await p.screenshot({path:'artifacts/chinese-import-390.png',animations:'disabled'});
  await f.getByRole('button',{name:'確認して世界に置く',exact:true}).click();await expect(p.locator('.post-detail h2')).toHaveText('検証用：抖音の小さな発見');await expect(p.locator('.map-top')).toContainText('RPGの世界');
  await expect(p.locator('.short-video-link')).toContainText('同期視聴にはまだ対応していません');await expect(p.locator('.post-detail iframe,.post-detail video')).toHaveCount(0);await expect(p.getByTestId('together-controls')).toHaveCount(0);
  await expect(p.locator('.short-video-link')).toContainText('外部動画の再生人数ではありません');await expect(p.getByRole('button',{name:'この投稿の世界を歩く',exact:true})).toBeVisible();
  await expect(p.getByRole('link',{name:'抖音 を開く',exact:true})).toHaveAttribute('href','https://v.douyin.com/Test123/');
  const boot=await request(p,'/bootstrap'),post=boot.posts.find((v:{title:string})=>v.title==='検証用：抖音の小さな発見');expect(post.worldId).toBe('world:game-rpg');expect(boot.favorites).toContain(post.id);expect(boot.user.shareActivity).toBe(false);expect(lookups).toBe(0);expect(externalCalls).toEqual([]);
  await p.screenshot({path:'artifacts/douyin-source-390.png',animations:'disabled'});
});

test('two real guests save one Kuaishou post, keep attribution and distinguish the open card from external playback',async({page:p,browser})=>{
  const context=await browser.newContext({viewport:{width:320,height:844}}),other=await context.newPage();
  try{
    await p.setViewportSize({width:390,height:844});await start(p);await start(other);const url='https://www.kuaishou.com/short-video/3xabcdefghijklm';
    const f=await form(p);await f.getByLabel('投稿のURL').fill(url);await f.getByLabel('タイトル',{exact:true}).fill('検証用：快手の短い動画');await f.getByLabel('元の投稿者名').fill('検証用の作者');await f.getByRole('combobox',{name:'ジャンル',exact:true}).selectOption('art');await f.getByRole('button',{name:'確認して世界に置く',exact:true}).click();await expect(p.locator('.post-detail h2')).toHaveText('検証用：快手の短い動画');
    const second=await form(other);await second.getByLabel('投稿のURL').fill('https://v.douyin.com/Foo123/ '+url);await expect(second.getByRole('button',{name:'確認して世界に置く',exact:true})).toBeDisabled();await expect(second.getByRole('status')).toContainText('一つ入力');
    await second.getByLabel('投稿のURL').fill(url+'?share=another');await second.getByLabel('タイトル',{exact:true}).fill('上書きしない題名');await second.getByLabel('元の投稿者名').fill('別の投稿者');await second.getByRole('combobox',{name:'ジャンル',exact:true}).selectOption('game');await second.getByRole('button',{name:'確認して世界に置く',exact:true}).click();
    await expect(other.locator('.post-detail h2')).toHaveText('検証用：快手の短い動画');await expect(other.locator('.map-top')).toContainText('アートの世界');await expect(other.getByRole('link',{name:'快手 を開く',exact:true})).toHaveAttribute('href',url);
    const boot=await request(other,'/bootstrap'),posts=boot.posts.filter((v:{externalUrl:string})=>v.externalUrl===url);expect(posts).toHaveLength(1);expect(posts[0].authorName).toBe('検証用の作者');expect(boot.favorites).toContain(posts[0].id);
    await expect(p.locator('.viewing-box')).toContainText('2人がこの投稿を開いています');await expect(other.locator('.viewing-box')).toContainText('2人がこの投稿を開いています');
    await expect(other.locator('.post-detail iframe,.post-detail video')).toHaveCount(0);expect(lookups).toBe(0);expect(externalCalls).toEqual([]);expect(await other.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await other.screenshot({path:'artifacts/kuaishou-source-320.png',animations:'disabled'});
  }finally{await context.close();}
});
