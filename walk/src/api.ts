import {t} from './i18n';
import {walkFetch} from './native';

export class ApiError extends Error {
  constructor(message:string,public status:number,public outcomeUnknown=false){super(message);this.name='ApiError';}
}
const uncertain='結果を確認できませんでした。保存されている可能性があります。接続が戻ったら状態を確認してから操作してください。';
const unavailable='接続できませんでした。通信環境を確認して、もう一度お試しください。';
function fallback(status:number){
  if(status===401)return t('セッションが使えません。ログインして記録に戻れます。新しいゲストには切り替えていません。');
  if(status===403)return t('この操作は許可されていません。');
  if(status===404)return t('対象が見つかりません');
  if(status===429)return t('操作が多すぎます。少し待ってください。');
  return t('サーバーから正常な応答が届きませんでした。時間をおいて、もう一度お試しください。');
}
// A bounded, single attempt. In particular, writes are never replayed after a
// lost acknowledgement: the server may already have committed them.
export async function apiRequest<T>(path:string,options:RequestInit={},timeoutMs=20000):Promise<T>{
  const method=(options.method||'GET').toUpperCase(),writes=!['GET','HEAD','OPTIONS'].includes(method);
  const headers=new Headers(options.headers);headers.set('X-Walk-Client','1');
  const controller=new AbortController(),external=options.signal;
  if(external?.aborted)throw new DOMException('Aborted','AbortError');
  let timer:ReturnType<typeof setTimeout>|undefined,onAbort:(()=>void)|undefined;
  const stop=new Promise<never>((_,reject)=>{
    timer=setTimeout(()=>{reject(new ApiError(t(writes?uncertain:'接続に時間がかかっています。通信環境を確認してもう一度お試しください。'),0,writes));controller.abort();},timeoutMs);
    onAbort=()=>{reject(new DOMException('Aborted','AbortError'));controller.abort();};
    external?.addEventListener('abort',onAbort,{once:true});
  });
  const request=(async()=>{
    let response:Response;
    try{response=await walkFetch('/api'+path,{...options,method,headers,credentials:'same-origin',signal:controller.signal});}
    catch{throw new ApiError(t(writes?uncertain:unavailable),0,writes);}
    let data:unknown,valid=false;
    if(/^application\/(?:json|[\w.-]+\+json)(?:\s*;|$)/i.test(response.headers.get('content-type')||'')){
      try{data=await response.json();valid=true;}catch{/* A proxy page or interrupted body is not an application error message. */}
    }
    if(!response.ok){
      const detail=valid&&data&&typeof data==='object'&&'error' in data&&typeof data.error==='string'&&data.error.trim()?t(data.error):fallback(response.status);
      const unknown=writes&&(response.status===0||response.status>=500);
      throw new ApiError(unknown?detail+' '+t(uncertain):detail,response.status,unknown);
    }
    if(response.status===204||response.status===205||method==='HEAD')return undefined as T;
    if(!valid)throw new ApiError(t(writes?uncertain:'応答を読み取れませんでした。接続を確認して、もう一度お試しください。'),response.status,writes);
    return data as T;
  })();
  try{return await Promise.race([request,stop]);}
  finally{clearTimeout(timer);if(onAbort)external?.removeEventListener('abort',onAbort);}
}
export function api<T>(path:string,method='GET',body?:unknown):Promise<T>{
  return apiRequest<T>(path,{method,headers:body===undefined?{}:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
}
