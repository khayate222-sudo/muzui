import {useSyncExternalStore} from 'react';
import {messages} from './locales/messages';
import {locales,preferredLocale,type Locale} from '../shared/locale';
export {locales,matchLocale,preferredLocale,type Locale} from '../shared/locale';

const storageKey='walk-locale-v1';
function initialLocale():Locale{
  if(typeof navigator==='undefined')return 'en';
  let saved:string|null=null;try{saved=localStorage.getItem(storageKey);}catch{/* The session still works without storage. */}
  return preferredLocale(saved,navigator.languages.length?navigator.languages:[navigator.language]);
}
let locale=initialLocale();const listeners=new Set<()=>void>();
export const getLocale=()=>locale;
export function setLocale(value:Locale){
  if(!locales.includes(value))return;
  locale=value;try{localStorage.setItem(storageKey,value);}catch{/* Keep the selection for this session. */}
  if(typeof document!=='undefined')document.documentElement.lang=value;
  for(const update of listeners)update();
}
export function useLocale(){return useSyncExternalStore(listener=>{listeners.add(listener);return()=>listeners.delete(listener);},getLocale,()=> 'en' as Locale);}
// Only application-authored copy is passed here. User content is never translated.
export function t(source:string,language:Locale=locale):string{
  if(language==='ja')return source;
  const entry=messages[source];return entry?.[language]??source;
}
export function tr(source:string,values:Record<string,string|number>,language:Locale=locale){
  return t(source,language).replace(/\{(\w+)\}/g,(token,key)=>Object.hasOwn(values,key)?String(values[key]):token);
}
export const localeTag=(language:Locale=locale)=>({en:'en-US','zh-Hans':'zh-CN','zh-Hant':'zh-TW',ja:'ja-JP'})[language];
