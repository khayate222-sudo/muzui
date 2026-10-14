import {test,expect,type Page} from '@playwright/test';
import {gatePoints} from '../../shared/worlds';
async function setup(p:Page){await p.goto('/');await p.getByLabel('ニックネーム').fill('タップ旅人');await p.getByRole('button',{name:'WALKをはじめる'}).click();await expect(p.locator('[role=application][data-ready=true]')).toBeVisible();}
async function point(p:Page,x:number,y:number){const canvas=p.locator('canvas');const box=await canvas.boundingBox();const v=JSON.parse(await p.getByRole('application').getAttribute('data-viewport')||'{}');return {x:box!.x+((x-v.scrollX-v.width/2)*v.zoom+v.width/2)*box!.width/v.width,y:box!.y+((y-v.scrollY-v.height/2)*v.zoom+v.height/2)*box!.height/v.height};}
async function center(p:Page,x:number,y:number){
 // Pan the visible map rather than bypassing its input system or calling its scene actions.
 for(let i=0;i<5;i++){const target=await point(p,x,y),box=await p.locator('canvas').boundingBox();const cx=box!.x+box!.width/2,cy=box!.y+box!.height/2;if(Math.hypot(target.x-cx,target.y-cy)<35)return;await p.mouse.move(cx,cy);await p.mouse.down();await p.mouse.move(cx+cx-target.x,cy+cy-target.y,{steps:12});await p.mouse.up();await p.waitForTimeout(150);}
}
for(const mobile of[false,true])test(`${mobile?'touch':'mouse'}: the roof, side wall and sign all open the house; dragging never enters it`,async({browser})=>{
 const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1512,height:982},isMobile:mobile,hasTouch:mobile});const p=await context.newPage(),errors:string[]=[];p.on('pageerror',e=>errors.push(e.message));
 const tap=async(x:number,y:number)=>{const pt=await point(p,x,y);if(mobile)await p.touchscreen.tap(pt.x,pt.y);else await p.mouse.click(pt.x,pt.y);};
 try{await setup(p);const gate=gatePoints('public').find(g=>g.place.id==='world:art')!;
  for(const [dx,dy]of[[-20,-165],[90,-35],[-15,32],[0,73]]){
   await center(p,gate.x,gate.y-80);await tap(gate.x+dx,gate.y+dy);await expect(p.locator('.map-top')).toContainText('アートの世界');await p.locator('.world-path').getByRole('button',{name:'不思議な駅',exact:true}).click();await expect(p.locator('.map-top')).toContainText('不思議な駅');await expect(p.locator('[role=application][data-ready=true]')).toBeVisible();
  }
  await center(p,gate.x,gate.y-80);const at=await point(p,gate.x,gate.y-100);await p.mouse.move(at.x,at.y);await p.mouse.down();await p.mouse.move(at.x-90,at.y+65,{steps:15});await p.mouse.up();await expect(p.locator('.map-top')).toContainText('不思議な駅');
  if(mobile){await p.screenshot({path:'artifacts/walk-native-mobile-design.png'});for(const width of[320,390]){await p.setViewportSize({width,height:844});expect(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth&&document.documentElement.scrollHeight<=innerHeight+1)).toBe(true);await expect(p.locator('.mobile-nav')).toBeVisible();}}
  expect(errors).toEqual([]);
 }finally{await context.close();}
});
test('post board and avatar respond at their visible positions after zooming',async({browser})=>{
 const ca=await browser.newContext(),cb=await browser.newContext();const a=await ca.newPage(),b=await cb.newPage();try{
  await setup(a);await setup(b);await b.getByRole('button',{name:'プロフィール設定'}).click();await b.getByLabel('ニックネーム').fill('クリックできる住人');await b.getByRole('button',{name:'変更を保存'}).click();
  const boot=await (await a.request.get('/api/bootstrap')).json(),post=boot.posts.find((p:{id:string})=>p.id==='text-0-0');await a.locator('.area-dock').getByRole('button',{name:'広場',exact:true}).click();await expect(a.locator('[role=application][data-ready=true]')).toBeVisible();await a.getByRole('button',{name:'拡大',exact:true}).click();await center(a,post.mapX,post.mapY-50);const pt=await point(a,post.mapX,post.mapY-80);await a.mouse.click(pt.x,pt.y);await expect(a.locator('.post-detail h2')).toHaveText(post.title);await a.getByRole('button',{name:'閉じる',exact:true}).click();
  await a.locator('.world-path').getByRole('button',{name:'不思議な駅',exact:true}).click();await expect(a.locator('[role=application][data-ready=true]')).toBeVisible();await center(a,1100,710);const peer=await point(a,1100,710);await a.mouse.click(peer.x,peer.y);await expect(a.getByRole('dialog',{name:'旅人のプロフィール'})).toContainText('クリックできる住人');
 }finally{await ca.close();await cb.close();}
});
