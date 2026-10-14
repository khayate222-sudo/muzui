import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
export default function Modal({ title, children, close, wide=false }: {title:string;children:ReactNode;close:()=>void;wide?:boolean}) {
  const ref=useRef<HTMLDivElement>(null);const closer=useRef(close);closer.current=close;
  useEffect(()=>{
    const previous=document.activeElement as HTMLElement|null;
    const element=ref.current!;
    const shell=document.querySelector<HTMLElement>('.app-shell');if(shell)shell.inert=true;
    for(const dialog of document.querySelectorAll<HTMLElement>('[role="dialog"]'))if(dialog!==element){dialog.inert=true;dialog.setAttribute('aria-hidden','true');}
    const timer=setTimeout(()=>ref.current?.querySelector<HTMLElement>('button,input,select,textarea,a[href]')?.focus(),0);
    const key=(e:KeyboardEvent)=>{
      const dialogs=document.querySelectorAll('[role="dialog"]');if(dialogs[dialogs.length-1]!==ref.current)return;
      if(e.key==='Escape')closer.current();
      if(e.key==='Tab'){
        const items=ref.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input,select,textarea,a[href],[tabindex="0"]');if(!items?.length)return;
        const first=items[0],last=items[items.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}
      }
    };
    document.addEventListener('keydown',key);return()=>{clearTimeout(timer);document.removeEventListener('keydown',key);const remaining=[...document.querySelectorAll<HTMLElement>('[role="dialog"]')].filter(d=>d!==element);const top=remaining.at(-1);if(top){top.inert=false;top.removeAttribute('aria-hidden');}else if(shell)shell.inert=false;previous?.focus();};
  },[]);
  return createPortal(<div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)close();}}><div className={'modal '+(wide?'modal-wide':'')} ref={ref} role="dialog" aria-modal="true" aria-label={title}><div className="modal-top"><span>{title}</span><button className="icon-button" onClick={close} aria-label="閉じる"><X size={21}/></button></div>{children}</div></div>,document.body);
}
