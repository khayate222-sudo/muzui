import { test,expect,type Page } from '@playwright/test';
declare global { interface Window { __walkRTC:RTCPeerConnection[];__walkStreams:MediaStream[] } }
async function onboard(p:Page,name:string){await p.goto('/');await p.getByLabel('ニックネーム').fill(name);await p.locator('input[name=share]').check();await p.getByRole('button',{name:'WALKをはじめる'}).click();await expect(p.locator('[role=application][data-ready=true]')).toBeVisible();await expect(p.locator('.connection')).toContainText('人が散歩中');}
async function close(p:Page){await p.getByRole('dialog').last().getByRole('button',{name:'閉じる',exact:true}).click();}
const json=async(p:Page,path:string)=>(await p.request.get('/api'+path)).json();
const mutate=(p:Page,path:string,data:object,method='POST')=>p.request.fetch('/api'+path,{method,headers:{'X-Walk-Client':'1'},data});
async function openPost(p:Page,title:string){await p.getByRole('button',{name:'投稿を探す',exact:true}).click();await p.getByLabel('投稿を絞り込む').fill(title);await p.getByRole('button',{name:title,exact:true}).click();await expect(p.getByRole('dialog',{name:'A LITTLE DISCOVERY'})).toBeVisible();}
test('one tap next moves the visible avatar; public rooms keep custom placements and real URL collection',async({browser})=>{
  const ca=await browser.newContext({locale:'ja-JP'}),cb=await browser.newContext({locale:'ja-JP'});const a=await ca.newPage(),b=await cb.newPage();const errors:string[]=[];for(const p of[a,b])p.on('pageerror',e=>errors.push(e.message));
  try{
    await onboard(a,'早送りA');await onboard(b,'ルーム訪問B');const boot=await json(a,'/bootstrap'),id=boot.user.id;
    await b.locator('.area-dock').getByRole('button',{name:'広場',exact:true}).click();await expect(b.locator('.map-top')).toContainText('発見の広場');await openPost(a,'ここでは、寄り道が正解。');const first=await a.getByTestId('player-position').textContent();await a.getByRole('button',{name:'次の投稿・動画へ',exact:true}).click();await expect(a.locator('.post-detail h2')).toHaveText('今日見つけた、小さないいこと。');
    const p=boot.posts.find((p:{title:string})=>p.title==='今日見つけた、小さないいこと。');await expect.poll(async()=>JSON.parse(await b.getByTestId('peer-positions').textContent()||'[]').find((u:{id:string})=>u.id===id)?.x).toBe(p.mapX);expect(await a.getByTestId('player-position').textContent()).not.toBe(first);
    await a.getByRole('button',{name:'お気に入りに保存',exact:true}).click();await expect(a.getByRole('button',{name:'保存済み',exact:true})).toBeVisible();await close(a);
    await a.locator('.quick-discovery').getByRole('button',{name:/ルームを探す/}).click();await a.getByRole('button',{name:'ルームを作る',exact:true}).click();await a.getByLabel('ルーム名').fill('余白のアトリエ');await a.getByLabel('配置する投稿').selectOption(p.id);
    const coords=await a.locator('.layout-board').evaluate(el=>{const m=(el as SVGSVGElement).getScreenCTM()!;const start=new DOMPoint(1000,700).matrixTransform(m),end=new DOMPoint(1200,880).matrixTransform(m);return {start:{x:start.x,y:start.y},end:{x:end.x,y:end.y}};});await a.mouse.move(coords.start.x,coords.start.y);await a.mouse.down();await a.mouse.move(coords.end.x,coords.end.y,{steps:8});await a.mouse.up();await expect(a.getByLabel('X',{exact:true})).toHaveValue('1200');await expect(a.getByLabel('Y',{exact:true})).toHaveValue('880');
    await a.getByRole('button',{name:'木を置く',exact:true}).click();await a.getByLabel('みんなが訪問できるように公開する',{exact:false}).check();await a.getByRole('button',{name:'ルームを保存',exact:true}).click();await expect(a.getByText('ルームを保存しました',{exact:true})).toBeVisible();await close(a);
    await b.locator('.quick-discovery').getByRole('button',{name:/ルームを探す/}).click();const card=b.locator('.room-card').filter({hasText:'余白のアトリエ'});await card.getByRole('button',{name:'訪問する'}).click();await expect(b.locator('.map-top')).toContainText('余白のアトリエ');await expect(b.locator('[role=application][data-ready=true]')).toBeVisible();
    const rooms=await json(a,'/rooms'),room=rooms.find((r:{title:string})=>r.title==='余白のアトリエ');expect(room.items).toEqual([{postId:p.id,x:1200,y:880}]);
    await a.reload();await a.locator('.quick-discovery').getByRole('button',{name:/ルームを探す/}).click();await a.locator('.room-card').filter({hasText:'余白のアトリエ'}).getByRole('button',{name:'訪問する'}).click();await expect.poll(async()=>JSON.parse(await b.getByTestId('peer-positions').textContent()||'[]').some((u:{id:string})=>u.id===id)).toBe(true);
    await a.locator('.quick-discovery').getByRole('button',{name:/投稿を集める/}).click();await a.getByLabel('投稿のURL').fill('https://x.com/example/status/1234567890123');await a.getByLabel('タイトル',{exact:true}).fill('外部URLを集めるテスト');await a.getByLabel('元の投稿者名').fill('example');await a.getByRole('button',{name:'確認して世界に置く'}).click();await expect(a.locator('.post-detail h2')).toHaveText('外部URLを集めるテスト');await expect(a.getByRole('link',{name:'X を開く'})).toHaveAttribute('href','https://x.com/example/status/1234567890123');await expect(a.getByRole('button',{name:'保存済み',exact:true})).toBeVisible();await expect(a.locator('.map-top')).not.toContainText('余白のアトリエ');
    await a.screenshot({path:'artifacts/walk-next-and-import.png'});expect(errors).toEqual([]);
  }finally{await ca.close();await cb.close();}
});
test('approved friends accept party invites and exchange actual WebRTC audio; mute and exiting stop the microphone',async({browser})=>{
  const ca=await browser.newContext({locale:'ja-JP',permissions:['microphone']}),cb=await browser.newContext({locale:'ja-JP',permissions:['microphone']});
  for(const context of[ca,cb])await context.addInitScript(()=>{
    window.__walkRTC=[];window.__walkStreams=[];const Native=window.RTCPeerConnection;window.RTCPeerConnection=class extends Native{constructor(config?:RTCConfiguration){super(config);window.__walkRTC.push(this);}};
    const get=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);navigator.mediaDevices.getUserMedia=async constraints=>{const s=await get(constraints);window.__walkStreams.push(s);return s;};
  });
  const a=await ca.newPage(),b=await cb.newPage();const errors:string[]=[];for(const p of[a,b])p.on('pageerror',e=>errors.push(e.message));
  try{
    await onboard(a,'音声A');await onboard(b,'音声B');const bid=(await json(b,'/bootstrap')).user.id;await mutate(a,'/friendships',{targetId:bid});const f=(await json(b,'/social')).friendships[0];await mutate(b,'/friendships/'+f.id,{action:'accept'},'PATCH');
    await a.locator('.party-launcher button').first().click();await a.getByRole('button',{name:'パーティに招待',exact:true}).click();await b.locator('.party-launcher button').first().click();await b.getByRole('button',{name:'参加する',exact:true}).click();
    await a.getByRole('button',{name:'マイクを許可して音声参加',exact:true}).click();await expect(a.getByText('マイク参加中',{exact:true})).toBeVisible();await b.getByRole('button',{name:'マイクを許可して音声参加',exact:true}).click();
    await expect(a.getByText('音声接続済み',{exact:true})).toBeVisible();await expect(b.getByText('音声接続済み',{exact:true})).toBeVisible();
    for(const p of[a,b])await expect.poll(async()=>p.evaluate(async()=>{let bytes=0;for(const pc of window.__walkRTC){const stats=await pc.getStats();stats.forEach(s=>{if(s.type==='inbound-rtp'&&s.kind==='audio')bytes+=s.bytesReceived||0;});}return bytes;})).toBeGreaterThan(0);
    await a.getByRole('dialog').getByRole('button',{name:'マイクをミュート',exact:true}).click();expect(await a.evaluate(()=>window.__walkStreams.at(-1)?.getAudioTracks()[0].enabled)).toBe(false);
    await a.getByRole('dialog').getByRole('button',{name:'マイクをオン',exact:true}).click();expect(await a.evaluate(()=>window.__walkStreams.at(-1)?.getAudioTracks()[0].enabled)).toBe(true);
    await a.getByRole('button',{name:'音声から退出',exact:true}).click();expect(await a.evaluate(()=>window.__walkStreams.at(-1)?.getTracks().every(t=>t.readyState==='ended'))).toBe(true);await expect(b.getByText('音声には未参加',{exact:true})).toBeVisible();
    await b.screenshot({path:'artifacts/walk-party.png'});await b.getByRole('button',{name:'パーティを退出',exact:true}).click();await expect.poll(()=>b.evaluate(()=>window.__walkStreams.at(-1)?.getTracks().every(t=>t.readyState==='ended'))).toBe(true);expect(errors).toEqual([]);
  }finally{await ca.close();await cb.close();}
});
