import {test,expect,type Page} from '@playwright/test';
const music='音が生まれる前の、静かな通り。',game='まだ見ぬ冒険の、待ち合わせ。';
const mutate=(p:Page,path:string,payload:object,method='POST')=>p.request.fetch('/api'+path,{method,headers:{'X-Walk-Client':'1'},data:payload});
async function start(p:Page){await p.goto('/');await p.getByRole('button',{name:'まず動画を見てみる',exact:true}).click();await expect(p.getByRole('dialog',{name:'今日の動画の棚'})).toBeVisible();await expect(p.locator('[role=application][data-ready=true]')).toBeVisible();}
async function shelf(p:Page){await p.locator('.discovery-entry').click();await expect(p.getByRole('dialog',{name:'今日の動画の棚'})).toBeVisible();}
test('first film on a phone: optional interests, real playback, a finite queue and returning to its world',async({browser})=>{
  const c=await browser.newContext({locale:'ja-JP',viewport:{width:390,height:844},isMobile:true,hasTouch:true,timezoneId:'Asia/Tokyo'}),p=await c.newPage(),errors:string[]=[];p.on('pageerror',e=>errors.push(e.message));
  try{
    await start(p);const d=p.getByRole('dialog',{name:'今日の動画の棚'});await expect(d).not.toContainText('動画設定サンプル');await expect(d).toContainText('12秒 · 音声なし');const range=await p.request.get('/films/walk-music.mp4',{headers:{Range:'bytes=0-99'}});expect(range.status()).toBe(206);expect(range.headers()['content-type']).toContain('video/mp4');expect((await range.body()).length).toBe(100);
    await d.getByRole('button',{name:'音楽',exact:true}).click();await d.getByRole('button',{name:'ゲーム',exact:true}).click();await expect(d.getByRole('button',{name:'音楽',exact:true})).toHaveAttribute('aria-pressed','true');
    const saved=d.locator('.discovery-video').filter({has:p.getByRole('heading',{name:music,exact:true})});await saved.getByRole('button',{name:music+'を保存',exact:true}).click();await expect(saved.getByRole('button',{name:music+'の保存を解除',exact:true})).toHaveAttribute('aria-pressed','true');
    expect((await (await p.request.get('/api/bootstrap')).json()).user.shareActivity).toBe(false);
    for(const width of [320,390]){await p.setViewportSize({width,height:844});expect(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);const small=await d.locator('.discovery-interests button,.discovery-video-actions button').evaluateAll(els=>els.filter(el=>el.getBoundingClientRect().height<44).length);expect(small).toBe(0);}
    await expect(p.locator('.toast')).toHaveCount(0);await d.evaluate(el=>el.scrollTo(0,0));await p.screenshot({path:'artifacts/discovery-shelf-390.png',animations:'disabled'});
    await p.reload();await shelf(p);await expect(d.getByRole('button',{name:'音楽',exact:true})).toHaveAttribute('aria-pressed','true');
    await p.route('**/films/walk-music.mp4',route=>route.abort());
    await p.getByRole('button',{name:music+'を見る',exact:true}).click();await expect(p.locator('.post-detail h2')).toHaveText(music);const video=p.locator('.native-video');await expect(p.getByRole('alert')).toContainText('動画を読み込めませんでした');await p.unroute('**/films/walk-music.mp4');await p.getByRole('button',{name:'動画を読み直す',exact:true}).click();await expect.poll(()=>video.evaluate((v:HTMLVideoElement)=>v.readyState)).toBeGreaterThanOrEqual(2);await video.evaluate(async(v:HTMLVideoElement)=>{v.muted=true;await v.play();});const time=await video.evaluate((v:HTMLVideoElement)=>v.currentTime);await expect.poll(()=>video.evaluate((v:HTMLVideoElement)=>v.currentTime)).toBeGreaterThan(time+.2);await expect(p.locator('.viewing-box')).toContainText('1人がこの投稿を開いています');await expect(p.locator('.viewer-avatars button')).toHaveCount(0);
    await p.getByRole('button',{name:'箱庭と見る',exact:true}).click();await p.getByRole('button',{name:'大画面で見る',exact:true}).click();await video.evaluate(async(v:HTMLVideoElement)=>{v.currentTime=v.duration-.2;await v.play();});await expect(p.getByRole('heading',{name:'見終わったら、次の寄り道へ。',exact:true})).toBeVisible();await expect(p.locator('.post-detail h2')).toHaveText(music);
    await p.getByRole('button',{name:'棚の次の一本へ',exact:true}).click();await expect(p.locator('.post-detail h2')).toHaveText(game);await expect(p.getByRole('button',{name:'次の投稿・動画へ',exact:true})).toBeDisabled();
    await p.getByRole('button',{name:'この動画の世界を歩く',exact:true}).click();await expect(p.locator('.map-top')).toContainText('ゲームの世界');await expect(p.locator('.native-video')).toHaveCount(0);
    expect(errors).toEqual([]);
  }finally{await c.close();}
});
test('two newcomers invite each other to an original film and separately consent to actual synchronized playback',async({browser})=>{
  const ca=await browser.newContext({locale:'ja-JP',viewport:{width:390,height:844},isMobile:true,hasTouch:true}),cb=await browser.newContext({locale:'ja-JP',viewport:{width:320,height:844},isMobile:true,hasTouch:true}),a=await ca.newPage(),b=await cb.newPage();
  try{
    await start(a);await a.getByRole('button',{name:music+'を見る',exact:true}).click();await expect(a.locator('.post-detail h2')).toHaveText(music);
    await a.getByRole('button',{name:'友達をこの動画に誘う',exact:true}).click();const link=await a.getByLabel('招待リンク',{exact:true}).inputValue();await a.getByRole('dialog',{name:'この場所に招待'}).getByRole('button',{name:'閉じる',exact:true}).click();
    await b.goto(link);await b.getByRole('button',{name:'名前はあとで、招待先を確認',exact:true}).click();await expect(b.getByRole('dialog',{name:'WALKへの招待'})).toBeVisible();await expect(b.getByRole('dialog',{name:'今日の動画の棚'})).toHaveCount(0);await expect(b.locator('.native-video')).toHaveCount(0);await expect(a.locator('.viewing-box')).toContainText('1人がこの投稿を開いています');await b.getByRole('button',{name:'この場所へ行く',exact:true}).click();await expect(b.locator('.post-detail h2')).toHaveText(music);await b.getByRole('button',{name:'大画面で見る',exact:true}).click();
    const bid=(await (await b.request.get('/api/bootstrap')).json()).user.id;await mutate(a,'/friendships',{targetId:bid});const f=(await (await b.request.get('/api/bootstrap')).json()).friendships[0];await mutate(b,'/friendships/'+f.id,{action:'accept'},'PATCH');
    await a.getByRole('button',{name:'友達をこの動画に誘う',exact:true}).click();await a.getByRole('button',{name:'ここに招待',exact:true}).click();await a.getByRole('dialog',{name:'この場所に招待'}).getByRole('button',{name:'閉じる',exact:true}).click();
    await expect(b.getByTestId('together-controls')).not.toContainText('同期視聴 ·');
    await a.getByRole('button',{name:/友達と、同じ瞬間を/}).click();await a.getByLabel('名前とアバターを参加者に表示し、動画を同期して見ることに同意する').check();await a.getByRole('button',{name:'同期視聴を始める',exact:true}).click();await a.getByRole('button',{name:'同期視聴に招待',exact:true}).click();await a.getByRole('button',{name:'動画へ戻る',exact:true}).click();
    await b.getByRole('button',{name:/一緒に見る招待/}).click();await expect(b.getByRole('button',{name:'同意して一緒に見る',exact:true})).toBeDisabled();await b.getByLabel('内容を確認し、同期視聴への参加に同意する').check();await b.getByRole('button',{name:'同意して一緒に見る',exact:true}).click();
    const av=a.locator('.native-video'),bv=b.locator('.native-video');for(const p of [a,b])await expect(p.getByTestId('together-controls')).toContainText('同期視聴 · 2人');
    await expect.poll(()=>bv.evaluate((v:HTMLVideoElement)=>v.readyState)).toBeGreaterThanOrEqual(2);await av.evaluate((v:HTMLVideoElement)=>{v.pause();v.currentTime=4;});// Paused synchronization intentionally allows 80ms drift; do not demand frame-perfect 50ms.
    await expect.poll(()=>bv.evaluate((v:HTMLVideoElement)=>Math.abs(v.currentTime-4))).toBeLessThanOrEqual(.1);
    for(const p of [a,b]){expect((await (await p.request.get('/api/bootstrap')).json()).user.shareActivity).toBe(false);await expect(p.locator('.viewer-avatars button')).toHaveCount(0);await expect(p.locator('.viewing-box')).toContainText('2人がこの投稿を開いています');}
    await b.screenshot({path:'artifacts/discovery-together-320.png',animations:'disabled'});
    await a.getByRole('button',{name:'次の投稿・動画へ',exact:true}).click();await expect(a.locator('.post-detail h2')).not.toHaveText(music);await expect(b.locator('.post-detail h2')).toHaveText(music);await expect(b.getByTestId('together-controls')).not.toContainText('同期視聴 ·');
  }finally{await ca.close();await cb.close();}
});
