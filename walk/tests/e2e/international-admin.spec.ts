import {test,expect,type Page} from '@playwright/test';
import {resolve} from 'node:path';
import {createApp} from '../../server/app';
import {t,tr} from '../../src/i18n';
import type {Locale} from '../../shared/locale';

const key='international-admin-browser-fixture-key',channel='UC'+'c'.repeat(22),videoId='M7lc1UVf-VE';
// Names, content and notes intentionally match translation keys and contain
// replacement metacharacters. They must remain literal user/source content.
const sourceName='任天堂公式',title='削除済み',body='不思議な駅 $& {count}',note='対応済み $& {count}';
let instance:Awaited<ReturnType<typeof createApp>>,origin:string,feedFails:boolean;
test.beforeEach(async()=>{
  feedFails=true;
  instance=await createApp({database:':memory:',adminKey:key,collectionFeed:async id=>{
    if(feedFails)throw new Error('登録チャンネルと取得結果が一致しません');
    return `<feed xmlns:yt="http://www.youtube.com/xml/schemas/2015"><yt:channelId>${id}</yt:channelId><entry><yt:videoId>${videoId}</yt:videoId><title>${title}</title><author><name>${sourceName}</name></author><published>2026-10-01T10:00:00Z</published></entry></feed>`;
  }});
  await instance.app.register(import('@fastify/static'),{root:resolve('dist')});
  origin=await instance.app.listen({host:'127.0.0.1',port:0});
});
test.afterEach(async()=>{instance.io.disconnectSockets(true);await instance.app.close();});
const languages:[string,Locale,string,string][]=[['en-US','en','Add source','Review candidate'],['zh-CN','zh-Hans','添加来源','审核候选内容'],['zh-TW','zh-Hant','新增來源','審核候選內容']];
for(const [deviceLocale,locale,addSource,reviewCandidate] of languages)test('international administrator collection, editing and moderation in '+deviceLocale,async({browser})=>{
  const context=await browser.newContext({baseURL:origin,locale:deviceLocale,viewport:{width:1512,height:982}}),p=await context.newPage(),copy=(s:string)=>t(s,locale);
  const request=async(path:string,data?:object,method=data?'POST':'GET')=>p.request.fetch('/api'+path,{method,headers:{'x-walk-client':'1'},data});
  const button=(name:string)=>p.getByRole('button',{name:copy(name),exact:true});
  const fits=async(p:Page)=>expect(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  try{
    await p.route('https://www.youtube-nocookie.com/embed/**',route=>route.fulfill({contentType:'text/html',body:'Official player boundary fixture, not live playback.'}));
    await p.route('https://i.ytimg.com/**',route=>route.fulfill({contentType:'image/png',body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aN1cAAAAASUVORK5CYII=','base64')}));
    await p.goto('/');await button('まず動画を見てみる').click();
    await p.getByRole('dialog',{name:copy('今日の動画の棚'),exact:true}).getByRole('button',{name:copy('閉じる'),exact:true}).click();
    await button('管理画面').click();await p.setViewportSize({width:320,height:844});
    const admin=p.getByRole('dialog',{name:copy('WALK STUDIO / 管理'),exact:true});
    await admin.getByLabel(copy('管理者キー'),{exact:true}).fill('incorrect-key');await button('認証する').click();
    await expect(p.locator('.toast')).toHaveText(copy('管理者キーが正しくありません'));
    await admin.getByLabel(copy('管理者キー'),{exact:true}).fill(key);await button('認証する').click();
    await expect(admin.getByRole('heading',{name:copy('世界に、新しい発見を。'),exact:true})).toBeVisible();
    await admin.getByLabel(copy('収集するチャンネル'),{exact:true}).fill('@not-a-channel-id');
    await admin.getByLabel(copy('収集元の名前'),{exact:true}).fill(sourceName);await admin.getByRole('button',{name:addSource,exact:true}).click();
    await expect(p.locator('.toast')).toContainText(copy('YouTubeのUCから始まるチャンネルID、または /channel/UC… のURLを入力してください。@名前のURLは未対応です。'));
    await admin.getByLabel(copy('収集するチャンネル'),{exact:true}).fill(channel);await admin.getByRole('button',{name:addSource,exact:true}).click();
    const source=admin.locator('.source-row').filter({has: p.locator('strong',{hasText:sourceName})});
    await source.getByRole('button',{name:copy('今すぐ取得'),exact:true}).click();
    await expect(source.getByRole('status')).toHaveText(copy('登録チャンネルと取得結果が一致しません'));
    expect((await(await request('/admin/collections')).json()).sources[0].last_error).toBe('登録チャンネルと取得結果が一致しません');
    feedFails=false;await source.getByRole('button',{name:copy('今すぐ取得'),exact:true}).click();
    await expect(source.getByRole('status')).toHaveCount(0);await expect(source.locator('strong')).toHaveText(sourceName);
    await admin.getByRole('button',{name:reviewCandidate,exact:true}).click();
    const review=admin.getByRole('region',{name:tr('{title}の公開前確認',{title},locale)});
    const publish=review.getByRole('button',{name:copy('広場に公開'),exact:true});await expect(publish).toBeDisabled();
    await review.getByLabel(tr('{title}の公開先',{title},locale),{exact:true}).selectOption('world:game-rpg');
    await review.getByLabel(copy('出典・内容・掲載条件と公開先を確認しました'),{exact:true}).check();await fits(p);
    await p.screenshot({path:'artifacts/admin-review-'+locale+'-320.png',animations:'disabled'});
    await publish.click();
    const post=(await(await request('/bootstrap')).json()).posts.find((post:{externalUrl:string})=>post.externalUrl==='https://www.youtube.com/watch?v='+videoId);
    expect(post).toMatchObject({title,authorName:sourceName,worldId:'world:game-rpg'});
    await admin.getByRole('button',{name:tr('{title}を編集',{title},locale),exact:true}).click();
    await admin.getByLabel(copy('投稿本文'),{exact:true}).fill(body);await button('保存する').click();
    expect((await(await request('/bootstrap')).json()).posts.find((p:{id:string})=>p.id===post.id).body).toBe(body);
    expect((await request('/reports',{targetType:'post',targetId:post.id,reason:body})).ok()).toBe(true);
    await button('更新する').click();
    const report=admin.locator('.moderation-queue article').filter({has:p.getByRole('heading',{name:title,exact:true})});
    await expect(report.getByRole('heading')).toHaveText(title);await expect(report.locator('p').first()).toHaveText(body);
    await report.getByRole('button',{name:copy('対応済みにする'),exact:true}).click();
    await admin.getByLabel(copy('対応メモ'),{exact:true}).fill(note);await button('対応を確定する').click();
    await admin.locator('.moderation-queue .filter-tabs').getByRole('button',{name:copy('すべて'),exact:true}).click();
    await expect(report).toContainText(tr('対応メモ：{note}',{note},locale));
    expect((await(await request('/admin/reports')).json())[0]).toMatchObject({status:'resolved',moderationNote:note,targetLabel:title,targetDeleted:false});
    await admin.getByRole('button',{name:tr('{title}を削除',{title},locale),exact:true}).click();await button('削除を確定').click();
    await button('更新する').click();
    await expect(admin.locator('.moderation-queue article h4')).toHaveText(copy('削除済み'));
    expect((await(await request('/admin/reports')).json())[0].targetDeleted).toBe(true);
    await fits(p);
  }finally{await context.close();}
});
