import Phaser from 'phaser';
import { areas, areaAt, type Peer, type Post } from '../shared/model';
import type { WorldProps } from './World';
const ink=0x344b40;
export function createWorld(host:HTMLElement, get:()=>WorldProps) {
  class WalkScene extends Phaser.Scene {
    me!: Phaser.GameObjects.Container; player={x:1100,y:750}; target: {x:number;y:number}|null=null;
    keys!: Record<string,Phaser.Input.Keyboard.Key>; panels=new Map<string,Phaser.GameObjects.Container>(); people=new Map<string,Phaser.GameObjects.Container>();
    last=0; near:string|null=null; area=''; postsVersion=''; avatarVersion=''; marker!:Phaser.GameObjects.Container;
    constructor(){super('walk');}
    preload(){for(let i=0;i<5;i++)this.load.image('art-'+i,'/art/scene-'+i+'.svg');}
    create(){
      this.cameras.main.setBackgroundColor('#dbe8d1');this.cameras.main.setBounds(0,0,2000,1400);
      this.drawLandscape();
      const own=get().state.peers.find(p=>p.id===get().user.id);if(own)this.player={x:own.x,y:own.y};
      this.me=this.makeAvatar({...get().user,...this.player,area:'discovery',currentPost:null},true);
      this.cameras.main.setZoom(this.scale.width<600?.72:.8);this.cameras.main.startFollow(this.me,true,.07,.07);
      this.marker=this.add.container(0,0);const mg=this.add.graphics();mg.lineStyle(2,0x2c7158,.8);mg.strokeEllipse(0,0,36,18);this.marker.add(mg);this.marker.setVisible(false).setDepth(2);
      this.tweens.add({targets:this.marker,alpha:.3,scaleX:.7,scaleY:.7,yoyo:true,repeat:-1,duration:650});
      this.keys=this.input.keyboard!.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT,E') as typeof this.keys;
      // Keep arrows available to inputs and assistive navigation outside the map.
      this.input.keyboard!.disableGlobalCapture();
      this.input.on('pointerdown',(p:Phaser.Input.Pointer,objects:Phaser.GameObjects.GameObject[])=>{
        if(document.querySelector('[role="dialog"]') || objects.length || (p.event as PointerEvent).button>0)return;
        this.target={x:Phaser.Math.Clamp(p.worldX,40,1960),y:Phaser.Math.Clamp(p.worldY,70,1360)};this.marker.setPosition(this.target.x,this.target.y).setVisible(true);host.focus();
      });
      get().actions.current={
        goTo:(x,y,teleport=false)=>{if(teleport){this.player={x,y};this.target=null;this.me.setPosition(x,y);get().onTeleport(x,y);}else {this.target={x,y};this.marker.setPosition(x,y).setVisible(true);}host.focus();},
        zoom:(delta)=>{this.cameras.main.setZoom(Phaser.Math.Clamp(this.cameras.main.zoom+delta,.45,1.4));},
        home:()=>{this.target=null;this.player={x:1100,y:750};this.me.setPosition(1100,750);get().onTeleport(1100,750);host.focus();},
        sync:(x,y)=>{this.player={x,y};this.me.setPosition(x,y);this.target=null;this.marker.setVisible(false);},
      };
      this.scale.on('resize',()=>this.cameras.main.setSize(this.scale.width,this.scale.height));
      this.rebuildPosts();
      host.dataset.ready='true';
    }
    drawLandscape(){
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
    tree(x:number,y:number,s:number){const g=this.add.graphics();g.fillStyle(0x8ea47b,.23);g.fillEllipse(x+10,y+14,85*s,25*s);g.fillStyle(0x987759);g.fillRoundedRect(x-6*s,y-45*s,12*s,60*s,3);g.fillStyle(0x68876a);g.fillCircle(x,y-64*s,37*s);g.fillStyle(0x7e9d76);g.fillCircle(x-17*s,y-73*s,27*s);g.fillStyle(0x91ac80);g.fillCircle(x-8*s,y-90*s,24*s);g.fillStyle(0xa6be8d,.7);g.fillCircle(x-15*s,y-99*s,10*s);g.setDepth(y-35);}
    makeAvatar(p:Peer,self=false){
      const c=this.add.container(p.x,p.y);const g=this.add.graphics();const col=Phaser.Display.Color.HexStringToColor(p.color).color;
      g.fillStyle(ink,.18);g.fillEllipse(0,5,34,14);
      if(self){g.lineStyle(2,0x4e805c,.5);g.strokeEllipse(0,5,43,20);}
      g.fillStyle(0x3c4c43);g.fillRoundedRect(-11,-7,8,15,3);g.fillRoundedRect(3,-7,8,15,3);
      g.fillStyle(col);g.fillRoundedRect(-16,-29,32,28,10);g.fillStyle(0xf0ccaa);g.fillCircle(0,-37,15);
      if(p.style==='hair'){g.fillStyle(0x514137);g.fillEllipse(0,-46,32,16);g.fillRect(-15,-44,7,14);}
      else {g.fillStyle(col);g.fillRoundedRect(-17,-56,34,18,9);g.fillStyle(p.style==='cap'?0x344b40:0xf2e5bb);g.fillRoundedRect(-18,-43,p.style==='cap'?42:36,6,3);}
      g.fillStyle(ink);g.fillCircle(-5,-36,1.5);g.fillCircle(5,-36,1.5);
      const label=this.add.text(0,-76,self?'あなた':p.displayName,{fontFamily:'sans-serif',fontSize:'12px',color:self?'#ffffff':'#344b40',backgroundColor:self?'#345c46':'#fffffff0',padding:{x:9,y:5}}).setOrigin(.5);
      c.add([g,label]);c.setSize(45,90).setDepth(p.y+15);
      if(!self)c.setInteractive(new Phaser.Geom.Rectangle(-24,-80,48,96),Phaser.Geom.Rectangle.Contains).on('pointerdown',()=>{if(!document.querySelector('[role="dialog"]'))get().onProfile(p.id);});
      c.setData('look',p.color+p.style+p.displayName);return c;
    }
    rebuildPosts(){
      for(const c of this.panels.values())c.destroy();this.panels.clear();
      for(const p of get().posts){
        const c=this.add.container(p.mapX,p.mapY);const g=this.add.graphics();const a=areas.find(a=>a.id===p.genre)!;const col=Phaser.Display.Color.HexStringToColor(a.color).color;
        g.fillStyle(0x475a45,.12);g.fillEllipse(7,18,124,24);g.fillStyle(0xb59c7e);g.fillRoundedRect(-39,-2,6,31,2);g.fillRoundedRect(33,-2,6,31,2);
        g.fillStyle(0xffffff);g.fillRoundedRect(-72,-104,144,112,13);g.lineStyle(1,0xe1e5d8);g.strokeRoundedRect(-72,-104,144,112,13);
        g.fillStyle(col,.35);g.fillRoundedRect(-64,-96,128,55,8);
        c.add(g);
        if(p.type==='image' && /^\/art\/scene-\d\.svg$/.test(p.mediaUrl)){const i=Number(p.mediaUrl.match(/\d/)![0]);c.add(this.add.image(0,-69,'art-'+i).setDisplaySize(125,53));}
        else {c.add(this.add.text(0,-71,p.type==='youtube'?'▶︎':p.type==='external'?'↗':['✦','♫','▶','✿','☺'][areas.findIndex(a=>a.id===p.genre)],{fontFamily:'sans-serif',fontSize:'30px',color:'#4d6652'}).setOrigin(.5));}
        const title=p.title.length>12?p.title.slice(0,12)+'…':p.title;
        c.add(this.add.text(0,-28,title,{fontFamily:'sans-serif',fontSize:'11px',fontStyle:'bold',color:'#3b5043'}).setOrigin(.5));
        const countLabel=this.add.text(0,-10,'',{fontFamily:'sans-serif',fontSize:'10px',color:'#7a8c73'}).setOrigin(.5);c.add(countLabel);c.setData('count',countLabel);
        c.setDepth(p.mapY).setSize(144,112).setInteractive(new Phaser.Geom.Rectangle(-72,-104,144,112),Phaser.Geom.Rectangle.Contains);
        c.on('pointerdown',()=>{if(!document.querySelector('[role="dialog"]'))get().onOpen(p.id);});c.on('pointerover',()=>{this.tweens.add({targets:c,scale:1.035,duration:150});host.style.cursor='pointer';});c.on('pointerout',()=>{this.tweens.add({targets:c,scale:1,duration:150});host.style.cursor='crosshair';});
        this.panels.set(p.id,c);
      }
    }
    update(time:number,delta:number){
      if(!this.me)return;const props=get();this.input.enabled=!document.querySelector('[role="dialog"]');
      const version=props.posts.map(p=>p.id+p.title+p.mapX+p.mapY+p.type+p.mediaUrl+p.genre).join('|');if(version!==this.postsVersion){this.postsVersion=version;this.rebuildPosts();}
      const av=props.user.color+props.user.style;if(av!==this.avatarVersion){this.avatarVersion=av;this.me.destroy();this.me=this.makeAvatar({...props.user,...this.player,area:'discovery',currentPost:null},true);this.cameras.main.startFollow(this.me,true,.07,.07);}
      const typing=['INPUT','TEXTAREA','SELECT','BUTTON'].includes(document.activeElement?.tagName||'') || !!document.querySelector('[role="dialog"]');
      if(typing){for(const key of Object.values(this.keys))key.reset();}
      if(document.activeElement===host&&!typing)this.input.keyboard!.enableGlobalCapture();else this.input.keyboard!.disableGlobalCapture();
      let dx=0,dy=0;const k=this.keys;
      if(!typing){dx=(k.D.isDown||k.RIGHT.isDown?1:0)-(k.A.isDown||k.LEFT.isDown?1:0);dy=(k.S.isDown||k.DOWN.isDown?1:0)-(k.W.isDown||k.UP.isDown?1:0);if(dx||dy)this.target=null;}
      if(this.target&&!typing){dx=this.target.x-this.player.x;dy=this.target.y-this.player.y;if(Math.hypot(dx,dy)<7){this.target=null;this.marker.setVisible(false);dx=dy=0;}}
      const length=Math.hypot(dx,dy);const moving=length>0&&!typing;const speedStep=Math.min(delta,100)/1000*240;const step=this.target?Math.min(speedStep,length):speedStep;
      if(moving){this.player.x=Phaser.Math.Clamp(this.player.x+dx/length*step,40,1960);this.player.y=Phaser.Math.Clamp(this.player.y+dy/length*step,70,1360);}
      this.me.setPosition(this.player.x,this.player.y).setDepth(this.player.y+30);this.me.setScale(1,moving?1+Math.sin(time/70)*.025:1);
      if(moving&&time-this.last>100){this.last=time;props.onMove(this.player.x,this.player.y);}
      const a=areaAt(this.player.x,this.player.y);if(a!==this.area){this.area=a;props.onArea(a);}
      let nearest:Post|undefined;let dist=150;for(const p of props.posts){const d=Math.hypot(p.mapX-this.player.x,p.mapY-this.player.y);if(d<dist){dist=d;nearest=p;}}
      const near=nearest?.id||null;if(near!==this.near){this.near=near;props.onNear(near);}
      if(!typing&&near&&Phaser.Input.Keyboard.JustDown(k.E))props.onOpen(near);
      for(const [id,c]of this.panels){const n=props.state.counts[id]||0;(c.getData('count') as Phaser.GameObjects.Text).setText(n>0?`${n}人が開いています`:'開いてみる ↗');}
      const active=new Set<string>();
      for(const p of props.state.peers){if(p.id===props.user.id)continue;active.add(p.id);let c=this.people.get(p.id);if(c&&c.getData('look')!==p.color+p.style+p.displayName){c.destroy();this.people.delete(p.id);c=undefined;}if(!c){c=this.makeAvatar(p);this.people.set(p.id,c);}c.x=Phaser.Math.Linear(c.x,p.x,.2);c.y=Phaser.Math.Linear(c.y,p.y,.2);c.setDepth(c.y+20);}
      for(const [id,c]of this.people)if(!active.has(id)){c.destroy();this.people.delete(id);}
    }
  }
  return new Phaser.Game({type:Phaser.CANVAS,parent:host,width:host.clientWidth,height:host.clientHeight,backgroundColor:'#dbe8d1',antialias:true,roundPixels:false,scene:WalkScene,scale:{mode:Phaser.Scale.RESIZE,autoCenter:Phaser.Scale.CENTER_BOTH},input:{keyboard:true},render:{powerPreference:'low-power'}});
}
