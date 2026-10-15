import { useEffect, useRef } from 'react';
import type { Place } from '../shared/worlds';
import type { Room } from '../shared/community';
import type Phaser from 'phaser';
import type { Peer, Post, User, WorldState } from '../shared/model';
import type { WorldLight } from './world-light';
export type WorldActions = { goTo: (x:number,y:number,teleport?:boolean)=>void; zoom: (delta:number)=>void; home:()=>void; sync:(x:number,y:number)=>void };
export type WorldProps = { light:WorldLight; place?:Place; onEnter:(id:string)=>void; onGuide:()=>void; room?: Room; user: User; posts: Post[]; state: WorldState; onMove:(x:number,y:number)=>void; onTeleport:(x:number,y:number)=>void; onOpen:(id:string)=>void; onNear:(id:string|null)=>void; onProfile:(id:string)=>void; onArea:(id:string)=>void; actions: React.RefObject<WorldActions|null> };
export default function World(props: WorldProps) {
  const host=useRef<HTMLDivElement>(null); const current=useRef(props); current.current=props;
  useEffect(()=>{
    let game: Phaser.Game | undefined; let cancelled=false;
    void import('./world-scene').then(({createWorld})=>{if(!cancelled && host.current)game=createWorld(host.current,()=>current.current);});
    return()=>{cancelled=true;game?.destroy(true);props.actions.current=null;};
  },[props.actions]);
  return <div className="world-canvas" ref={host} role="application" aria-label="WALK マップ。矢印キー・WASD・タップで移動、ドラッグで見渡せます。建物全体を選ぶと世界へ入ります。投稿の近くでEキーを押すと開きます。" tabIndex={0}><span className="sr-only">地図操作が難しい場合は「投稿を探す」からすべての投稿を閲覧できます。</span></div>;
}
export type { Peer };
