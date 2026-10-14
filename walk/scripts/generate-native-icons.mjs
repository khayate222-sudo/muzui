import {chromium} from '@playwright/test';
import {readFile,writeFile} from 'node:fs/promises';
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
try{
 const page=await browser.newPage({viewport:{width:1024,height:1024}});
 await page.setContent('<style>body{margin:0}svg{display:block;width:100vw;height:100vh}</style>'+await readFile('public/app-icon.svg','utf8'));
 await page.screenshot({path:'ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png'});
 for(const [density,size]of [['mdpi',48],['hdpi',72],['xhdpi',96],['xxhdpi',144],['xxxhdpi',192]]){
  await page.setViewportSize({width:size,height:size});
  for(const name of['ic_launcher','ic_launcher_round'])await page.screenshot({path:`android/app/src/main/res/mipmap-${density}/${name}.png`});
 }
 await page.setViewportSize({width:2732,height:2732});
 const icon=await readFile('public/app-icon.svg','utf8');await page.setContent('<style>body{margin:0;width:100vw;height:100vh;background:#24374c;display:grid;place-items:center}svg{width:30vw;height:30vw}</style>'+icon);
 const splash=await page.screenshot();for(const name of ['splash-2732x2732.png','splash-2732x2732-1.png','splash-2732x2732-2.png'])await writeFile('ios/App/App/Assets.xcassets/Splash.imageset/'+name,splash);
}finally{await browser.close();}
