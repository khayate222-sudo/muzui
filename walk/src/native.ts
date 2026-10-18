import {t} from './i18n';
import {clearPostDrafts} from './post-draft';
import { Capacitor, CapacitorHttp } from '@capacitor/core';
import { nativeServerUrl } from '../shared/native';
export const isNative=()=>Capacitor.isNativePlatform();
let server='',token='';
export const serviceUrl=(path:string)=>isNative()?server+path:path;
export const nativeSocketOptions=()=>isNative()?{server,options:{transports:['websocket'],auth:{token}}}:null;
export function walkFetch(path:string,options:RequestInit={}){
 const headers=new Headers(options.headers);if(isNative()){headers.set('X-Walk-Native','1');if(token)headers.set('Authorization','Bearer '+token);}
 return fetch(serviceUrl(path),{...options,headers,credentials:isNative()?'omit':'same-origin'});
}
export async function prepareNative(){
 if(!isNative())return;
 server=nativeServerUrl(import.meta.env.VITE_WALK_SERVER_URL);
 const {SecureStorage,KeychainAccess}=await import('@aparajita/capacitor-secure-storage');
 await SecureStorage.setSynchronize(false);await SecureStorage.setDefaultKeychainAccess(KeychainAccess.whenUnlockedThisDeviceOnly);
 const key='walk.session:'+server,saved=await SecureStorage.getItem(key);
 if(saved)token=saved;
 else{
  const response=await CapacitorHttp.post({url:server+'/api/native/session',headers:{'X-Walk-Client':'1','Content-Type':'application/json'},data:{}});
  if(response.status!==200||typeof response.data?.token!=='string')throw new Error(t('WALKに接続できませんでした。時間をおいてもう一度お試しください。'));
  token=response.data.token;await SecureStorage.setItem(key,token);
 }
 const {App}=await import('@capacitor/app');
 await App.addListener('appStateChange',({isActive})=>window.dispatchEvent(new CustomEvent(isActive?'walk:foreground':'walk:background')));
 if(Capacitor.getPlatform()==='android')await App.addListener('backButton',()=>{
  const top=[...document.querySelectorAll<HTMLElement>('[role="dialog"]')].at(-1);if(top)top.querySelector<HTMLButtonElement>('button[data-close-dialog]')?.click();else void App.minimizeApp();
 });
 const {Keyboard}=await import('@capacitor/keyboard');
 await Keyboard.addListener('keyboardWillShow',()=>document.documentElement.classList.add('keyboard-open'));
 await Keyboard.addListener('keyboardWillHide',()=>document.documentElement.classList.remove('keyboard-open'));
}
export async function privatePhoto(path:string):Promise<string>{
 const response=await CapacitorHttp.get({url:serviceUrl(path),headers:{Authorization:'Bearer '+token},responseType:'arraybuffer'});
 if(response.status!==200)throw new Error(t('写真を表示できません'));
 const mime=response.headers['content-type']||response.headers['Content-Type'];
 if(!/^image\/(png|jpeg|gif|webp)(;|$)/.test(mime||''))throw new Error(t('写真の形式を確認できません'));
 return `data:${mime};base64,${response.data}`;
}

export async function replaceNativeSession(next?:string){
 if(!isNative())return;
 const {SecureStorage}=await import('@aparajita/capacitor-secure-storage');const key='walk.session:'+server;
 if(next){await SecureStorage.setItem(key,next);token=next;}else {await SecureStorage.removeItem(key);token='';}
}
export function announceSessionChange(welcomed=true){
 clearPostDrafts();
 window.dispatchEvent(new CustomEvent('walk:background'));
 if(welcomed)localStorage.setItem('walk-welcomed','1');else {localStorage.removeItem('walk-welcomed');history.replaceState(null,'',location.pathname+location.search);}
 localStorage.setItem('walk-session-revision',crypto.randomUUID());location.reload();
}
export async function saveDataExport(value:unknown){
 const data=JSON.stringify(value,null,2);
 if(isNative()){
  const {Filesystem,Directory,Encoding}=await import('@capacitor/filesystem'),{Share}=await import('@capacitor/share');const path='walk-export-'+crypto.randomUUID()+'.json';
  const file=await Filesystem.writeFile({path,directory:Directory.Cache,data,encoding:Encoding.UTF8});
  try{await Share.share({title:t('WALKのデータ'),files:[file.uri],dialogTitle:t('自分のデータを保存')});}finally{await Filesystem.deleteFile({path,directory:Directory.Cache}).catch(()=>{});}
 }else{
  const url=URL.createObjectURL(new Blob([data],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='walk-data.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);
 }
}
