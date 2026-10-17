import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {MockAgent} from 'undici';
import {createApp} from '../server/app';
import {loadDouyinIframe,parseDouyinPreview,resolveDouyinLink} from '../server/douyin';
import {douyinPlayerUrl} from '../shared/douyin';
import {canSynchronize,discoverableVideo} from '../shared/discovery';
import type {Bootstrap,Post} from '../shared/model';

const id='7123456789012345678',url='https://www.douyin.com/video/'+id;
const data=()=>({err_no:0,data:{video_title:'検証用：描く時間',video_width:720,video_height:1280,iframe_code:'<iframe width="720" height="1280" src="https://open.douyin.com/player/video?vid='+id+'&amp;autoplay=0" referrerpolicy="unsafe-url" allowfullscreen></iframe>'}});
let instance:Awaited<ReturnType<typeof createApp>>,cookie:string,load:(id:string)=>Promise<unknown>,calls:string[];
const req=(payload:object)=>instance.app.inject({url:'/api/douyin/preview',method:'POST',headers:{cookie,'x-walk-client':'1'},payload});
beforeEach(async()=>{calls=[];load=async()=>data();instance=await createApp({database:':memory:',adminKey:'douyin-unit-test-admin-only-key',douyinLoader:async id=>{calls.push(id);return load(id);}});const r=await instance.app.inject({url:'/api/bootstrap'});cookie=String(r.headers['set-cookie']).split(';')[0];});
afterEach(async()=>{vi.restoreAllMocks();await instance.app.close();});

it('requires authentication, rejects non-Douyin URLs and unrecognized fields before external requests',async()=>{
  expect((await instance.app.inject({url:'/api/douyin/preview',method:'POST',headers:{'x-walk-client':'1'},payload:{url}})).statusCode).toBe(401);
  for(const bad of ['https://v.kuaishou.com/Abcd123/','https://www.douyin.com.evil.test/video/'+id,'https://www.douyin.com/user/somebody','http://v.douyin.com/Abcd123/'])expect((await req({url:bad})).statusCode).toBe(400);
  expect((await req({url,iframe_code:'<script/>'})).statusCode).toBe(400);expect(calls).toEqual([]);
});
it('returns only bounded metadata and a constructed official player without changing posts, saves or privacy',async()=>{
  const before=(await instance.app.inject({url:'/api/bootstrap',headers:{cookie}})).json() as Bootstrap;
  const r=await req({url});expect(r.statusCode).toBe(200);expect(r.json()).toMatchObject({videoId:id,title:'検証用：描く時間',width:720,height:1280,playerUrl:douyinPlayerUrl(id),source:'douyin-iframe-api'});expect(r.json()).not.toHaveProperty('iframe_code');expect(r.body).not.toContain('unsafe-url');
  const after=(await instance.app.inject({url:'/api/bootstrap',headers:{cookie}})).json() as Bootstrap;expect(after.posts).toEqual(before.posts);expect(after.favorites).toEqual(before.favorites);expect(after.user.shareActivity).toBe(false);
});
it('coalesces simultaneous lookups and refreshes successful metadata after ten minutes',async()=>{
  const results=await Promise.all([req({url}),req({url}),req({url})]);expect(results.every(r=>r.statusCode===200)).toBe(true);expect(calls).toHaveLength(1);
  vi.spyOn(Date,'now').mockReturnValue(results[0].json().checkedAt+600001);expect((await req({url})).statusCode).toBe(200);expect(calls).toHaveLength(2);
});
it('does not turn an HTTP-success provider error into a playable video and does not cache failures',async()=>{
  load=async()=>({err_no:28003004,err_msg:'非公开视频',data:{}});expect((await req({url})).statusCode).toBe(422);
  load=async()=>{throw new Error('proxy password must stay private');};const r=await req({url});expect(r.statusCode).toBe(502);expect(r.body).not.toContain('password');
  load=async()=>data();expect((await req({url})).statusCode).toBe(200);expect(calls).toHaveLength(3);
});
it('rejects executable markup, mismatched IDs and foreign player origins rather than injecting upstream HTML',()=>{
  for(const iframe_code of ['<script>alert(1)</script>',data().data.iframe_code.replace(id,'7222222222222222222'),data().data.iframe_code.replace('open.douyin.com','evil.test'),'<iframe src="https://open.douyin.com/player/video?vid='+id+'"></iframe><img src=x onerror=alert(1)>'])expect(()=>parseDouyinPreview({err_no:0,data:{...data().data,iframe_code}},id)).toThrow();
  expect(douyinPlayerUrl('javascript:alert(1)')).toBe('');
});
it('uses the fixed official JSON endpoint, refuses redirects and bounds the body size',async()=>{
  const agent=new MockAgent();agent.disableNetConnect();const pool=agent.get('https://open.douyin.com'),path='/api/douyin/v1/video/get_iframe_by_video?video_id='+id,signal=new AbortController().signal;
  try{
    pool.intercept({path,method:'GET'}).reply(200,data(),{headers:{'content-type':'application/json'}});expect(await loadDouyinIframe(id,signal,agent)).toMatchObject({err_no:0});
    pool.intercept({path}).reply(302,'',{headers:{location:'https://evil.test/'}});await expect(loadDouyinIframe(id,signal,agent)).rejects.toThrow();
    pool.intercept({path}).reply(200,'a'.repeat(65537),{headers:{'content-type':'application/json'}});await expect(loadDouyinIframe(id,signal,agent)).rejects.toThrow();
  }finally{await agent.close();}
});
it('resolves a known short host into a validated ID without fetching the final page',async()=>{
  const agent=new MockAgent();agent.disableNetConnect();const signal=new AbortController().signal;
  try{agent.get('https://v.douyin.com').intercept({path:'/Test123/'}).reply(302,'',{headers:{location:'https://www.iesdouyin.com/share/video/'+id+'/?tracking=one'}});expect(await resolveDouyinLink('https://v.douyin.com/Test123/',signal,agent)).toBe(id);expect(await resolveDouyinLink(url,signal,agent)).toBe(id);agent.assertNoPendingInterceptors();}finally{await agent.close();}
});
it('does not follow foreign, credentialed, HTTP, looped or non-video short-link destinations',async()=>{
  const agent=new MockAgent();agent.disableNetConnect();const signal=new AbortController().signal;
  try{for(const location of ['https://127.0.0.1/private','https://evil.test/video/'+id,'http://www.douyin.com/video/'+id,'https://user:secret@www.douyin.com/video/'+id,'https://v.douyin.com/Test123/','https://www.douyin.com/user/somebody']){agent.get('https://v.douyin.com').intercept({path:'/Test123/'}).reply(302,'',{headers:{location}});await expect(resolveDouyinLink('https://v.douyin.com/Test123/',signal,agent)).rejects.toThrow();}}finally{await agent.close();}
});
it('offers normal Douyin posts as official-player candidates without permitting synchronized playback',()=>{
  const post={type:'external',provider:'抖音',externalUrl:url,isSample:false} as Post;expect(discoverableVideo(post)).toBe(true);expect(canSynchronize(post)).toBe(false);
  expect(discoverableVideo({...post,externalUrl:'https://v.douyin.com/Test123/'})).toBe(false);expect(discoverableVideo({...post,provider:'快手'})).toBe(false);expect(discoverableVideo({...post,isSample:true})).toBe(false);
});
