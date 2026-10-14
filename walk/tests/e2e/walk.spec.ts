import { test, expect, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
const title='ここでは、寄り道が正解。';
async function onboard(page:Page,name:string,share=true){await page.goto('/');const modal=page.getByRole('dialog',{name:'WELCOME TO WALK'});await expect(modal).toBeVisible();await modal.getByLabel('ニックネーム').fill(name);if(share)await modal.locator('input[name=share]').check();await modal.getByRole('button',{name:'WALKをはじめる'}).click();await expect(modal).toBeHidden();await expect(page.locator('[role=application][data-ready=true]')).toBeVisible();await expect(page.locator('.connection')).toContainText('人が散歩中');}
async function openPost(page:Page,name=title){await page.getByRole('button',{name:'投稿を探す',exact:true}).click();await page.getByRole('dialog').getByLabel('投稿を絞り込む').fill(name);await page.getByRole('button',{name,exact:true}).click();await expect(page.getByRole('dialog',{name:'A LITTLE DISCOVERY'})).toBeVisible();}
async function closeTop(page:Page){await page.getByRole('dialog').last().getByRole('button',{name:'閉じる',exact:true}).click();}
const position=(page:Page)=>page.getByTestId('player-position').textContent().then(s=>JSON.parse(s||'null') as {x:number;y:number});
test('two guests: movement, deduplicated viewers, persistence, approval, realtime chat, report and block',async({browser})=>{
  await mkdir('artifacts',{recursive:true});
  const ca=await browser.newContext({viewport:{width:1512,height:982}}),cb=await browser.newContext({viewport:{width:1512,height:982}});
  const errors:string[]=[];let a=await ca.newPage();const b=await cb.newPage();for(const p of[a,b]){p.on('pageerror',e=>errors.push(e.message));p.on('console',m=>{if(m.type()==='error')errors.push(m.text());});}
  try{
    await onboard(a,'テストA');await onboard(b,'テストB');await expect(a.locator('.connection')).toContainText('2人が散歩中');
    await a.screenshot({path:'artifacts/walk-desktop.png',fullPage:true});
    const before=await position(a);await a.bringToFront();await a.getByRole('application').focus();await a.keyboard.down('ArrowRight');try { await expect.poll(async()=>(await position(a)).x).toBeGreaterThan(before.x+35); } finally { await a.keyboard.up('ArrowRight'); }
    const aid=(await a.request.get('/api/bootstrap')).json().then(d=>d.user.id);const id=await aid;
    await expect.poll(async()=>JSON.parse(await b.getByTestId('peer-positions').textContent()||'[]').find((p:{id:string})=>p.id===id)?.x).toBeGreaterThan(before.x+35);
    await openPost(a);await openPost(b);await expect(a.getByText('2人がこの投稿を開いています',{exact:true})).toBeVisible();await expect(b.getByText('2人がこの投稿を開いています',{exact:true})).toBeVisible();
    const tab=await ca.newPage();await tab.goto('/');await openPost(tab);await expect(tab.getByText('2人がこの投稿を開いています',{exact:true})).toBeVisible();
    await a.close();await expect(b.getByText('2人がこの投稿を開いています',{exact:true})).toBeVisible();await tab.close();await expect(b.getByText('1人がこの投稿を開いています',{exact:true})).toBeVisible();
    await b.getByRole('button',{name:'お気に入りに保存',exact:true}).click();await expect(b.getByRole('button',{name:'保存済み',exact:true})).toBeVisible();await b.reload();await openPost(b);await expect(b.getByRole('button',{name:'保存済み',exact:true})).toBeVisible();
    await b.getByRole('button',{name:'投稿を通報'}).click();await b.getByLabel('通報理由').fill('E2Eテストからの確認用通報');await b.getByRole('button',{name:'通報を送る',exact:true}).click();await expect(b.getByText('通報を受け付けました。管理者が確認します。')).toBeVisible();
    await closeTop(b);await closeTop(b); // close post and explorer
    a=await ca.newPage();await a.goto('/');await expect(a.locator('.connection')).toContainText('2人が散歩中');
    await a.locator('.right-sidebar').getByRole('button',{name:/テストB/}).click();await a.getByRole('button',{name:'交流リクエストを送る'}).click();await closeTop(a);
    await b.getByRole('button',{name:'通知',exact:true}).click();await expect(b.locator('.request-row')).toContainText('テストA');await b.getByRole('button',{name:'承認',exact:true}).click();await b.locator('.social-people').getByRole('button',{name:/テストA/}).click();
    await a.getByRole('button',{name:'つながりとチャット',exact:true}).click();await a.locator('.social-people').getByRole('button',{name:/テストB/}).click();
    const message='<img src=x onerror="window.__xss=1"> 同じ投稿、好きです！';await a.getByLabel('メッセージ',{exact:true}).fill(message);await a.getByRole('button',{name:'メッセージを送信',exact:true}).click();await expect(b.getByRole('log')).toContainText(message);await expect(a.getByRole('log')).toContainText(message);expect(await b.evaluate(()=>Object.hasOwn(window,'__xss'))).toBe(false);
    await b.screenshot({path:'artifacts/walk-chat.png',fullPage:true});await b.reload();await b.getByRole('button',{name:'つながりとチャット',exact:true}).click();await b.locator('.social-people').getByRole('button',{name:/テストA/}).click();await expect(b.getByRole('log')).toContainText(message);
    await b.getByRole('button',{name:'チャット相手のプロフィール'}).click();await b.getByRole('button',{name:'ブロック',exact:true}).click();await expect(b.locator('.social-people')).not.toContainText('テストA');
    const bid=(await (await b.request.get('/api/bootstrap')).json()).user.id;expect((await a.request.get('/api/messages/'+bid)).status()).toBe(403);
    expect(errors).toEqual([]);
  }finally{await ca.close();await cb.close();}
});
test('mobile onboarding, tap movement, area shortcut, search, saving and private profile persist',async({browser})=>{
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});const page=await context.newPage();const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  try{
    await page.goto('/');await page.screenshot({path:'artifacts/walk-welcome-mobile.png',fullPage:true});await page.getByLabel('ニックネーム').fill('モバイル旅人');await page.getByRole('button',{name:'WALKをはじめる'}).click();await expect(page.locator('canvas')).toBeVisible();
    const old=await position(page);const box=await page.locator('canvas').boundingBox();await page.touchscreen.tap(box!.x+box!.width*.65,box!.y+box!.height*.5);await expect.poll(async()=>Math.hypot((await position(page)).x-old.x,(await position(page)).y-old.y)).toBeGreaterThan(15);
    await page.locator('.area-dock').getByRole('button',{name:'音楽',exact:true}).tap();await expect(page.locator('.map-top')).toContainText('MUSIC STREET');await expect.poll(async()=>(await position(page)).x).toBe(540);
    await page.waitForTimeout(650);await page.screenshot({path:'artifacts/walk-mobile.png',fullPage:true});
    await openPost(page,'雨の日のプレイリスト');await page.getByRole('button',{name:'お気に入りに保存',exact:true}).tap();await expect(page.getByRole('button',{name:'保存済み',exact:true})).toBeVisible();await closeTop(page);await closeTop(page);
    await page.locator('.mobile-nav').getByRole('button',{name:'あなた',exact:true}).tap();expect(await page.locator('input[name=share]').isChecked()).toBe(false);await page.getByLabel('ニックネーム').fill('モバイル保存済み');await page.getByRole('button',{name:'変更を保存',exact:true}).tap();await page.reload();
    await page.locator('.mobile-nav').getByRole('button',{name:'あなた',exact:true}).tap();await expect(page.getByLabel('ニックネーム')).toHaveValue('モバイル保存済み');expect(await page.locator('input[name=share]').isChecked()).toBe(false);await closeTop(page);
    for(const width of[390,320]){await page.setViewportSize({width,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.locator('.mobile-nav').getByRole('button',{name:'保存',exact:true}).tap();await expect(page.getByRole('button',{name:'雨の日のプレイリスト',exact:true})).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await closeTop(page);}
    expect(errors).toEqual([]);
  }finally{await context.close();}
});
test('administrator creates, edits and removes posts; reports are restricted; video samples are explicit',async({page})=>{
  await onboard(page,'管理者テスト',false);
  await openPost(page);await page.getByRole('button',{name:'投稿を通報'}).click();await page.getByLabel('通報理由').fill('E2Eテストからの確認用通報');await page.getByRole('button',{name:'通報を送る',exact:true}).click();await expect(page.getByRole('dialog',{name:'通報を送信'})).toBeHidden();await closeTop(page);await closeTop(page);
  expect((await page.request.get('/api/admin/reports')).status()).toBe(403);
  await page.getByRole('button',{name:'管理画面',exact:true}).click();await page.getByLabel('管理者キー').fill('e2e-only-admin-key-12345678901234567890');await page.getByRole('button',{name:'認証する',exact:true}).click();await expect(page.getByRole('heading',{name:'世界に、新しい発見を。'})).toBeVisible();
  await page.getByRole('button',{name:'投稿を追加',exact:true}).click();await page.getByLabel('投稿タイトル').fill('管理画面から生まれた投稿');await page.getByLabel('投稿本文').fill('これは管理UIの実動作を確認する投稿です。');await page.getByRole('button',{name:'保存する',exact:true}).click();await expect(page.locator('.admin-posts')).toContainText('管理画面から生まれた投稿');
  await page.getByRole('button',{name:'管理画面から生まれた投稿を編集',exact:true}).click();await page.getByLabel('投稿タイトル').fill('編集して保存した投稿');await page.getByRole('button',{name:'保存する',exact:true}).click();await expect(page.locator('.admin-posts')).toContainText('編集して保存した投稿');
  await page.getByRole('button',{name:'編集して保存した投稿を削除',exact:true}).click();await page.getByRole('button',{name:'削除を確定',exact:true}).click();await expect(page.locator('.admin-posts')).not.toContainText('編集して保存した投稿');await page.getByRole('button',{name:'更新する',exact:true}).click();await expect(page.locator('.admin-reports')).toContainText('E2Eテストからの確認用通報');await closeTop(page);
  await openPost(page,'街を歩く、音を探す');await expect(page.getByRole('heading',{name:'動画設定用サンプル',exact:true})).toBeVisible();await expect(page.locator('iframe')).toHaveCount(0);
});
