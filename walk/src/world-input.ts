export type HitRegion={kind:'polygon';points:{x:number;y:number}[]}|{kind:'rect';x:number;y:number;width:number;height:number}|{kind:'mask';x:number;y:number;width:number;height:number;pixelWidth:number;pixelHeight:number;alpha:Uint8Array};
export const rectangle=(x:number,y:number,width:number,height:number):HitRegion=>({kind:'rect',x,y,width,height});
export const polygon=(coordinates:number[]):HitRegion=>({kind:'polygon',points:Array.from({length:coordinates.length/2},(_,i)=>({x:coordinates[i*2],y:coordinates[i*2+1]}))});
export function containsLocal(regions:HitRegion[],x:number,y:number):boolean{
 return regions.some(region=>{
  if(region.kind==='rect')return x>=region.x&&x<=region.x+region.width&&y>=region.y&&y<=region.y+region.height;
  if(region.kind==='mask'){
   if(x<region.x||y<region.y||x>=region.x+region.width||y>=region.y+region.height)return false;
   const px=Math.floor((x-region.x)/region.width*region.pixelWidth),py=Math.floor((y-region.y)/region.height*region.pixelHeight);
   return region.alpha[py*region.pixelWidth+px]>=128;
  }
  let inside=false;const p=region.points;
  for(let i=0,j=p.length-1;i<p.length;j=i++){
   const a=p[j],b=p[i],cross=(x-a.x)*(b.y-a.y)-(y-a.y)*(b.x-a.x);
   if(Math.abs(cross)<.0001&&x>=Math.min(a.x,b.x)&&x<=Math.max(a.x,b.x)&&y>=Math.min(a.y,b.y)&&y<=Math.max(a.y,b.y))return true;
   if((a.y>y)!==(b.y>y)&&x<(b.x-a.x)*(y-a.y)/(b.y-a.y)+a.x)inside=!inside;
  }
  return inside;
 });
}
// Phaser normalizes Container input coordinates by displayOrigin, even when its
// children are drawn around (0,0). Always undo that offset before shape testing.
export const containsContainer=(regions:HitRegion[],x:number,y:number,originX:number,originY:number)=>containsLocal(regions,x-originX,y-originY);
export function isTap(start:{x:number;y:number;time:number}|undefined,end:{x:number;y:number;time:number},cancelled=false){return !!start&&!cancelled&&end.time-start.time<700&&Math.hypot(end.x-start.x,end.y-start.y)<10;}
