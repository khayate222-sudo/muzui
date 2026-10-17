import {test,expect,type Page} from '@playwright/test';
import {resolve} from 'node:path';
import {createApp} from '../../server/app';
import {curatedVideos} from '../../shared/curated-videos';

let instance:Awaited<ReturnType<typeof createApp>>,origin:string;
test.beforeEach(async()=>{instance=await createApp({database:':memory:',adminKey:'bilibili-library-browser-admin-key'});await instance.app.register(import('@fastify/static'),{root:resolve('dist')});origin=await instance.app.listen({host:'127.0.0.1',port:0});});
test.afterEach(async({page})=>{await page.close();instance.io.disconnectSockets(true);await instance.app.close();});
async function start(p:Page){
  // Only the cross-origin player is replaced here. Real provider playback is
  // recorded separately with npm run videos:verify and the live batch evidence.
  await p.route('https://player.bilibili.com/**',route=>route.fulfill({contentType:'text/html; charset=utf-8',body:'<!doctype html><meta charset=utf-8><body>検証用プレーヤー境界。実動画ではありません。</body>'}));
  await p.goto(origin);await p.getByRole('button',{name:'まず動画を見てみる',exact:true}).click();await expect(p.getByRole('dialog',{name:'今日の動画の棚',exact:true})).toBeVisible();
}
test('a newcomer finds a real curated library on phones, sees honest provenance and opens the official player only by choice',async({page:p})=>{
  await p.setViewportSize({width:390,height:844});await start(p);const shelf=p.getByRole('dialog',{name:'今日の動画の棚',exact:true});await shelf.getByRole('button',{name:'海外の動画',exact:true}).click();await expect(shelf.locator('.discovery-video')).toHaveCount(curatedVideos.length);await expect(p.locator('.bilibili-player')).toHaveCount(0);
  await expect(shelf.locator('.curated-check').first()).toContainText('開発環境で冒頭を確認');
  for(const width of [320,390]){await p.setViewportSize({width,height:844});expect(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);}
  await shelf.evaluate(el=>el.scrollTo(0,0));await p.screenshot({path:'artifacts/bilibili-shelf-390.png',animations:'disabled'});
  const film=curatedVideos[0];await shelf.getByRole('button',{name:film.title+'を見る',exact:true}).click();await expect(p.locator('.post-detail h2')).toHaveText(film.title);await expect(p.locator('.post-body')).toContainText(film.sourceTitle);await expect(p.locator('.author-row')).toContainText(film.authorName);await expect(p.locator('.bilibili-player')).toHaveCount(0);
  await expect(p.locator('.viewing-box')).toContainText('1人がこの投稿を開いています');await expect(p.locator('.viewer-avatars button')).toHaveCount(0);await expect(p.getByTestId('together-controls')).toHaveCount(0);
  await p.getByRole('button',{name:'bilibili公式プレーヤーを開く',exact:true}).click();const player=p.locator('.bilibili-player');await expect(player).toHaveAttribute('src','https://player.bilibili.com/player.html?bvid='+film.bvid+'&p=1&autoplay=0');await expect(player).toHaveAttribute('referrerpolicy','strict-origin-when-cross-origin');
  await player.evaluate(el=>el.setAttribute('data-stable','yes'));await p.getByRole('button',{name:'箱庭と見る',exact:true}).click();await expect(player).toHaveAttribute('data-stable','yes');await p.getByRole('button',{name:'大画面で見る',exact:true}).click();await expect(player).toHaveAttribute('data-stable','yes');await player.scrollIntoViewIfNeeded();expect((await player.boundingBox())!.width).toBeGreaterThan(200);await p.screenshot({path:'artifacts/bilibili-player-390.png',animations:'disabled'});
  await p.getByRole('button',{name:'プレーヤーを閉じる',exact:true}).click();await expect(player).toHaveCount(0);await expect(p.getByRole('link',{name:'bilibili を開く',exact:true})).toHaveAttribute('href',film.url);
});
test('two actual guests share a curated post without fake viewers, duplicate cards or automatic synchronization',async({page:p,browser})=>{
  const context=await browser.newContext({viewport:{width:390,height:844}}),other=await context.newPage();
  try{await start(p);await start(other);const film=curatedVideos[0];await p.getByRole('dialog',{name:'今日の動画の棚',exact:true}).getByRole('button',{name:film.title+'を見る',exact:true}).click();await other.getByRole('dialog',{name:'今日の動画の棚',exact:true}).getByRole('button',{name:'閉じる',exact:true}).click();await other.locator('.quick-discovery').getByRole('button',{name:'投稿を集める',exact:true}).click();const form=other.getByRole('dialog',{name:'外部の投稿を集める',exact:true});await form.getByLabel('投稿のURL').fill(film.url+'?tracking=copy');await form.getByLabel('タイトル',{exact:true}).fill('上書きしない題名');await form.getByLabel('元の投稿者名').fill('別の人');await form.getByRole('combobox',{name:'ジャンル',exact:true}).selectOption('game');await form.getByRole('button',{name:'確認して世界に置く',exact:true}).click();await expect(other.locator('.post-detail h2')).toHaveText(film.title);await expect(other.locator('.author-row')).toContainText(film.authorName);
    for(const page of [p,other]){await expect(page.locator('.viewing-box')).toContainText('2人がこの投稿を開いています');await expect(page.locator('.viewer-avatars button')).toHaveCount(0);await expect(page.getByTestId('together-controls')).toHaveCount(0);await expect(page.locator('.bilibili-player')).toHaveCount(0);}
    const boot=await (await other.request.get(origin+'/api/bootstrap')).json();expect(boot.posts.filter((v:{externalUrl:string})=>v.externalUrl===film.url)).toHaveLength(1);expect(boot.favorites).toContain('walk-curated-'+film.bvid);expect(boot.user.shareActivity).toBe(false);
  }finally{await context.close();}
});
test('a phone user retries a failed player and sends an editable playback report to the real moderation queue',async({page:p})=>{
  await p.setViewportSize({width:390,height:844});await start(p);const film=curatedVideos[0];
  await p.getByRole('button',{name:film.title+'を見る',exact:true}).click();await p.getByRole('button',{name:'bilibili公式プレーヤーを開く',exact:true}).click();
  const player=p.locator('.bilibili-player');await player.evaluate(el=>el.setAttribute('data-before-retry','yes'));
  await p.getByText('再生できないとき',{exact:true}).click();await expect(p.getByRole('link',{name:'bilibiliで試す',exact:true})).toHaveAttribute('href',film.url);
  await p.getByRole('button',{name:'プレーヤーを読み直す',exact:true}).click();await expect(player).not.toHaveAttribute('data-before-retry','yes');await expect(player).toHaveAttribute('src',/autoplay=0$/);
  await p.getByRole('button',{name:'再生の問題を知らせる',exact:true}).click();const form=p.getByRole('dialog',{name:'再生の問題を知らせる',exact:true});
  const reason=form.getByRole('textbox',{name:'再生の状況',exact:true});await expect(reason).toHaveValue('再生の問題：bilibili / '+film.title+'\n状況：再生できない\n');
  await reason.fill('再生の問題：bilibili / '+film.title+'\nスマートフォンで中央の再生ボタンが反応しません。');
  let release=()=>{};const gate=new Promise<void>(r=>{release=r;});
  await p.route('**/api/reports',async route=>{const response=await route.fetch();await gate;await route.fulfill({response});});
  try{await form.getByRole('button',{name:'運営へ送る',exact:true}).click();await expect(form.getByRole('button',{name:'送信中…',exact:true})).toBeDisabled();}finally{release();}
  await expect(form).toHaveCount(0);
  await expect(player).toBeAttached();await expect(p.locator('.viewing-box')).toContainText('1人がこの投稿を開いています');
  const login=await p.request.post(origin+'/api/admin/login',{headers:{'x-walk-client':'1'},data:{key:'bilibili-library-browser-admin-key'}});expect(login.ok()).toBe(true);
  const reports=await (await p.request.get(origin+'/api/admin/reports')).json();expect(reports).toHaveLength(1);expect(reports[0]).toMatchObject({targetType:'post',targetId:'walk-curated-'+film.bvid,status:'open',reason:'再生の問題：bilibili / '+film.title+'\nスマートフォンで中央の再生ボタンが反応しません。'});
  const boot=await (await p.request.get(origin+'/api/bootstrap')).json();expect(boot.posts.some((post:{id:string})=>post.id==='walk-curated-'+film.bvid)).toBe(true);
});
test('a private phone room keeps the bilibili start button and real iframe inside its screen at 320px and 390px',async({page:p})=>{
  await p.setViewportSize({width:390,height:844});await start(p);const film=curatedVideos[0];await p.getByRole('button',{name:film.title+'を見る',exact:true}).click();
  await p.getByRole('button',{name:'自分の窓辺に置く',exact:true}).click();await p.getByRole('dialog',{name:'自分の窓辺に置く',exact:true}).getByRole('button',{name:'保存して窓辺で開く',exact:true}).click();await expect(p.getByTestId('room-interior')).toBeVisible();
  const screen=p.locator('.in-room .room-player-content'),opener=p.getByRole('button',{name:'bilibili公式プレーヤーを開く',exact:true});
  for(const width of [320,390]){await p.setViewportSize({width,height:844});const bounds=(await screen.boundingBox())!,button=(await opener.boundingBox())!;expect(button.y).toBeGreaterThanOrEqual(bounds.y);expect(button.y+button.height).toBeLessThanOrEqual(bounds.y+bounds.height);await expect.poll(()=>opener.evaluate(el=>el.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);}
  await opener.click();const player=p.locator('.bilibili-player');await player.evaluate(el=>el.setAttribute('data-room-player','same'));
  for(const width of [320,390]){await p.setViewportSize({width,height:844});const bounds=(await screen.boundingBox())!,frame=(await player.boundingBox())!;expect(frame.y).toBeGreaterThanOrEqual(bounds.y);expect(frame.y+frame.height).toBeLessThanOrEqual(bounds.y+bounds.height+1);expect(frame.height).toBeGreaterThan(bounds.height-12);expect(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);}
  await p.getByRole('button',{name:'大画面で見る',exact:true}).click();await expect(player).toHaveAttribute('data-room-player','same');await expect(p.getByText('再生できないとき',{exact:true})).toBeVisible();await p.getByRole('button',{name:'部屋と見る',exact:true}).click();await expect(player).toHaveAttribute('data-room-player','same');
  await screen.scrollIntoViewIfNeeded();await p.screenshot({path:'artifacts/bilibili-room-390.png',animations:'disabled'});
});
