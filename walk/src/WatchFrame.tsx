import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import Modal from './Modal';
export default function WatchFrame({large,toggle,close,children}:{large:boolean;toggle:()=>void;close:()=>void;children:ReactNode}){
 useEffect(()=>{if(large)return;const key=(e:KeyboardEvent)=>{if(e.key==='Escape'&&!document.querySelector('[aria-modal="true"]'))close();};document.addEventListener('keydown',key);return()=>document.removeEventListener('keydown',key);},[large,close]);
 const controls=<div className="watch-controls"><span>{large?'大画面で視聴':'箱庭と一緒に視聴'}</span><button className="outline" onClick={toggle}>{large?'箱庭と見る':'大画面で見る'}</button>{!large&&<button className="icon-button" aria-label="閉じる" onClick={close}>×</button>}</div>;
 return large?<Modal title="A LITTLE DISCOVERY" wide close={close}>{controls}{children}</Modal>:createPortal(<section className="watch-side" role="dialog" aria-modal="false" aria-label="A LITTLE DISCOVERY">{controls}{children}</section>,document.body);
}
