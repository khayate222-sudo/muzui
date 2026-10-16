import Phaser from 'phaser';
import { drawBuilding, drawPlaceArt } from './world-art';
import {prepareIllustrations,drawIllustratedGround,applyWorldLight} from './world-illustration';
import {courtyardArt,toCourtyard,fromCourtyard} from './world-layout';
import {prepareCourtyard,drawCourtyard,lightCourtyard} from './world-courtyard';
import type {WorldLight} from './world-light';
import { containsContainer, isTap, polygon, rectangle, type HitRegion } from './world-input';
import { gatePoints } from './worlds';
import { areas, areaAt, type Peer, type Post } from '../shared/model';
import type { WorldProps } from './World';
const ink=0x344b40;
export function createWorld(host:HTMLElement, get:()=>WorldProps) {
  class WalkScene extends Phaser.Scene {
    me!: Phaser.GameObjects.Container; player={x:1100,y:750}; target: {x:number;y:number}|null=null;
    keys!: Record<string,Phaser.Input.Keyboard.Key>; panels=new Map<string,Phaser.GameObjects.Container>(); people=new Map<string,Phaser.GameObjects.Container>(); ghosts=new Map<string,Phaser.GameObjects.Container>();
    gesture?:{x:number;y:number;time:number}; gestureCancelled=false; lastDrag?:{x:number;y:number}; pinchDistance=0; diagnosticAt=0;
    light?:WorldLight; last=0; near:string|null=null; area=''; postsVersion=''; avatarVersion=''; marker!:Phaser.GameObjects.Container;
    constructor(){super('walk');}
    preload(){this.load.image('courtyard',courtyardArt(get().place));this.load.image('walk-residents','/art/walk-residents.webp');for(let i=0;i<5;i++)this.load.image('art-'+i,'/art/scene-'+i+'.svg');}
    create(){
      this.cameras.main.setBackgroundColor('#dbe8d1');this.cameras.main.setBounds(0,0,2000,1400);
      prepareIllustrations(this);prepareCourtyard(this);this.drawLandscape();host.dataset.art=this.textures.exists('courtyard')?'painted-courtyard':'fallback';host.dataset.projection='courtyard';host.dataset.landscape=get().place?.landscape||get().place?.theme||'garden';
      const own=get().state.peers.find(p=>p.id===get().user.id);if(own)this.player={x:own.x,y:own.y};
      this.me=this.makeAvatar({...get().user,...this.player,area:'discovery',currentPost:null},true);
      this.avatarVersion=get().user.color+get().user.style;
      this.cameras.main.setZoom(this.scale.width<600?.36:.52);this.cameras.main.startFollow(this.me,true,.07,.07,0,430);
      this.marker=this.add.container(0,0);const mg=this.add.graphics();mg.lineStyle(2,0x2c7158,.8);mg.strokeEllipse(0,0,36,18);this.marker.add(mg);this.marker.setVisible(false).setDepth(2);
      this.tweens.add({targets:this.marker,alpha:.3,scaleX:.7,scaleY:.7,yoyo:true,repeat:-1,duration:650});
      this.keys=this.input.keyboard!.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT,E') as typeof this.keys;
      // Keep arrows available to inputs and assistive navigation outside the map.
      this.input.keyboard!.disableGlobalCapture();
      this.input.addPointer(1);
      this.input.setTopOnly(true);
      this.input.on('pointerdown',(p:Phaser.Input.Pointer)=>{
        this.gesture={x:p.x,y:p.y,time:p.downTime};this.lastDrag={x:p.x,y:p.y};this.gestureCancelled=this.input.manager.pointers.filter(p=>p.isDown).length>1;
      });
      this.input.on('pointermove',(p:Phaser.Input.Pointer)=>{
        if(!p.isDown||document.querySelector('[aria-modal="true"]'))return;
        const touches=this.input.manager.pointers.filter(p=>p.isDown);
        if(touches.length>1){this.gestureCancelled=true;const d=Phaser.Math.Distance.Between(touches[0].x,touches[0].y,touches[1].x,touches[1].y);if(this.pinchDistance)this.cameras.main.setZoom(Phaser.Math.Clamp(this.cameras.main.zoom*d/this.pinchDistance,.28,1.3));this.pinchDistance=d;return;}
        if(this.gesture&&Math.hypot(p.x-this.gesture.x,p.y-this.gesture.y)>=10)this.gestureCancelled=true;
        if(this.gestureCancelled&&this.lastDrag){this.cameras.main.stopFollow();this.cameras.main.scrollX-=(p.x-this.lastDrag.x)/this.cameras.main.zoom;this.cameras.main.scrollY-=(p.y-this.lastDrag.y)/this.cameras.main.zoom;this.target=null;}
        this.lastDrag={x:p.x,y:p.y};
      });
      this.input.on('pointerup',(p:Phaser.Input.Pointer,objects:Phaser.GameObjects.GameObject[])=>{
        this.pinchDistance=0;
        if(!this.tap(p)||objects.length)return;
        const point=fromCourtyard(this.cameras.main.getWorldPoint(p.x,p.y));
        if(point.x<40||point.x>1960||point.y<70||point.y>1360)return;
        this.target={x:Phaser.Math.Clamp(point.x,40,1960),y:Phaser.Math.Clamp(point.y,70,1360)};
        this.marker.setPosition(toCourtyard(this.target).x,toCourtyard(this.target).y).setVisible(true);this.cameras.main.startFollow(this.me,true,.07,.07,0,430);host.focus();
      });
      get().actions.current={
        goTo:(x,y,teleport=false)=>{if(teleport){this.player={x,y};this.target=null;this.me.setPosition(toCourtyard({x,y}).x,toCourtyard({x,y}).y);get().onTeleport(x,y);}else {this.target={x,y};this.marker.setPosition(toCourtyard({x,y}).x,toCourtyard({x,y}).y).setVisible(true);}host.focus();},
        zoom:(delta)=>{this.cameras.main.setZoom(Phaser.Math.Clamp(this.cameras.main.zoom+delta,.28,1.4));},
        home:()=>{this.cameras.main.startFollow(this.me,true,.12,.12,0,430);host.focus();},
        sync:(x,y)=>{this.player={x,y};this.me.setPosition(toCourtyard({x,y}).x,toCourtyard({x,y}).y);this.target=null;this.marker.setVisible(false);},
      };
      this.scale.on('resize',()=>this.cameras.main.setSize(this.scale.width,this.scale.height));
      this.rebuildPosts();
    }
    drawLandscape(){
      const room=get().room;
      if(room){
        const illustrated=!!drawCourtyard(this)||drawIllustratedGround(this);
        const floor=this.add.graphics(),night=room.theme==='night';
        this.cameras.main.setBackgroundColor(night?'#303d4d':room.theme==='studio'?'#e9dfcf':'#dbe8d1');
        if(!illustrated){floor.fillStyle(night?0x394d58:room.theme==='studio'?0xf2e9da:0xd0dfc2);floor.fillRoundedRect(50,50,1900,1300,70);
        floor.lineStyle(1,night?0x647c80:0xa8b29d,.25);for(let x=80;x<2000;x+=80)floor.lineBetween(x,80,x,1320);for(let y=80;y<1350;y+=80)floor.lineBetween(80,y,1920,y);}
        if(illustrated&&room.theme!=='garden'){floor.setDepth(-90);floor.fillStyle(night?0x46546c:0xc7a480,night?.24:.1).fillRect(0,0,2000,1400);}
        this.add.text(1000,105,room.title,{fontFamily:'sans-serif',fontSize:'32px',color:'#5d5145',backgroundColor:'#fff5e6',padding:{x:20,y:12}}).setOrigin(.5);
        this.add.text(1000,1300,'ENTRANCE · '+room.ownerName,{fontFamily:'sans-serif',fontSize:'18px',color:'#5d5145',backgroundColor:'#fff5e6',padding:{x:14,y:8}}).setOrigin(.5);
        for(const item of room.decorations){const d={...item,...toCourtyard(item)};if(d.kind==='tree')this.tree(d.x,d.y,1);else {const g=this.add.graphics();g.setDepth(d.y);if(d.kind==='stone'){g.fillStyle(0x9da8a1);g.fillEllipse(d.x,d.y-12,65,40);}else if(d.kind==='bench'){g.fillStyle(0x9a7053);g.fillRoundedRect(d.x-42,d.y-30,84,24,5);g.fillRect(d.x-32,d.y-6,7,18);g.fillRect(d.x+26,d.y-6,7,18);}else {g.fillStyle(0x74965d);g.fillRect(d.x-3,d.y-30,6,30);g.fillStyle(0xe5b36d);for(let i=0;i<6;i++)g.fillCircle(d.x+Math.cos(i*Math.PI/3)*13,d.y-35+Math.sin(i*Math.PI/3)*13,10);g.fillStyle(0xfff4c4);g.fillCircle(d.x,d.y-35,7);}}}
        return;
      }
      if(get().place){this.drawPlace();return;}
      const g=this.add.graphics();
      g.fillStyle(0xd3e3c5);g.fillRoundedRect(35,25,1930,1350,130);
      // Quiet garden parcels, connected by broad walkable paths.
      for(const a of areas){const col=Phaser.Display.Color.HexStringToColor(a.color).color;g.fillStyle(col,.16);g.fillRoundedRect(a.x-290,a.y-280,580,530,90);g.lineStyle(2,col,.3);g.strokeRoundedRect(a.x-290,a.y-280,580,530,90);}
      g.lineStyle(92,0xc6d5b7,1);g.beginPath();g.moveTo(410,330);g.lineTo(1000,690);g.lineTo(1580,330);g.moveTo(440,1050);g.lineTo(1000,690);g.lineTo(1570,1050);g.strokePath();
      g.lineStyle(78,0xf1eddd,1);g.beginPath();g.moveTo(410,330);g.lineTo(1000,690);g.lineTo(1580,330);g.moveTo(440,1050);g.lineTo(1000,690);g.lineTo(1570,1050);g.strokePath();
      g.fillStyle(0xf4f0e2);g.fillRoundedRect(710,480,580,450,120);
      for(let i=0;i<160;i++){const x=70+(i*271)%1850,y=45+(i*397)%1300;if(Math.hypot(x-1000,y-690)<280)continue;g.fillStyle(i%3===0?0xf6e3ae:0x9aba8b,.55);g.fillCircle(x,y,i%3+2);}
      // Small paving stones rather than a grid of tiles.
      for(let i=0;i<16;i++){g.fillStyle(0xdddacb,.7);g.fillRoundedRect(774+(i%4)*123,535+Math.floor(i/4)*85,45,4,2);}
      // Central fountain with ripples.
      const f=this.add.graphics();f.fillStyle(0xb2bda9,.3);f.fillEllipse(1008,696,150,68);f.fillStyle(0xbec8b6);f.fillEllipse(1000,678,146,68);f.fillStyle(0xfaf8ed);f.fillEllipse(1000,666,146,68);f.fillStyle(0x8cbfb2);f.fillEllipse(1000,663,118,49);f.lineStyle(2,0xe2f4dc,.9);f.strokeEllipse(1000,662,80,28);f.fillStyle(0xe9e9d8);f.fillRoundedRect(994,622,12,42,4);f.fillEllipse(1000,622,43,19);f.fillStyle(0x9ccdc4);f.fillEllipse(1000,618,32,11);
      for(const [x,y,s] of [[160,220,1.3],[680,120,1],[1760,160,1.2],[1840,650,1.5],[130,800,1.2],[770,1190,1],[1200,1210,1.2],[1790,1240,1.4],[240,1270,1],[1210,160,.9],[70,550,.8],[800,360,.8]] as number[][])this.tree(x,y,s);
      for(const [x,y] of [[740,780],[1200,780],[275,440],[1720,950]]){g.fillStyle(0x9ba78e,.25);g.fillEllipse(x,y+12,80,20);g.fillStyle(0x9a7053);g.fillRoundedRect(x-34,y-12,68,12,3);g.fillStyle(0xc39870);g.fillRoundedRect(x-34,y-30,68,17,3);g.fillStyle(ink);g.fillRect(x-25,y,5,12);g.fillRect(x+20,y,5,12);}
      // A little pavilion and cafe counter.
      g.fillStyle(0xc5cfb7,.5);g.fillEllipse(1050,360,210,50);g.fillStyle(0xe7dac1);g.fillRoundedRect(950,275,190,75,8);g.fillStyle(0xb5a38a);g.fillRect(964,250,8,77);g.fillRect(1116,250,8,77);g.fillStyle(0x55735d);g.fillTriangle(922,256,1166,256,1044,177);g.fillStyle(0x68866d);g.fillTriangle(922,256,1044,256,1044,177);g.fillStyle(0x54745e);g.fillRoundedRect(982,288,124,35,5);
      this.add.text(1044,304,'WALK CAFÉ',{fontFamily:'sans-serif',fontSize:'14px',color:'#f2f1d9',fontStyle:'bold'}).setOrigin(.5);
      for(const a of areas){
        this.add.text(a.x,a.y+48,a.name,{fontFamily:'sans-serif',fontSize:'17px',fontStyle:'bold',color:'#6f8067',letterSpacing:2}).setOrigin(.5).setAlpha(.75);
        this.add.text(a.x,a.y+72,a.label,{fontFamily:'sans-serif',fontSize:'12px',color:'#829178'}).setOrigin(.5);
      }
      g.fillStyle(0xfaf7e9);g.fillRoundedRect(1260,540,86,62,8);g.fillStyle(0xc59662);g.fillRect(1298,594,8,40);
      this.add.text(1303,568,'↖ ART\nMUSIC ↗',{fontSize:'12px',fontFamily:'sans-serif',color:'#6a735e',align:'center',lineSpacing:6}).setOrigin(.5);
    }
    tap(p:Phaser.Input.Pointer){return !document.querySelector('[aria-modal="true"]')&&!((p.event as PointerEvent).button>0)&&isTap(this.gesture,{x:p.x,y:p.y,time:p.upTime},this.gestureCancelled);}
    bindAction(c:Phaser.GameObjects.Container,regions:HitRegion[],action:()=>void){
      c.setInteractive(regions,(_shape:HitRegion[],x:number,y:number)=>containsContainer(regions,x,y,c.displayOriginX,c.displayOriginY));
      c.input!.cursor='pointer';
      c.on('pointerup',(p:Phaser.Input.Pointer,_x:number,_y:number,event:Phaser.Types.Input.EventData)=>{if(!this.tap(p))return;event.stopPropagation();action();});
      c.on('pointerover',()=>{(c.getData('halo') as Phaser.GameObjects.Graphics|undefined)?.setVisible(true);});
      c.on('pointerout',()=>{(c.getData('halo') as Phaser.GameObjects.Graphics|undefined)?.setVisible(false);});
    }
    drawPlace(){
      const place=get().place!;const painted=drawCourtyard(this,place);if(painted){for(const entrance of painted)this.bindAction(entrance.container,entrance.regions,()=>entrance.destination?get().onEnter(entrance.destination):get().onGuide());return;}const hall=drawPlaceArt(this,place,(x,y,s)=>this.tree(x,y,s));if(hall)this.bindAction(hall,(hall.getData('hitRegions') as HitRegion[]|undefined)||[polygon([-208,-131,-55,-252,209,-165,209,-155,180,-34,78,34,-190,15]),rectangle(-170,40,330,43)],()=>get().onGuide());
      for(const gate of gatePoints(place.id)){
        const c=this.add.container(gate.x,gate.y).setDepth(gate.y).setSize(270,300);
        const regions=drawBuilding(this,c,gate.place,gate.place.id===place.parentId);
        this.bindAction(c,regions,()=>get().onEnter(gate.place.id));
      }
    }
    tree(x:number,y:number,s:number){const g=this.add.graphics();g.fillStyle(0x8ea47b,.23);g.fillEllipse(x+10,y+14,85*s,25*s);g.fillStyle(0x987759);g.fillRoundedRect(x-6*s,y-45*s,12*s,60*s,3);g.fillStyle(0x68876a);g.fillCircle(x,y-64*s,37*s);g.fillStyle(0x7e9d76);g.fillCircle(x-17*s,y-73*s,27*s);g.fillStyle(0x91ac80);g.fillCircle(x-8*s,y-90*s,24*s);g.fillStyle(0xa6be8d,.7);g.fillCircle(x-15*s,y-99*s,10*s);g.setDepth(y-35);}
    makeAvatar(p:Peer,self=false){
      const at=toCourtyard(p),c=this.add.container(at.x,at.y),g=this.add.graphics(),col=Phaser.Display.Color.HexStringToColor(p.color).color;
      g.fillStyle(0x54493f,.2);g.fillEllipse(0,3,42,13);
      g.lineStyle(self?3:2,col,.9);g.strokeEllipse(0,4,self?55:45,self?22:18);c.add(g);
      if(this.textures.exists('walk-residents')){const image=this.add.image(0,0,get().light==='evening'?'walk-residents-evening':'walk-residents',p.style).setDisplaySize(128,128).setOrigin(.5,1);c.add(image);(this.data.get('resident-images') as Phaser.GameObjects.Image[]).push(image);}
      else {g.fillStyle(col);g.fillRoundedRect(-15,-37,30,36,9);g.fillStyle(0xe0bfa2);g.fillCircle(0,-48,14);}
      const label=this.add.text(0,-145,self?'あなた':p.displayName,{fontFamily:'sans-serif',fontSize:'18px',color:'#51483f',backgroundColor:'#fff7e8',padding:{x:10,y:6}}).setOrigin(.5);
      const status=this.add.text(0,27,'',{fontFamily:'sans-serif',fontSize:'16px',color:'#5d6a53',backgroundColor:'#fff7e8',padding:{x:7,y:4}}).setOrigin(.5);c.setData('name',label);c.setData('status',status);c.add([label,status]);c.setSize(80,165).setDepth(at.y+15);
      if(!self)this.bindAction(c,[rectangle(-43,-165,86,210)],()=>get().onProfile(p.id));
      c.setData('look',p.color+p.style+p.displayName);return c;
    }
    rebuildPosts(){
      for(const c of this.panels.values())c.destroy();this.panels.clear();
      for(const p of get().posts){
        const at=toCourtyard({x:p.mapX,y:p.mapY}),c=this.add.container(at.x,at.y-90);const g=this.add.graphics();const a=areas.find(a=>a.id===p.genre)!;const col=Phaser.Display.Color.HexStringToColor(a.color).color;
        g.fillStyle(0x69553f,.15);g.fillEllipse(5,14,82,18);g.fillStyle(0xa78b68);g.fillRoundedRect(-32,-6,5,30,2);g.fillRoundedRect(28,-6,5,30,2);
        g.fillStyle(0xa78b68);g.fillRoundedRect(-53,-86,106,86,4);g.fillStyle(0xfff5df);g.fillRoundedRect(-49,-82,98,78,3);
        g.fillStyle(col,.23);g.fillRoundedRect(-44,-77,88,45,3);c.add(g);
        if(p.type==='image' && /^\/art\/scene-\d\.svg$/.test(p.mediaUrl)){const i=Number(p.mediaUrl.match(/\d/)![0]);c.add(this.add.image(0,-55,'art-'+i).setDisplaySize(87,43));}
        else c.add(this.add.text(0,-55,(p.type==='youtube'||p.type==='video')?'▶︎':p.type==='external'?'↗':a.icon,{fontFamily:'sans-serif',fontSize:'28px',color:'#74694e'}).setOrigin(.5));
        const title=this.add.text(0,-114,p.title,{fontFamily:'sans-serif',fontSize:'16px',fontStyle:'bold',color:'#594c38',backgroundColor:'#fff7e8',padding:{x:10,y:7},wordWrap:{width:190},align:'center'}).setOrigin(.5,1).setVisible(false);c.add(title);c.setData('title',title);
        const countLabel=this.add.text(0,-18,'',{fontFamily:'sans-serif',fontSize:'12px',color:'#7c7057'}).setOrigin(.5);c.add(countLabel);c.setData('count',countLabel);
        c.setDepth(at.y-90).setSize(106,110);this.bindAction(c,[rectangle(-53,-86,106,110)],()=>get().onOpen(p.id));
        c.on('pointerover',()=>{c.setData('hover',true);host.style.cursor='pointer';});c.on('pointerout',()=>{c.setData('hover',false);host.style.cursor='crosshair';});
        this.panels.set(p.id,c);
      }
    }
    update(time:number,delta:number){
      if(!this.me)return;const props=get();if(this.light!==props.light){this.light=props.light;applyWorldLight(this,props.light);lightCourtyard(this,props.light);host.dataset.light=props.light;}
      if(time-this.diagnosticAt>100){this.diagnosticAt=time;const cam=this.cameras.main;host.dataset.viewport=JSON.stringify({scrollX:cam.scrollX,scrollY:cam.scrollY,zoom:cam.zoom,width:cam.width,height:cam.height});host.dataset.ready='true';}this.input.enabled=!document.querySelector('[aria-modal="true"]');
      const version=props.posts.map(p=>p.id+p.title+p.mapX+p.mapY+p.type+p.mediaUrl+p.genre).join('|');if(version!==this.postsVersion){this.postsVersion=version;this.rebuildPosts();}
      const av=props.user.color+props.user.style;if(av!==this.avatarVersion){this.avatarVersion=av;this.me.destroy();this.me=this.makeAvatar({...props.user,...this.player,area:'discovery',currentPost:null},true);this.cameras.main.startFollow(this.me,true,.07,.07,0,430);}
      const typing=['INPUT','TEXTAREA','SELECT','BUTTON'].includes(document.activeElement?.tagName||'') || !!document.querySelector('[aria-modal="true"]');
      if(typing){for(const key of Object.values(this.keys))key.reset();}
      if(document.activeElement===host&&!typing)this.input.keyboard!.enableGlobalCapture();else this.input.keyboard!.disableGlobalCapture();
      let dx=0,dy=0;const k=this.keys;
      if(!typing){dx=(k.D.isDown||k.RIGHT.isDown?1:0)-(k.A.isDown||k.LEFT.isDown?1:0);dy=(k.S.isDown||k.DOWN.isDown?1:0)-(k.W.isDown||k.UP.isDown?1:0);if(dx||dy)this.target=null;}
      if(this.target&&!typing){dx=this.target.x-this.player.x;dy=this.target.y-this.player.y;if(Math.hypot(dx,dy)<7){this.target=null;this.marker.setVisible(false);dx=dy=0;}}
      const length=Math.hypot(dx,dy);const moving=length>0&&!typing;const speedStep=Math.min(delta,100)/1000*240;const step=this.target?Math.min(speedStep,length):speedStep;
      if(moving){this.player.x=Phaser.Math.Clamp(this.player.x+dx/length*step,40,1960);this.player.y=Phaser.Math.Clamp(this.player.y+dy/length*step,70,1360);}
      const at=toCourtyard(this.player);this.me.setPosition(at.x,at.y).setDepth(at.y+30);(this.me.getData('name') as Phaser.GameObjects.Text).setY(props.currentPost?25:-145);this.me.setScale(1,moving&&!window.matchMedia('(prefers-reduced-motion: reduce)').matches?1+Math.sin(time/70)*.025:1);
      if(moving&&time-this.last>100){this.last=time;props.onMove(this.player.x,this.player.y);}
      const a=props.place?.genre||areaAt(this.player.x,this.player.y);if(a!==this.area){this.area=a;props.onArea(a);}
      let nearest:Post|undefined;let dist=150;for(const p of props.posts){const d=Math.hypot(p.mapX-this.player.x,p.mapY-this.player.y);if(d<dist){dist=d;nearest=p;}}
      const near=nearest?.id||null;if(near!==this.near){this.near=near;props.onNear(near);}
      if(!typing&&near&&Phaser.Input.Keyboard.JustDown(k.E))props.onOpen(near);
      for(const [id,c]of this.panels){const n=props.state.counts[id]||0;(c.getData('count') as Phaser.GameObjects.Text).setText(n>0?`${n}人が閲覧中`:'開く ↗');(c.getData('title') as Phaser.GameObjects.Text).setVisible(near===id||!!c.getData('hover')||props.currentPost===id);}
      const active=new Set<string>();
      for(const p of props.state.peers){if(p.id===props.user.id)continue;active.add(p.id);let c=this.people.get(p.id);if(c&&c.getData('look')!==p.color+p.style+p.displayName){c.destroy();this.people.delete(p.id);c=undefined;}if(!c){c=this.makeAvatar(p);this.people.set(p.id,c);}const viewing=props.posts.find(post=>post.id===p.currentPost);const viewerIndex=(props.state.viewers[p.currentPost||'']||[]).findIndex(v=>v.id===p.id);const px=viewing?viewing.mapX-45+Math.max(0,viewerIndex)%4*30:p.x,py=viewing?viewing.mapY+110+Math.floor(Math.max(0,viewerIndex)/4)*55:p.y;const at=toCourtyard({x:px,y:py});c.x=Phaser.Math.Linear(c.x,at.x,.2);c.y=Phaser.Math.Linear(c.y,at.y,.2);c.setDepth(c.y+20);(c.getData('name') as Phaser.GameObjects.Text).setY(p.currentPost?27:-145);(c.getData('status') as Phaser.GameObjects.Text).setY(p.currentPost?57:27);(c.getData('status') as Phaser.GameObjects.Text).setText(p.currentPost?'閲覧中':'');}
      for(const [id,c]of this.people)if(!active.has(id)){c.destroy();this.people.delete(id);}
      const ghosts=new Set<string>();for(const a of props.state.activities||[]){ghosts.add(a.activityId);const look=a.displayName+a.style+a.color+a.title+a.endsAt+a.online;let c=this.ghosts.get(a.activityId);if(c&&c.getData('activityLook')!==look){c.destroy();this.ghosts.delete(a.activityId);c=undefined;}if(!c){c=this.makeAvatar({...a,area:'discovery',currentPost:null});c.setAlpha(.65);c.add(this.add.text(0,53,'現実で '+a.title+'\n'+new Date(a.endsAt).toLocaleTimeString('ja',{hour:'2-digit',minute:'2-digit'})+'まで · 自己申告',{fontFamily:'sans-serif',fontSize:'12px',color:'#435c66',backgroundColor:'#ffffffdd',padding:{x:8,y:5},align:'center'}).setOrigin(.5));c.setData('activityLook',look);this.ghosts.set(a.activityId,c);}}
      for(const [id,c]of this.ghosts)if(!ghosts.has(id)){c.destroy();this.ghosts.delete(id);}
    }
  }
  return new Phaser.Game({type:Phaser.CANVAS,parent:host,width:host.clientWidth,height:host.clientHeight,backgroundColor:'#dbe8d1',antialias:true,roundPixels:false,scene:WalkScene,scale:{mode:Phaser.Scale.RESIZE,autoCenter:Phaser.Scale.CENTER_BOTH},input:{keyboard:true},render:{powerPreference:'low-power'}});
}
