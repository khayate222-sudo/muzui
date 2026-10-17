import {test,expect,type Page} from '@playwright/test';
import type {Room} from '../../shared/community';

const title='一緒に描こう、小さなマグ。',postId='walk-short-sketch-mug';
const mutate=(p:Page,path:string,data:object)=>p.request.post('/api'+path,{headers:{'X-Walk-Client':'1'},data});
async function begin(p:Page){
  await p.goto('/');await p.getByRole('button',{name:/^ひとりで寄り道を始める/}).click();
  await expect(p.getByRole('dialog',{name:'ひとりの寄り道',exact:true})).toBeVisible();
  await expect(p.locator('[role=application][data-ready=true]')).toBeVisible();
}
async function findFilm(p:Page){
  await p.getByRole('button',{name:'今日の一本を探す',exact:true}).click();
  await p.getByRole('dialog',{name:'今日の動画の棚',exact:true}).getByRole('button',{name:'アート',exact:true}).click();
  await p.getByRole('button',{name:title+'を見る',exact:true}).click();
  await expect(p.locator('.post-detail h2')).toHaveText(title);
}

test('a solo newcomer finds a real film, saves it to a private window, and returns without any friends at 390px and 320px',async({browser})=>{
  const c=await browser.newContext({locale:'ja-JP',viewport:{width:390,height:844},isMobile:true,hasTouch:true,timezoneId:'Asia/Tokyo'}),p=await c.newPage(),errors:string[]=[];p.on('pageerror',e=>errors.push(e.message));
  const outsider=await browser.newContext({locale:'ja-JP'});
  try{
    await begin(p);await expect(p.locator('.solo-homes')).toContainText('部屋は勝手には作りません');
    const userId=(await (await p.request.get('/api/bootstrap')).json()).user.id;
    const ownedRooms=async()=>((await (await p.request.get('/api/rooms')).json()) as Room[]).filter(r=>r.ownerId===userId);
    await outsider.request.get('/api/bootstrap');const other=await outsider.request.post('/api/rooms',{headers:{'X-Walk-Client':'1'},data:{title:'別の住人の公開した部屋',description:'ほかの部屋も存在する世界',isPublic:true,theme:'garden',items:[],decorations:[]}});expect(other.ok()).toBe(true);
    expect(await ownedRooms()).toEqual([]);
    await p.screenshot({path:'artifacts/solo-start-390.png',animations:'disabled'});
    await findFilm(p);await expect(p.locator('.viewing-box')).toContainText('1人がこの投稿を開いています');await expect(p.locator('.viewing-box')).toContainText('いまは、あなたのペースで');
    const video=p.locator('.native-video');await expect.poll(()=>video.evaluate((v:HTMLVideoElement)=>v.readyState)).toBeGreaterThanOrEqual(2);
    await video.evaluate(async(v:HTMLVideoElement)=>{v.muted=true;await v.play();});await expect.poll(()=>video.evaluate((v:HTMLVideoElement)=>v.currentTime)).toBeGreaterThan(.2);
    await p.getByRole('button',{name:'自分の窓辺に置く',exact:true}).click();const retreat=p.getByRole('dialog',{name:'自分の窓辺に置く',exact:true});await expect(retreat).toContainText('非公開の小さな部屋');await retreat.getByRole('button',{name:'保存して窓辺で開く',exact:true}).click();
    await expect(p.getByTestId('room-interior')).toBeVisible();await expect(p.locator('.post-detail h2')).toHaveText(title);await expect(p.locator('.map-top')).toContainText('わたしの窓辺');
    const rooms=await ownedRooms();expect(rooms).toHaveLength(1);const home=rooms[0];expect(home.isPublic).toBe(false);expect(home.items).toEqual([{postId,x:1000,y:700}]);
    const boot=await (await p.request.get('/api/bootstrap')).json();expect(boot.favorites).toContain(postId);expect(boot.friendships).toEqual([]);expect(boot.user.shareActivity).toBe(false);
    await outsider.request.get('/api/bootstrap');expect((await outsider.request.get('/api/rooms/'+home.id)).status()).toBe(404);
    await expect(p.locator('.viewer-avatars button')).toHaveCount(0);await expect(p.getByTestId('together-controls')).not.toContainText('同期視聴 ·');
    for(const width of [320,390]){await p.setViewportSize({width,height:844});expect(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);const rect=await video.boundingBox();expect(rect!.width).toBeGreaterThan(260);}
    await p.screenshot({path:'artifacts/solo-window-390.png',animations:'disabled'});
    await p.reload();await expect(p.locator('[role=application][data-ready=true]')).toBeVisible();await p.locator('.solo-entry').click();
    const solo=p.getByRole('dialog',{name:'ひとりの寄り道',exact:true});await expect(solo).toContainText('わたしの窓辺');await expect(solo.getByRole('region',{name:'保存した動画'})).toContainText(title);
    await p.setViewportSize({width:320,height:844});await p.screenshot({path:'artifacts/solo-return-320.png',animations:'disabled'});
    await solo.getByRole('button',{name:/わたしの窓辺.*窓辺へ戻る/}).click();await expect(p.getByTestId('room-interior')).toBeVisible();await expect(p.locator('.post-detail h2')).toHaveText(title);
    expect(await ownedRooms()).toHaveLength(1);expect((await (await p.request.get('/api/rooms/'+home.id)).json()).items).toHaveLength(1);
    await p.getByRole('button',{name:'閉じる',exact:true}).click();await expect(p.locator('.native-video')).toHaveCount(0);expect(errors).toEqual([]);
  }finally{await c.close();await outsider.close();}
});

test('a slow save closed by the user never navigates later; retry reuses the private room and leaves public rooms intact',async({browser})=>{
  const c=await browser.newContext({locale:'ja-JP',viewport:{width:320,height:844},isMobile:true,hasTouch:true}),p=await c.newPage();let release=()=>{};
  try{
    await begin(p);
    const layout={title:'大切にしている窓辺',description:'配置を残す',theme:'night',isPublic:false,items:[],decorations:[{kind:'tree',x:440,y:600}]};
    const home=await (await mutate(p,'/rooms',layout)).json(),pub=await (await mutate(p,'/rooms',{...layout,title:'公開の展示室',isPublic:true})).json();
    await findFilm(p);await p.getByRole('button',{name:'自分の窓辺に置く',exact:true}).click();
    const retreat=p.getByRole('dialog',{name:'自分の窓辺に置く',exact:true});await expect(retreat.getByLabel('動画を置く非公開の部屋')).toContainText(home.title);await expect(retreat).not.toContainText(pub.title);
    let reached=()=>{};const waiting=new Promise<void>(r=>{reached=r;}),gate=new Promise<void>(r=>{release=r;});
    await p.route('**/api/solo/room',async route=>{const response=await route.fetch();reached();await gate;await route.fulfill({response});});
    await retreat.getByRole('button',{name:'保存して窓辺で開く',exact:true}).click();await waiting;await retreat.getByRole('button',{name:'今はここで見る',exact:true}).click();release();
    await expect.poll(async()=> (await (await p.request.get('/api/rooms/'+home.id)).json()).items.length).toBe(1);await expect(p.getByTestId('room-interior')).toHaveCount(0);await expect(p.locator('.map-top')).toContainText('アートの世界');await expect(p.locator('.post-detail h2')).toHaveText(title);
    await p.unroute('**/api/solo/room');await p.getByRole('button',{name:'自分の窓辺に置く',exact:true}).click();await p.getByRole('button',{name:'保存して窓辺で開く',exact:true}).click();
    await expect(p.getByTestId('room-interior')).toBeVisible();await expect(p.locator('.post-detail h2')).toHaveText(title);
    const after=await (await p.request.get('/api/rooms/'+home.id)).json();expect(after.items).toHaveLength(1);expect(after.decorations).toEqual(home.decorations);expect(after.theme).toBe('night');expect((await (await p.request.get('/api/rooms/'+pub.id)).json())).toEqual(pub);
    expect((await (await p.request.get('/api/bootstrap')).json()).friendships).toEqual([]);expect(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  }finally{release();await c.close();}
});
