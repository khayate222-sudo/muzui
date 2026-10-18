import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {api,apiRequest,ApiError} from '../src/api';
import {walkFetch} from '../src/native';
import {setLocale} from '../src/i18n';
vi.mock('../src/native',()=>({walkFetch:vi.fn()}));
beforeEach(()=>{vi.useFakeTimers();vi.mocked(walkFetch).mockReset();setLocale('en');});
afterEach(()=>{vi.useRealTimers();setLocale('ja');});
async function failure(request:Promise<unknown>):Promise<ApiError>{try{await request;}catch(e){expect(e).toBeInstanceOf(ApiError);if(e instanceof ApiError)return e;throw e;}throw new Error('Expected an API failure');}

it('keeps HTTP authentication status with an HTML error page without displaying proxy HTML',async()=>{
 vi.mocked(walkFetch).mockResolvedValue(new Response('<html>proxy diagnostic credential=do-not-show</html>',{status:401,headers:{'Content-Type':'text/html'}}));
 const e=await failure(api('/bootstrap'));expect(e).toBeInstanceOf(ApiError);expect(e.status).toBe(401);expect(e.outcomeUnknown).toBe(false);expect(e.message).toContain('Sign in');expect(e.message).not.toContain('credential=');expect(walkFetch).toHaveBeenCalledTimes(1);
});
it('uses actual JSON error strings and ignores unexpected error shapes',async()=>{
 setLocale('zh-Hant');vi.mocked(walkFetch).mockResolvedValueOnce(Response.json({error:'パスワードが正しくありません'},{status:403})).mockResolvedValueOnce(Response.json({error:{internal:'hidden'}},{status:429}));
 await expect(api('/auth/login','POST',{})).rejects.toMatchObject({status:403,message:'密碼不正確。',outcomeUnknown:false});
 await expect(api('/bootstrap')).rejects.toMatchObject({status:429,message:'操作過於頻繁，請稍候。'});
});
it('marks a lost write acknowledgement as uncertain and never retries it',async()=>{
 vi.mocked(walkFetch).mockRejectedValue(new TypeError('private native transport internals'));
 const e=await failure(api('/posts','POST',{title:'literal $& {count}'}));expect(e).toMatchObject({status:0,outcomeUnknown:true});expect(e.message).toContain('may have been saved');expect(e.message).not.toContain('internals');expect(walkFetch).toHaveBeenCalledTimes(1);
 const [path,options]=vi.mocked(walkFetch).mock.calls[0];expect(path).toBe('/api/posts');expect(options?.credentials).toBe('same-origin');expect(new Headers(options?.headers).get('X-Walk-Client')).toBe('1');expect(JSON.parse(String(options?.body))).toEqual({title:'literal $& {count}'});
});
it('handles invalid JSON and HTML even with successful status without leaking parser details',async()=>{
 vi.mocked(walkFetch).mockResolvedValueOnce(new Response('{broken',{headers:{'Content-Type':'application/json'}})).mockResolvedValueOnce(new Response('<html>upstream</html>',{headers:{'Content-Type':'text/html'}}));
 await expect(api('/bootstrap')).rejects.toMatchObject({status:200,outcomeUnknown:false,message:'Could not read the response. Check your connection and try again.'});
 await expect(api('/posts','POST',{})).rejects.toMatchObject({status:200,outcomeUnknown:true});
});
it('retains the server status for failed JSON body reads and warns on uncertain server-side writes',async()=>{
 vi.mocked(walkFetch).mockResolvedValue(new Response('{truncated',{status:503,headers:{'Content-Type':'application/json'}}));
 const e=await failure(api('/posts','POST',{}));expect(e.status).toBe(503);expect(e.outcomeUnknown).toBe(true);expect(e.message).toContain('may have been saved');expect(e.message).not.toContain('JSON');
});
it('accepts JSON media type variants, empty responses and multipart without changing their payloads',async()=>{
 const form=new FormData();form.append('file',new Blob(['photo']),'photo.png');
 vi.mocked(walkFetch).mockResolvedValueOnce(new Response('{"id":"one"}',{headers:{'Content-Type':'application/problem+json; charset=utf-8'}})).mockResolvedValueOnce(new Response(null,{status:204}));
 expect(await apiRequest('/uploads',{method:'POST',body:form},120000)).toEqual({id:'one'});const options=vi.mocked(walkFetch).mock.calls[0][1];expect(options?.body).toBe(form);expect(new Headers(options?.headers).has('Content-Type')).toBe(false);expect(await api('/posts/one','DELETE')).toBeUndefined();expect(vi.getTimerCount()).toBe(0);
});
it('bounds a hung native request even if the bridge does not implement cancellation',async()=>{
 vi.useFakeTimers();vi.mocked(walkFetch).mockImplementation(()=>new Promise(()=>{}));const pending=failure(apiRequest('/bootstrap',{},50));await vi.advanceTimersByTimeAsync(50);const error=await pending;expect(error).toMatchObject({status:0,outcomeUnknown:false});expect(error.message).toContain('taking too long');expect(vi.mocked(walkFetch).mock.calls[0][1]?.signal?.aborted).toBe(true);expect(vi.getTimerCount()).toBe(0);expect(walkFetch).toHaveBeenCalledTimes(1);
});
it('bounds a stalled response body and treats timed-out mutations as uncertain',async()=>{
 vi.useFakeTimers();const response=Response.json({});vi.spyOn(response,'json').mockImplementation(()=>new Promise(()=>{}));vi.mocked(walkFetch).mockResolvedValue(response);const pending=apiRequest('/posts',{method:'POST'},50).catch(e=>e);await vi.advanceTimersByTimeAsync(50);expect(await pending).toMatchObject({status:0,outcomeUnknown:true});expect(walkFetch).toHaveBeenCalledTimes(1);expect(vi.getTimerCount()).toBe(0);
});
it('preserves explicit cancellation without treating it as a lost session or leaving a deadline active',async()=>{
 vi.useFakeTimers();const controller=new AbortController();vi.mocked(walkFetch).mockImplementation(()=>new Promise(()=>{}));const pending=apiRequest('/bootstrap',{signal:controller.signal}).catch(e=>e);controller.abort();expect(await pending).toMatchObject({name:'AbortError'});expect(vi.getTimerCount()).toBe(0);
});
