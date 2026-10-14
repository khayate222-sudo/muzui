import {test,expect} from '@playwright/test';
import {fileURLToPath} from 'node:url';
test('mobile creator posts a real uploaded video, plays it, finds WALK originals and manages own posts',async({browser})=>{
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});const page=await context.newPage(),errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  try{
    await page.goto('/');await page.getByLabel('ニックネーム').fill('ゲーム投稿者');await page.getByRole('button',{name:'WALKをはじめる'}).click();await expect(page.locator('[role=application][data-ready=true]')).toBeVisible();
    await page.locator('.quick-discovery').getByRole('button',{name:'＋ WALKに投稿',exact:true}).click();await page.getByLabel('投稿タイトル',{exact:true}).fill('WALKだけのゲーム制作日記');await page.getByLabel('本文',{exact:true}).fill('自分で制作した小さな映像です。');await page.locator('input[type=file]').setInputFiles(fileURLToPath(new URL('../fixtures/walk-original.webm',import.meta.url)));await expect(page.locator('.collection-form video')).toBeVisible();
    await page.getByRole('button',{name:'広場に公開する',exact:true}).click();await expect(page.locator('.post-detail h2')).toHaveText('WALKだけのゲーム制作日記');await expect(page.locator('.post-meta .native-badge')).toHaveText('WALK発');await expect(page.locator('.author-row')).toContainText('ゲーム投稿者');
    const video=page.locator('.post-detail video');await expect.poll(()=>video.evaluate((el:HTMLVideoElement)=>el.readyState)).toBeGreaterThanOrEqual(2);await video.evaluate(async(el:HTMLVideoElement)=>{el.muted=true;await el.play();});await expect.poll(()=>video.evaluate((el:HTMLVideoElement)=>el.currentTime)).toBeGreaterThan(0);
    await page.getByRole('dialog').getByRole('button',{name:'閉じる',exact:true}).click();await page.locator('.quick-discovery').getByRole('button',{name:'WALK発の投稿',exact:true}).click();await expect(page.getByRole('button',{name:'WALKだけのゲーム制作日記',exact:true})).toBeVisible();await page.getByRole('dialog').getByRole('button',{name:'閉じる',exact:true}).click();
    for(const width of[390,320]){await page.setViewportSize({width,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);}
    await page.locator('.mobile-nav').getByRole('button',{name:'あなた',exact:true}).click();await page.getByRole('button',{name:'自分のWALK投稿を見る',exact:true}).click();await page.getByRole('button',{name:'削除する',exact:true}).click();await page.getByRole('button',{name:'投稿の削除を確定',exact:true}).click();await expect(page.getByRole('dialog').last()).toContainText('最初の「好き」を投稿してみよう。');expect(errors).toEqual([]);
  }finally{await context.close();}
});
