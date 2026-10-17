import {t} from './i18n';
import Phaser from 'phaser';
import type { Place } from '../shared/worlds';
import {worldEmblem} from './world-emblem';
import { polygon, rectangle, type HitRegion } from './world-input';
import { drawIllustratedBuilding, drawIllustratedPlace } from './world-illustration';
const textStyle={fontFamily:'"Hiragino Kaku Gothic ProN", "Noto Sans JP", sans-serif'};
const shape=(g:Phaser.GameObjects.Graphics,color:number,points:number[],alpha=1)=>{g.fillStyle(color,alpha);g.fillPoints(Array.from({length:points.length/2},(_,i)=>({x:points[i*2],y:points[i*2+1]})),true);};
export const buildingSilhouette=polygon([-132,-95,-20,-196,130,-126,130,0,45,38,-110,10,-110,-89]);
export function drawBuilding(scene:Phaser.Scene,c:Phaser.GameObjects.Container,place:Place,back=false):HitRegion[]{
 const illustrated=drawIllustratedBuilding(scene,c,place,back);if(illustrated)return illustrated;
 const g=scene.add.graphics(),col=Phaser.Display.Color.HexStringToColor(place.color).color;c.add(g);
 const future=place.theme==='future',japan=place.theme==='japan',castle=place.gate==='castle',cave=place.gate==='cave';
 g.fillStyle(0x162944,.18);g.fillEllipse(10,25,285,82);
 shape(g,future?0x516c91:0x8d7a70,[-120,0,45,30,130,-5,130,10,45,50,-120,17]);
 shape(g,future?0xd0e8ef:japan?0xf0ddbe:0xf4e6ce,[-110,-100,45,-74,45,32,-110,7]);
 shape(g,future?0x749eb9:japan?0xa98a73:0xbab29a,[45,-74,125,-116,125,-7,45,32]);
 shape(g,future?0x5f7e9d:japan?0x785f72:col,[-132,-95,-20,-196,60,-65]);
 shape(g,future?0x82b8d0:japan?0xae7482:0xc2c4a0,[-20,-196,130,-126,60,-65]);
 shape(g,0x2a4158,[-132,-95,60,-65,130,-126,130,-117,60,-55,-132,-85],.75);
 // Roof tiles, illuminated windows, side wall, steps and greenery have distinct silhouettes.
 g.lineStyle(2,future?0xaee9ec:japan?0xc6a5ad:0xffffff,.28);
 for(let i=0;i<4;i++)g.lineBetween(-108+i*18,-109-i*21,55-i*17,-77-i*24);
 g.fillStyle(future?0x293f67:0x694c47);g.fillRoundedRect(-36,-69,45,85,18);
 g.fillStyle(future?0x83e1ee:0xf9cf79,.85);g.fillRoundedRect(-28,-60,29,61,14);g.fillStyle(0xfff2b5);g.fillCircle(-5,-12,3);
 for(const x of[-85,14]){g.fillStyle(future?0x446685:0x90745a);g.fillRoundedRect(x,-67,24,33,5);g.fillStyle(future?0xb8f0f6:0xffdfa0);g.fillRoundedRect(x+4,-63,16,25,3);g.lineStyle(2,future?0x6283a5:0xb1976f);g.lineBetween(x+12,-63,x+12,-38);g.lineBetween(x+4,-50,x+20,-50);}
 shape(g,future?0xc3dde2:0xe5d6b4,[-42,15,10,24,24,37,-29,28]);shape(g,future?0x7395aa:0xc5b895,[-29,28,24,37,24,45,-29,36]);
 if(japan){g.lineStyle(5,0x8a6a57);g.lineBetween(-110,-22,43,2);g.lineBetween(-100,-90,-100,2);g.lineBetween(37,-69,37,26);for(const x of[-105,42]){g.fillStyle(0xcc7972);g.fillRoundedRect(x,-45,15,23,7);g.lineStyle(2,0xfde3b4);g.lineBetween(x+7,-42,x+7,-25);}}
 if(future){g.lineStyle(3,0x85f3e1,.8);g.lineBetween(52,-46,110,-76);g.lineBetween(52,-24,110,-54);g.fillStyle(0x527d99);g.fillRect(84,-142,4,42);g.fillStyle(0xc0eff4);g.fillEllipse(89,-154,42,18);g.lineStyle(2,0xb6f4ea);g.strokeEllipse(89,-154,42,18);}
 if(castle){for(const x of[-100,77]){g.fillStyle(future?0x82b4c8:0xaaa7c8);g.fillRoundedRect(x,-156,35,150,5);g.fillStyle(future?0x405f85:0x8075ae);g.fillTriangle(x-9,-155,x+44,-155,x+17,-204);g.fillStyle(future?0x9bf4e2:0xffe6b9);g.fillRoundedRect(x+10,-130,12,24,6);if(future){g.lineStyle(3,0x9bf4e2);g.lineBetween(x+6,-85,x+29,-85);g.lineBetween(x+6,-68,x+29,-68);}}g.fillStyle(0xb898d9);g.fillRect(18,-158,20,40);g.fillStyle(0xf9e6b6);g.fillTriangle(18,-158,38,-158,28,-143);}
 if(cave){g.clear();g.fillStyle(0x14233f,.18);g.fillEllipse(8,25,270,75);shape(g,0x899f8c,[-128,4,-108,-87,-44,-172,38,-163,117,-75,132,10,35,39]);shape(g,0xa9b7a1,[-128,4,-108,-87,-44,-172,-21,-77,-60,11]);shape(g,0x667d83,[38,-163,117,-75,132,10,70,4,44,-89]);g.fillStyle(0x344451);g.fillRoundedRect(-48,-85,97,112,45);g.fillStyle(0x7cbdb9,.35);g.fillRoundedRect(-37,-74,75,95,35);g.lineStyle(3,0xc0ebe0,.8);g.strokeRoundedRect(-28,-63,57,81,28);for(const [x,y]of[[-74,-21],[84,-21],[-28,-146]]){g.fillStyle(0x91be9b);g.fillCircle(x,y,17);g.fillStyle(0xc3d8a4);g.fillCircle(x-6,y-7,10);}}
 if(!future&&!cave){for(const x of[-115,65]){g.fillStyle(0xa4775e);g.fillRoundedRect(x,3,26,18,5);g.fillStyle(0x78987b);g.fillCircle(x+8,-3,13);g.fillStyle(0xa2b68f);g.fillCircle(x+19,-10,11);g.fillStyle(0xe1b5ae);g.fillCircle(x+13,-10,4);}}
 const emblem=scene.add.graphics().setPosition(-19,cave?-110:-124).setScale(.8);c.add(emblem);
 for(const item of worldEmblem(place)){
  const color=Phaser.Display.Color.HexStringToColor(item.fill).color;
  if(item.kind==='polygon')shape(emblem,color,item.points);else {emblem.fillStyle(color);if(item.kind==='circle')emblem.fillCircle(item.x,item.y,item.r);else emblem.fillRoundedRect(item.x,item.y,item.width,item.height,3);}
 }
 const label=scene.add.text(0,73,(back?'← ':'')+place.title,{...textStyle,fontSize:'18px',fontStyle:'bold',color:'#344e55',backgroundColor:'#fffdf3',padding:{x:13,y:9},align:'center',wordWrap:{width:210}}).setOrigin(.5);c.add(label);
 const halo=scene.add.graphics();halo.lineStyle(3,0xfff1c6,.8);halo.strokeEllipse(0,20,256,78);halo.setVisible(false);c.addAt(halo,0);c.setData('halo',halo);
 const body=castle?polygon([-132,-95,-109,-155,-83,-204,-57,-155,-20,-196,70,-155,94,-204,121,-155,130,-126,130,10,45,50,-120,17]):cave?polygon([-128,4,-108,-87,-44,-172,38,-163,117,-75,132,10,35,39]):buildingSilhouette;
 return [body,...(cave?[]:[polygon([-120,0,45,30,130,-5,130,10,45,50,-120,17])]),...(future?[rectangle(68,-166,44,35),rectangle(82,-148,14,44)]:!cave?[rectangle(-128,-25,48,48),rectangle(58,-25,48,48)]:[]),rectangle(-label.width/2,73-label.height/2,label.width,label.height)];
}
export function drawPlaceArt(scene:Phaser.Scene,place:Place,tree:(x:number,y:number,s:number)=>void){
 if(scene.textures.exists('world-ground')&&scene.textures.exists('world-buildings'))return drawIllustratedPlace(scene,place);
 const station=place.theme==='station',future=place.theme==='future',japan=place.theme==='japan',fantasy=place.theme==='fantasy';
 scene.cameras.main.setBackgroundColor(station?'#24374c':future?'#23344d':fantasy?'#4b4866':japan?'#d7c5cd':'#c5d5c5');
 let guideHall:Phaser.GameObjects.Container|undefined;
 const g=scene.add.graphics();g.setDepth(-20);
 // Stars belong to the station's sky, below the island and every interactive object.
 if(station){for(let i=0;i<65;i++){const x=(i*467)%2000,y=(i*313)%1400;g.fillStyle(0xc8dcfa,.2+(i%3)*.15);g.fillCircle(x,y,i%5===0?2:1);}g.lineStyle(1,0x8eadd6,.2);g.lineBetween(16,72,104,121);g.lineBetween(104,121,228,62);g.lineBetween(1754,1297,1860,1344);g.lineBetween(1860,1344,1966,1268);}

 // Floating island, beveled edge, diamond paving and paths.
 shape(g,station?0x51616d:future?0x425a74:0x8d9c85,[65,220,1000,20,1935,220,1935,1210,1000,1400,65,1210]);
 shape(g,station?0xe2d7ba:future?0xa5c8d3:japan?0xecdccd:0xd5dfbb,[65,190,1000,-10,1935,190,1935,1168,1000,1358,65,1168]);
 g.lineStyle(1,station?0xb8aa90:future?0x648faa:0xa7b899,.27);
 for(let y=230;y<1280;y+=80)for(let x=120;x<1930;x+=144)g.strokePoints([{x,y:y-36},{x:x+72,y},{x,y:y+36},{x:x-72,y}],true);
 g.lineStyle(105,station?0xf5ead0:future?0xc6e2e4:0xf0e8cf);g.lineBetween(250,680,1770,680);g.lineBetween(1040,300,1040,1180);g.lineStyle(2,0xc1b59a,.4);g.lineBetween(250,625,1770,625);g.lineBetween(250,735,1770,735);
 // Corners and edge gardens, separated from walkable posts.
 for(const [x,y,s]of[[160,470,1.2],[1800,440,1.1],[160,1070,1.3],[1770,1150,1.2],[630,1180,.8]])tree(x,y,s);
 for(const [x,y]of[[260,640],[1720,690],[400,1150],[1450,1160]]){g.fillStyle(0x495b65,.15);g.fillEllipse(x,y+6,90,30);g.fillStyle(0xb29074);g.fillRoundedRect(x-40,y-22,80,14,4);g.fillStyle(0x687e7d);g.fillRect(x-30,y-8,6,17);g.fillRect(x+24,y-8,6,17);}
 if(station){
  // Tracks, a tiny midnight-blue train and a copper station clock.
  g.fillStyle(0x829392);g.fillRoundedRect(200,146,1600,103,18);g.lineStyle(4,0xe2decc);g.lineBetween(230,164,1770,164);g.lineBetween(230,223,1770,223);
  for(let x=240;x<1770;x+=45){g.lineStyle(3,0x556d76);g.lineBetween(x,166,x+18,221);}
  const train=scene.add.container(530,187).setDepth(240),trainArt=scene.add.graphics();trainArt.fillStyle(0x334e6d);trainArt.fillRoundedRect(-230,-73,460,100,25);trainArt.fillStyle(0xb5c6c2);trainArt.fillRoundedRect(-220,-80,430,18,10);trainArt.fillStyle(0xc2936d);trainArt.fillRect(-230,9,460,9);for(let x=-197;x<200;x+=63){trainArt.fillStyle(0xf5d892);trainArt.fillRoundedRect(x,-51,40,37,7);trainArt.fillStyle(0xe9b779);trainArt.fillRect(x+17,-51,3,37);}for(const x of[-160,160]){trainArt.fillStyle(0x273b50);trainArt.fillCircle(x,28,17);}train.add(trainArt);
  const hall=scene.add.container(1030,590).setDepth(580).setSize(430,350),h=scene.add.graphics();guideHall=hall;hall.add(h);
  h.fillStyle(0x24374c,.18);h.fillEllipse(12,14,422,135);
  shape(h,0xe0c7a5,[-175,-130,78,-98,78,27,-175,-4]);shape(h,0xad947c,[78,-98,180,-159,180,-34,78,27]);shape(h,0x506a77,[-208,-131,-55,-252,105,-100]);shape(h,0x718f98,[-55,-252,209,-165,105,-100]);
  h.lineStyle(4,0xd4b186);h.lineBetween(-208,-131,105,-100);h.lineBetween(105,-100,209,-165);
  for(const x of[-137,-64,10]){h.fillStyle(0x456576);h.fillRoundedRect(x,-95,45,64,18);h.fillStyle(0xffdeb1);h.fillRoundedRect(x+6,-87,33,43,13);}
  h.fillStyle(0x534c50);h.fillRoundedRect(-50,-66,62,90,25);h.fillStyle(0xf4cf92);h.fillRoundedRect(-42,-57,46,72,20);
  h.fillStyle(0xb89a77);h.fillRect(-190,-121,9,136);h.fillRect(84,-96,9,130);h.fillStyle(0xffe3a6);h.fillCircle(-175,-67,11);h.fillCircle(87,-50,11);
  h.fillStyle(0xfcf5dc);h.fillCircle(-53,-173,28);h.lineStyle(3,0x6a7c7a);h.strokeCircle(-53,-173,28);h.lineBetween(-53,-173,-53,-191);h.lineBetween(-53,-173,-37,-166);
  hall.add(scene.add.text(-36,-113,'WALK STATION',{...textStyle,fontSize:'18px',fontStyle:'bold',color:'#fff7d9',backgroundColor:'#3c5a69',padding:{x:12,y:5}}).setOrigin(.5));
  hall.add(scene.add.text(-5,59,t('不思議な駅 · 好きな世界へ'),{...textStyle,fontSize:'20px',color:'#fff4d5',backgroundColor:'#38576b',padding:{x:18,y:10}}).setOrigin(.5));
 }else{
  scene.add.text(1010,146,place.title,{...textStyle,fontSize:'29px',fontStyle:'bold',color:future?'#ddf8f0':fantasy?'#f3e5ff':'#53656c',backgroundColor:future?'#344c70':fantasy?'#68607e':'#fff7e7',padding:{x:26,y:14}}).setOrigin(.5).setDepth(190);
  if(future){for(const [x,y]of[[1400,400],[480,1110]]){const a=scene.add.graphics().setDepth(y-90);a.fillStyle(0x597b98);a.fillRoundedRect(x-65,y-190,130,170,24);a.fillStyle(0x7be6db,.5);a.fillRoundedRect(x-53,y-180,106,137,16);a.lineStyle(4,0xb9f6e7);a.strokeRoundedRect(x-65,y-190,130,170,24);a.fillStyle(0xb4dcdb);a.fillEllipse(x,y-190,160,48);}}
  if(fantasy){for(const [x,y]of[[1580,460],[550,1150]]){const a=scene.add.graphics().setDepth(y-70);shape(a,0xab99c4,[x-30,y,x-50,y-80,x,y-135,x+44,y-78,x+20,y]);shape(a,0xd1c3e4,[x-50,y-80,x,y-135,x,y-15]);a.lineStyle(2,0xf1e3fc,.65);a.lineBetween(x,y-135,x,y-15);}}
  if(japan){for(const [x,y]of[[1500,390],[350,1140]]){const a=scene.add.graphics().setDepth(y-25);a.fillStyle(0x95746c);a.fillRect(x-5,y-100,10,108);a.fillStyle(0xdfb1ba);a.fillCircle(x,y-135,49);a.fillStyle(0xedc6c5);a.fillCircle(x-30,y-137,31);a.fillCircle(x+24,y-153,30);a.fillStyle(0xf3d8d0);a.fillCircle(x-8,y-168,27);}}
  const f=scene.add.graphics().setDepth(600);f.fillStyle(0xb5c1af);f.fillEllipse(1010,575,200,90);f.fillStyle(0xf5f1da);f.fillEllipse(1000,562,200,90);f.fillStyle(future?0x7ed3d9:0x8dbfae);f.fillEllipse(1000,555,167,64);f.lineStyle(3,0xe4f3da,.7);f.strokeEllipse(1000,555,112,41);f.fillStyle(0xcac9af);f.fillRoundedRect(987,503,26,57,6);f.fillEllipse(1000,503,70,28);
 }
 // Small landmarks establish each world's character without adding obstacles or fake residents.
 if(!station){
  const art=scene.add.graphics().setDepth(1140),x=1450,y=1120;
  art.fillStyle(0x26364f,.12);art.fillEllipse(x,y+10,170,50);
  if(place.genre==='music'){
   art.fillStyle(0x9d775d);art.fillRoundedRect(x-68,y-32,136,41,7);art.fillStyle(0x384552);art.fillEllipse(x-8,y-38,93,47);art.lineStyle(2,0x75868c);for(const w of[32,55,77])art.strokeEllipse(x-8,y-38,w,w/2);art.fillStyle(0xe0bca1);art.fillEllipse(x-8,y-38,19,10);art.lineStyle(6,0xc8bda2);art.lineBetween(x+49,y-53,x+17,y-24);
   scene.add.text(x-7,y-95,'♫',{...textStyle,fontSize:'38px',color:'#b895ad'}).setOrigin(.5).setDepth(y);
  }else if(place.genre==='art'){
   art.lineStyle(7,0xa08064);art.lineBetween(x-45,y+5,x,y-115);art.lineBetween(x+45,y+5,x,y-115);art.fillStyle(0xfff8e8);art.fillRoundedRect(x-55,y-115,110,90,4);art.fillStyle(0x9bc4ad);art.fillTriangle(x-52,y-30,x-9,y-78,x+47,y-30);art.fillStyle(0xd6b2c7);art.fillCircle(x+24,y-87,14);art.lineStyle(4,0x739e9e);art.lineBetween(x-55,y-22,x+55,y-22);
  }else if(place.genre==='game'&&!fantasy){
   art.fillStyle(0x415f84);art.fillRoundedRect(x-61,y-119,123,121,14);art.fillStyle(0x283c5b);art.fillRoundedRect(x-47,y-105,94,66,8);art.lineStyle(3,0x88e3dd);art.strokeRoundedRect(x-47,y-105,94,66,8);art.fillStyle(0x9ce4dd);art.fillRect(x-19,y-87,38,8);art.fillRect(x-4,y-99,8,33);art.fillStyle(0xde9dbe);art.fillCircle(x+30,y-13,7);art.fillStyle(0xe2c68c);art.fillCircle(x+11,y-8,6);art.fillStyle(0xb7d7ed);art.fillCircle(x-28,y-15,7);
  }else if(place.genre==='anime'){
   art.fillStyle(0x9b7a79);art.fillRoundedRect(x-62,y-101,124,93,8);art.fillStyle(0xf6e7d3);art.fillRoundedRect(x-54,y-93,108,76,4);art.lineStyle(3,0xb594a6);art.strokeRect(x-43,y-82,38,52);art.strokeRect(x+6,y-82,38,25);art.strokeRect(x+6,y-48,38,18);art.fillStyle(0xd2b5c6);art.fillCircle(x-25,y-64,10);art.lineStyle(6,0x9b7a79);art.lineBetween(x-42,y-8,x-42,y+8);art.lineBetween(x+42,y-8,x+42,y+8);
  }
 }
 // Low-cost deterministic sparks/petals: no fake people, counts or dense particle emitters.
 for(let i=0;i<44;i++){const x=90+(i*379)%1810,y=300+(i*257)%980;g.fillStyle(station?0xffdfab:japan?0xdea6b6:0xe6edca,.35);g.fillCircle(x,y,2+(i%2));}
 return guideHall;
}
