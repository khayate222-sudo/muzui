// Real network check. Runs WALK in an isolated temporary DB and uses the
// provider's actual iframe. No fixture responses, logins or video downloads.
import {chromium} from 'playwright-core';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {randomBytes} from 'node:crypto';
import {createApp} from '../server/app';
import {sourceInfo} from '../shared/community';
import {curatedVideos} from '../shared/curated-videos';
import type {Genre} from '../shared/model';

type Input={url:string;title?:string;authorName?:string;genre?:Genre};
const args=process.argv.slice(2),inputAt=args.indexOf('--input'),outputAt=args.indexOf('--output');
const input:unknown=inputAt>=0?JSON.parse(await readFile(resolve(args[inputAt+1]),'utf8')):curatedVideos;
if(!Array.isArray(input)||!input.length||input.length>50)throw new Error('確認する動画は1〜50件にしてください。');
const items:Input[]=input.map((value:unknown)=>{if(!value||typeof value!=='object'||!('url'in value)||typeof value.url!=='string')throw new Error('urlのある候補を指定してください。');const source=sourceInfo(value.url);if(!source||!['bilibili','抖音'].includes(source.provider))throw new Error('bilibili・抖音の投稿URLを指定してください。');return {...value,url:source.url} as Input;});
const output=resolve(outputAt>=0?args[outputAt+1]:'artifacts/video-verification.json');await mkdir(resolve(output,'..'),{recursive:true});
const instance=await createApp({database:':memory:',adminKey:randomBytes(24).toString('hex')});
await instance.app.register(import('@fastify/static'),{root:resolve('dist')});const origin=await instance.app.listen({host:'127.0.0.1',port:0});
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
const results:Record<string,unknown>[]=[];
try{
  for(const [index,item]of items.entries()){
    const page=await browser.newPage({viewport:{width:390,height:844}}),source=sourceInfo(item.url)!;
    const result:Record<string,unknown>={url:item.url,provider:source.provider,checkedAt:new Date().toISOString(),status:'unconfirmed',samples:[],failures:[]};
    let blocked=false;
    page.on('response',r=>{if([403,429,503].includes(r.status())){const u=new URL(r.url());if(['player.bilibili.com','api.bilibili.com','open.douyin.com'].includes(u.hostname)){(result.failures as unknown[]).push({host:u.hostname,path:u.pathname,status:r.status()});if([429,503].includes(r.status()))blocked=true;}}});
    try{
      await page.goto(origin);await page.getByRole('button',{name:'まず動画を見てみる',exact:true}).click();await page.getByRole('dialog',{name:'今日の動画の棚',exact:true}).getByRole('button',{name:'閉じる',exact:true}).click();
      await page.locator('.quick-discovery').getByRole('button',{name:'投稿を集める',exact:true}).click();const form=page.getByRole('dialog',{name:'外部の投稿を集める',exact:true});await form.getByLabel('投稿のURL').fill(item.url);await form.getByLabel('タイトル',{exact:true}).fill(item.title?.slice(0,120)||'再生確認用の投稿');await form.getByLabel('元の投稿者名').fill(item.authorName?.slice(0,60)||'元投稿を確認中');await form.getByRole('combobox',{name:'ジャンル',exact:true}).selectOption(item.genre||'video');await form.getByRole('button',{name:'確認して世界に置く',exact:true}).click();
      await page.getByRole('button',{name:'大画面で見る',exact:true}).click();
      await page.getByRole('button',{name:source.provider==='bilibili'?'bilibili公式プレーヤーを開く':'公式プレーヤーを開く',exact:true}).click();
      const selector=source.provider==='bilibili'?'.bilibili-player':'.douyin-player';await page.locator(selector).waitFor({state:'visible',timeout:15000});
      const frame=await (await page.locator(selector).elementHandle())!.contentFrame();if(!frame)throw new Error('公式プレーヤーを開けませんでした');
      await frame.locator('video').first().waitFor({state:'attached',timeout:20000});await frame.waitForFunction(()=>{const video=document.querySelector('video');return !!video&&video.readyState>=2;},null,{timeout:20000});
      if(source.provider==='bilibili')for(const css of ['.bpx-player-state-play:visible','.bpx-player-video-area:visible','.bpx-player-ctrl-play:visible','video:visible']){const control=frame.locator(css).first();if(await control.count()){try{await control.click({timeout:3000});await page.waitForTimeout(400);if(await frame.locator('video').first().evaluate(v=>!v.paused))break;}catch{/* Try another visible standard control. */}}}
      else if(await frame.locator('video:visible').count())await frame.locator('video:visible').first().click();
      for(let i=0;i<8;i++){await page.waitForTimeout(2000);const state=await frame.locator('video').first().evaluate(v=>({currentTime:v.currentTime,duration:Number.isFinite(v.duration)?v.duration:null,readyState:v.readyState,paused:v.paused,error:v.error?.code||null,width:v.videoWidth,height:v.videoHeight}));(result.samples as unknown[]).push(state);const samples=result.samples as typeof state[];const loaded=samples.filter(s=>s.readyState>=2&&!s.error&&s.width>0);if(loaded.length>=3&&loaded.at(-1)!.currentTime-loaded[0].currentTime>=4){result.status='playback-confirmed';break;}}
      if(source.provider==='bilibili'){
        result.sourceTitle=await frame.locator('.bpx-player-top-left-title-text').first().textContent({timeout:1000}).catch(()=>null);result.authorName=await frame.locator('.bpx-player-follow-name').first().textContent({timeout:1000}).catch(()=>null);
      }
      await page.screenshot({path:resolve(output,'..','video-check-'+index+'.png'),animations:'disabled'});
    }catch(e){result.error=(e as Error).message.slice(0,300);}finally{await page.close();results.push(result);await writeFile(output,JSON.stringify({scope:'Real WALK API and official player; opening seconds only; no mocks',results},null,2));console.log(JSON.stringify({url:item.url,status:result.status,completed:results.length,total:items.length}));}
    if(blocked){console.log('提供元の429または通信経路の503を検出したため、残りの確認を停止しました。');break;}
  }
}finally{await browser.close();instance.io.disconnectSockets(true);await instance.app.close();}
console.log(JSON.stringify({confirmed:results.filter(r=>r.status==='playback-confirmed').length,checked:results.length,output}));
if(results.some(r=>r.status!=='playback-confirmed')||results.length<items.length)process.exitCode=1;
