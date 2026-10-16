import {chromium} from '@playwright/test';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createServer} from 'node:http';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
await mkdir(root+'public/films',{recursive:true});
const scene=await readFile(new URL('./starter-shorts-scene.html',import.meta.url));
const server=createServer((_req,res)=>{res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});res.end(scene);});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
try{
 const page=await browser.newPage();await page.goto('http://127.0.0.1:'+server.address().port);await page.evaluate(()=>globalThis.document.fonts.ready);
 for(const slug of ['sketch-mug','sketch-leaf','sketch-window','coffee-letter','rain-light','paper-flight']){
  const fps=20,duration=32,path=root+'public/films/walk-short-'+slug;
  // Our own quiet synthesizer: no samples or third-party music. Short, slowly fading tones.
  const melody="0.014*(sin(2*PI*261.63*t)+0.55*sin(2*PI*329.63*t)+0.32*sin(2*PI*392*t))*(0.65+0.35*sin(2*PI*0.08*t))*min(1,t/3)*min(1,(32-t)/4)";
  const ffmpeg=spawn('ffmpeg',['-hide_banner','-loglevel','error','-y','-f','image2pipe','-framerate',String(fps),'-i','pipe:0','-f','lavfi','-i',"aevalsrc='"+melody+"':s=44100:d=32",'-t',String(duration),'-c:v','libx264','-threads','2','-preset','medium','-crf','25','-pix_fmt','yuv420p','-c:a','aac','-b:a','64k','-movflags','+faststart','-map_metadata','-1',path+'.mp4'],{stdio:['pipe','inherit','inherit']});
  const done=once(ffmpeg,'close');let failure;ffmpeg.stdin.on('error',e=>{failure=e;});
  for(let frame=0;frame<fps*duration;frame++){
   if(failure)throw failure;
   const png=await page.evaluate(({slug,t})=>{globalThis.drawFilm(slug,t);return globalThis.document.querySelector('canvas').toDataURL('image/png').split(',')[1];},{slug,t:frame/fps});
   if(!ffmpeg.stdin.write(Buffer.from(png,'base64')))await once(ffmpeg.stdin,'drain');
  }
  ffmpeg.stdin.end();const [code]=await done;if(code!==0)throw new Error('Could not render '+slug);
  const poster=await page.evaluate(slug=>{globalThis.drawFilm(slug,23);return globalThis.document.querySelector('canvas').toDataURL('image/jpeg',.92).split(',')[1];},slug);await writeFile(path+'.jpg',Buffer.from(poster,'base64'));
  console.log('Rendered '+slug+' (32s, original animation and synthesized sound)');
 }
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
