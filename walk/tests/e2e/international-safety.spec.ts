import {test,expect,type Page} from '@playwright/test';
import {resolve} from 'node:path';
import {createApp} from '../../server/app';
import {curatedVideos} from '../../shared/curated-videos';
import {t,tr,type Locale} from '../../src/i18n';

const key='international-safety-browser-key';
let instance:Awaited<ReturnType<typeof createApp>>,origin:string;
test.beforeEach(async()=>{
  instance=await createApp({database:':memory:',adminKey:key});
  await instance.app.register(import('@fastify/static'),{root:resolve('dist')});
  origin=await instance.app.listen({host:'127.0.0.1',port:0});
});
test.afterEach(async()=>{instance.io.disconnectSockets(true);await instance.app.close();});
const languages:[string,Locale,string,string][]=[['en-US','en','Details: video will not play','This invitation is unavailable.'],['zh-CN','zh-Hans','情况：无法播放','此邀请不可用'],['zh-TW','zh-Hant','情況：無法播放','此邀請無法使用']];
async function onboard(page:Page,name:string,locale:Locale){
  await page.getByLabel(t('ニックネーム',locale),{exact:true}).fill(name);
  await page.getByRole('button',{name:t('WALKをはじめる',locale),exact:true}).click();
  await expect(page.locator('[role=application][data-ready=true]')).toBeVisible();
}
for(const [deviceLocale,locale,details,unavailable] of languages){
  test('localized playback report is editable and preserves the original post in '+deviceLocale,async({browser})=>{
    const context=await browser.newContext({baseURL:origin,locale:deviceLocale,viewport:{width:320,height:844}}),p=await context.newPage(),copy=(s:string)=>t(s,locale),film=curatedVideos[0];
    try{
      await p.route('https://player.bilibili.com/**',r=>r.fulfill({contentType:'text/html',body:'Player boundary fixture. Not real playback.'}));
      await p.goto('/');await p.getByRole('button',{name:copy('まず動画を見てみる'),exact:true}).click();
      await p.getByRole('dialog',{name:copy('今日の動画の棚'),exact:true}).getByRole('button',{name:film.title+copy('を見る'),exact:true}).click();
      await p.getByRole('button',{name:copy('bilibili公式プレーヤーを開く'),exact:true}).click();
      await p.getByText(copy('再生できないとき'),{exact:true}).click();await p.getByRole('button',{name:copy('再生の問題を知らせる'),exact:true}).click();
      const form=p.getByRole('dialog',{name:copy('再生の問題を知らせる'),exact:true}),reason=form.getByRole('textbox',{name:copy('再生の状況'),exact:true});
      await expect(reason).toHaveValue(copy('再生の問題：')+'bilibili / '+film.title+'\n'+details+'\n');
      const edited='My device / 我的设备 / 我的裝置 $& {count}';await reason.fill(edited);await expect(reason).toHaveValue(edited);
      expect(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
      await p.screenshot({path:'artifacts/international-report-'+locale+'-320.png',animations:'disabled'});
      await form.getByRole('button',{name:copy('運営へ送る'),exact:true}).click();await expect(form).toHaveCount(0);
      const headers={'x-walk-client':'1'};expect((await p.request.post('/api/admin/login',{headers,data:{key}})).ok()).toBe(true);
      const reports=await(await p.request.get('/api/admin/reports')).json();expect(reports).toHaveLength(1);expect(reports[0]).toMatchObject({targetId:'walk-curated-'+film.bvid,reason:edited,targetLabel:film.title,status:'open'});
      await expect(p.locator('.post-detail h2')).toHaveText(film.title);await expect(p.locator('.bilibili-player')).toHaveCount(1);await expect(p.locator('.viewer-avatars button')).toHaveCount(0);
    }finally{await context.close();}
  });
  test('localized watch invitation requires consent and a revoked preview stops before viewing in '+deviceLocale,async({browser})=>{
    const hostContext=await browser.newContext({baseURL:origin,locale:'en-US',viewport:{width:390,height:844}}),guestContext=await browser.newContext({baseURL:origin,locale:deviceLocale,viewport:{width:320,height:844}}),host=await hostContext.newPage(),guest=await guestContext.newPage(),copy=(s:string)=>t(s,locale),hostName='Host $& {count}',guestName='Guest $& {name}';
    const errors:string[]=[];for(const p of [host,guest])p.on('pageerror',e=>errors.push(e.message));
    try{
      await host.goto('/');await onboard(host,hostName,'en');await host.locator('.discovery-entry').click();await host.locator('.discovery-cover').first().click();
      const title=await host.locator('.post-detail h2').innerText();
      await host.getByRole('button',{name:t('友達と、同じ瞬間を。','en')}).click();
      await host.getByLabel(t('名前とアバターを参加者に表示し、動画を同期して見ることに同意する','en'),{exact:true}).check();
      await host.getByRole('button',{name:t('同期視聴を始める','en'),exact:true}).click();
      await host.getByLabel(t('リンクを持つ人に、自分の名前・アバターと動画のタイトルを見せる','en'),{exact:true}).check();
      await host.getByRole('button',{name:t('初めての友達へのリンクを作る','en'),exact:true}).click();
      const url=await host.getByLabel(t('一緒に見る招待リンク','en'),{exact:true}).inputValue();
      await guest.goto(url);await onboard(guest,guestName,locale);
      const landing=guest.getByRole('dialog',{name:copy('友達と一緒に見る招待'),exact:true}),proceed=landing.getByRole('button',{name:copy('交流を申し込んで動画へ'),exact:true});
      await expect(landing).toContainText(title);await expect(landing).toContainText(hostName);await expect(proceed).toBeDisabled();
      await expect(guest.locator('.native-video')).toHaveCount(0);expect((await(await guest.request.get('/api/bootstrap')).json()).friendships).toEqual([]);
      await landing.getByLabel(tr('{name}の名前・アバターを招待者に見せ、交流を申し込むことに同意する',{name:guestName},locale),{exact:true}).check();
      await proceed.click();await expect(guest.locator('.watch-link-waiting')).toContainText(tr('{name}が同期視聴に誘うと、参加の確認が届きます。今は自分のペースで動画を見られます。',{name:hostName},locale));
      const boot=await(await guest.request.get('/api/bootstrap')).json();expect(boot.friendships).toHaveLength(1);expect(boot.friendships[0].status).toBe('pending');expect(boot.user.shareActivity).toBe(false);
      await expect(guest.getByTestId('together-controls').locator('.together-status')).toHaveCount(0);
      await guest.locator('.watch-controls').getByRole('button',{name:copy('閉じる'),exact:true}).click();
      await expect(guest.locator('.native-video')).toHaveCount(0);
      await guest.goto(url);await expect(landing).toContainText(title);
      await expect(host.locator('.viewing-box strong')).toHaveText('1'+t('人がこの投稿を開いています','en'));
      await expect(landing.getByRole('button',{name:copy('動画を開いて承認を待つ'),exact:true})).toBeDisabled();
      await expect(landing.getByLabel(tr('{name}の名前・アバターを招待者に見せ、この動画を開くことに同意する',{name:guestName},locale),{exact:true})).not.toBeChecked();
      await host.getByRole('button',{name:t('この招待リンクを取り消す','en'),exact:true}).click();
      await expect(landing.getByRole('alert')).toContainText(unavailable);await expect(landing.getByRole('button',{name:copy('動画を開いて承認を待つ'),exact:true})).toHaveCount(0);
      await expect(guest.locator('.native-video')).toHaveCount(0);expect((await(await guest.request.get('/api/bootstrap')).json()).user.shareActivity).toBe(false);
      expect(await guest.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
      await guest.screenshot({path:'artifacts/international-invitation-unavailable-'+locale+'-320.png',animations:'disabled'});expect(errors).toEqual([]);
    }finally{await hostContext.close();await guestContext.close();}
  });
}
