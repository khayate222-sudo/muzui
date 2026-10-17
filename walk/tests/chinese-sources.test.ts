import {afterAll,beforeAll,expect,it} from 'vitest';
import {createApp} from '../server/app';
import {sharedPostUrl,sourceInfo} from '../shared/community';
import {canSynchronize,discoverableVideo} from '../shared/discovery';
import type {Bootstrap} from '../shared/model';

const douyin='https://www.douyin.com/video/7123456789012345678';
const kuaishou='https://www.kuaishou.com/short-video/3xabcdefghijklm';
it('recognizes Douyin and Kuaishou video links and canonicalizes official variants',()=>{
  expect(sourceInfo(douyin+'?share_from=copy#tracking')).toEqual({provider:'抖音',url:douyin,videoId:'7123456789012345678'});
  expect(sourceInfo('https://www.iesdouyin.com/share/video/7123456789012345678/')).toEqual(sourceInfo(douyin));
  expect(sourceInfo('https://www.douyin.com/?modal_id=7123456789012345678')).toEqual(sourceInfo(douyin));
  expect(sourceInfo(kuaishou+'/?shareToken=tracking')).toEqual({provider:'快手',url:kuaishou,videoId:'3xabcdefghijklm'});
});
it('extracts one copied sharing URL, preserves short codes and does not claim its destination is verified',()=>{
  expect(sourceInfo('3.21 复制打开抖音，看看这条视频 https://v.douyin.com/AbC_123-/ 复制此链接')).toEqual({provider:'抖音',url:'https://v.douyin.com/AbC_123-/',shortLink:true});
  expect(sourceInfo('https://v.kuaishou.com/KsAb123?share=copy')).toEqual({provider:'快手',url:'https://v.kuaishou.com/KsAb123/',shortLink:true});
  expect(sourceInfo('素敵な動画（'+douyin+'）。')).toEqual(sourceInfo(douyin));
  expect(sharedPostUrl('共有文 '+douyin+'。')).toBe(douyin);
  expect(sourceInfo('https://v.douyin.com/AbCd12/')?.videoId).toBeUndefined();
});
it('rejects fake hosts, credentials, nonstandard ports, profiles, livestreams, extra paths and ambiguous shares',()=>{
  for(const value of [
    'https://www.douyin.com.evil.test/video/7123456789012345678',
    'https://www.douyin.com@127.0.0.1/video/7123456789012345678',
    'https://name:secret@v.kuaishou.com/AbCd12/',
    'http://v.douyin.com/AbCd12/',
    'https://www.douyin.com:8443/video/7123456789012345678',
    'https://live.douyin.com/123456',
    'https://www.douyin.com/user/someone',
    'https://www.kuaishou.com/profile/someone',
    'https://v.kuaishou.com/AbCd12/extra',
    'https://v.douyin.com/%2e%2e/',
    'https://www.kuaishou.com/short-video/abc<script>',
    douyin+' '+kuaishou,
    'https://example.test/?next='+douyin,
    'https://v.douyin.com/'+'a'.repeat(81),
    'a'.repeat(2049)+douyin,
  ])expect(sourceInfo(value),value).toBeNull();
});

let instance:Awaited<ReturnType<typeof createApp>>,a:string,b:string,lookups=0;
const req=(cookie:string,path:string,payload?:object)=>instance.app.inject({url:'/api'+path,method:payload?'POST':'GET',headers:{cookie,'x-walk-client':'1'},payload});
beforeAll(async()=>{instance=await createApp({database:':memory:',adminKey:'chinese-sources-test-only-admin-key',youtubeLoader:async()=>{lookups++;throw new Error('unexpected external lookup');},collectionFeed:async()=>{throw new Error('unexpected collection');}});const one=await instance.app.inject({url:'/api/bootstrap'}),two=await instance.app.inject({url:'/api/bootstrap'});a=String(one.headers['set-cookie']).split(';')[0];b=String(two.headers['set-cookie']).split(';')[0];});
afterAll(async()=>{await instance.app.close();});
it('publishes a source link to a nested world and preserves destination, attribution and ownership on duplicate shares',async()=>{
  const payload={url:'分享 '+douyin+'?share=one',title:'検証用：中国の短い動画',authorName:'検証用の元投稿者',genre:'game',worldId:'world:game-rpg'};
  expect((await instance.app.inject({url:'/api/imports',method:'POST',headers:{'x-walk-client':'1'},payload})).statusCode).toBe(401);
  const r=await req(a,'/imports',payload);expect(r.statusCode).toBe(200);const id=r.json().id;
  const post=((await req(a,'/bootstrap')).json() as Bootstrap).posts.find(p=>p.id===id)!;
  expect(post).toMatchObject({type:'external',origin:'external',provider:'抖音',externalUrl:douyin,worldId:'world:game-rpg',authorName:payload.authorName});
  expect(discoverableVideo(post)).toBe(true);expect(canSynchronize(post)).toBe(false);
  const again=await req(b,'/imports',{...payload,url:'https://www.iesdouyin.com/share/video/7123456789012345678/',title:'上書きしない',authorName:'別の人',worldId:null});expect(again.json()).toMatchObject({id,existing:true,worldId:'world:game-rpg'});
  const boot=(await req(b,'/bootstrap')).json() as Bootstrap;expect(boot.favorites).toContain(id);expect(boot.posts.find(p=>p.id===id)).toMatchObject({title:payload.title,worldId:payload.worldId,authorName:payload.authorName});
  expect((await instance.app.inject({url:'/api/imports/'+id,method:'DELETE',headers:{cookie:b,'x-walk-client':'1'}})).statusCode).toBe(403);
  expect(lookups).toBe(0);
});
it('saves Kuaishou short links as external references, deduplicates the same code and rejects bad worlds without side effects',async()=>{
  const payload={url:'快手分享 https://v.kuaishou.com/Case123/ 看看',title:'検証用：日常の動画リンク',authorName:'検証用の作者',genre:'art'};
  const r=await req(a,'/imports',payload);expect(r.statusCode).toBe(200);const id=r.json().id;
  expect((await req(b,'/imports',{...payload,url:'https://v.kuaishou.com/Case123?tracking=two'})).json()).toMatchObject({id,existing:true});
  const before=(await req(a,'/bootstrap')).json() as Bootstrap;
  const bad=await req(a,'/imports',{...payload,url:kuaishou,worldId:'world:game-rpg'});expect(bad.statusCode).toBe(400);
  expect((await req(a,'/imports',{...payload,url:'https://evil.test/video'})).statusCode).toBe(400);
  const after=(await req(a,'/bootstrap')).json() as Bootstrap;expect(after.posts).toHaveLength(before.posts.length);expect(after.user.shareActivity).toBe(false);expect(after.favorites).toEqual(before.favorites);
  expect(after.posts.find(p=>p.id===id)).toMatchObject({provider:'快手',type:'external',externalUrl:'https://v.kuaishou.com/Case123/'});expect(lookups).toBe(0);
});
