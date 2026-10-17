import {test,expect,type Page} from '@playwright/test';

async function onboard(p:Page,name:string){await p.goto('/');await p.getByLabel('ニックネーム').fill(name);await p.locator('input[name=share]').check();await p.getByRole('button',{name:'WALKをはじめる',exact:true}).click();await expect(p.locator('[role=application][data-ready=true]')).toBeVisible();}
test('residents create, visit, publish and see real viewers in their own nested world on phones',async({browser})=>{
  const ca=await browser.newContext({locale:'ja-JP',viewport:{width:390,height:844},isMobile:true,hasTouch:true,timezoneId:'Asia/Tokyo'}),cb=await browser.newContext({locale:'ja-JP',viewport:{width:320,height:844},isMobile:true,hasTouch:true,timezoneId:'Asia/Tokyo'});
  const a=await ca.newPage(),b=await cb.newPage(),errors:string[]=[],missing:string[]=[];
  for(const p of [a,b]){p.on('pageerror',e=>errors.push(e.message));p.on('response',r=>{if(r.url().includes('/art/')&&!r.ok())missing.push(r.url());});}
  try{
    await onboard(a,'庭をつくる人');await onboard(b,'音を見つける人');
    for(const p of [a,b]){await p.locator('.area-dock').getByRole('button',{name:'音楽',exact:true}).click();await expect(p.locator('.map-top')).toContainText('音楽の世界');}
    await a.getByRole('button',{name:'世界を育てる',exact:true}).click();
    await a.getByRole('button',{name:'この先に世界を作る',exact:true}).click();
    await a.getByLabel('世界の名前').fill('静かなピアノの庭');await a.getByLabel('世界の紹介').fill('練習の途中も、一緒に聴こう。');await a.getByRole('radio',{name:'音楽の中庭',exact:true}).check();
    expect(await a.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await a.screenshot({animations:'disabled',path:'artifacts/resident-world-workshop-mobile.png'});
    await a.getByRole('button',{name:'世界を作って訪問',exact:true}).click();
    await expect(a.locator('.world-path')).toContainText('静かなピアノの庭');await expect(a.locator('[role=application][data-ready=true]')).toBeVisible();
    // The second session sees the new entrance without reloading its page.
    await expect(b.locator('.world-gates').getByRole('button',{name:'静かなピアノの庭',exact:true})).toBeVisible();
    await b.locator('.world-gates').getByRole('button',{name:'静かなピアノの庭',exact:true}).click();await expect(b.locator('.world-path')).toContainText('静かなピアノの庭');
    await expect.poll(async()=>JSON.parse((await a.getByTestId('peer-positions').textContent())||'[]').length).toBe(2);
    await b.getByRole('button',{name:'世界を育てる',exact:true}).click();await expect(b.getByRole('button',{name:'この先に世界を作る',exact:true})).toHaveCount(0);await expect(b.getByRole('button',{name:'この世界の作成者を通報',exact:true})).toBeVisible();await b.getByRole('button',{name:'閉じる',exact:true}).click();
    await a.locator('.quick-discovery').getByRole('button',{name:'＋ WALKに投稿',exact:true}).click();
    await expect(a.getByLabel('ジャンル',{exact:true})).toHaveValue('music');const worldId=await a.getByLabel('投稿する世界',{exact:true}).inputValue();expect(worldId).toMatch(/^resident:/);
    await a.getByLabel('投稿タイトル',{exact:true}).fill('ピアノ練習の一頁');await a.getByLabel('本文',{exact:true}).fill('今日覚えた、短いメロディー。');await a.getByRole('button',{name:'広場に公開する',exact:true}).click();await expect(a.locator('.post-detail h2')).toHaveText('ピアノ練習の一頁');
    const postId=await a.evaluate(async()=>{const r=await fetch('/api/bootstrap');const data=await r.json();return data.posts.find((p:{title:string})=>p.title==='ピアノ練習の一頁').id;});
    await b.goto('/#/post/'+encodeURIComponent(postId));await b.getByRole('button',{name:'この場所へ行く',exact:true}).click();await expect(b.locator('.post-detail h2')).toHaveText('ピアノ練習の一頁');
    for(const p of [a,b]){await expect(p.locator('.viewing-box')).toContainText('2人がこの投稿を開いています');await expect(p.locator('.viewer-avatars button')).toHaveCount(2);}
    await a.getByRole('button',{name:'閉じる',exact:true}).click();
    await a.getByRole('button',{name:'世界を育てる',exact:true}).click();await a.getByRole('button',{name:'世界の案内を編集',exact:true}).click();await a.getByLabel('世界の名前').fill('ピアノと夕暮れの庭');await a.getByRole('button',{name:'案内を保存',exact:true}).click();await expect(a.locator('.world-path')).toContainText('ピアノと夕暮れの庭');
    await expect(b.locator('.world-path')).toContainText('ピアノと夕暮れの庭');await a.reload();await expect(a.locator('[role=application][data-ready=true]')).toBeVisible();
    await a.goto('/#/world/'+encodeURIComponent(worldId));await a.getByRole('button',{name:'この場所へ行く',exact:true}).click();await expect(a.locator('.world-path')).toContainText('ピアノと夕暮れの庭');
    await a.getByLabel('箱庭の光').selectOption('afternoon');await expect(a.locator('.toast')).toHaveCount(0);await a.screenshot({animations:'disabled',path:'artifacts/resident-world-mobile.png'});
    await a.locator('.world-gates').getByRole('button',{name:'ひとつ戻る'}).click();await expect(a.locator('.map-top')).toContainText('音楽の世界');
    for(const p of [a,b])expect(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    expect(errors).toEqual([]);expect(missing).toEqual([]);
  }finally{await ca.close();await cb.close();}
});
