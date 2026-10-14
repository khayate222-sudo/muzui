import {beforeAll,afterAll,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {createApp} from '../server/app';
import {parseFeed,channelId} from '../server/collector';
import {identifyMedia} from '../server/publishing';
let instance:Awaited<ReturnType<typeof createApp>>,a:string,b:string;
let failure=false;const channel='UC'+'a'.repeat(22),other='UC'+'b'.repeat(22);
const xml=(id:string)=>`<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom" xmlns:yt="http://www.youtube.com/xml/schemas/2015"><yt:channelId>${id}</yt:channelId><entry><yt:videoId>${id===channel?'jNQXAC9IVRw':'aqz-KE-bpKQ'}</yt:videoId><title>ゲーム &amp; アニメ新着</title><author><name>公式チャンネル</name></author><published>2026-10-01T10:00:00Z</published></entry></feed>`;
function req(cookie:string,path:string,method:'GET'|'POST'|'PATCH'|'DELETE'='GET',payload?:object){return instance.app.inject({url:'/api'+path,method,headers:{cookie,'x-walk-client':'1'},payload});}
async function upload(cookie:string,file:Buffer,name='example.png'){
  const boundary='walk-upload-test';return instance.app.inject({url:'/api/uploads',method:'POST',headers:{cookie,'x-walk-client':'1','content-type':'multipart/form-data; boundary='+boundary},payload:Buffer.concat([Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${name}"\r\nContent-Type: image/png\r\n\r\n`),file,Buffer.from(`\r\n--${boundary}--\r\n`)])});
}
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aN1cAAAAASUVORK5CYII=','base64');
beforeAll(async()=>{instance=await createApp({database:':memory:',adminKey:'publishing-test-key-123456789',collectionFeed:async id=>{if(failure)throw new Error('テスト用の接続失敗');return xml(id);}});for(const assign of[(s:string)=>a=s,(s:string)=>b=s]){const r=await instance.app.inject({url:'/api/bootstrap'});assign(r.headers['set-cookie']!.toString().split(';')[0]);}await req(a,'/admin/login','POST',{key:'publishing-test-key-123456789'});});
afterAll(async()=>{await instance.app.close();});
it('publishes native text with server identity, origin and game/anime genre; others cannot delete it',async()=>{
  const user=(await req(a,'/bootstrap')).json().user;
  const created=await req(a,'/posts','POST',{title:'ゲームの感想',body:'自分のことば',genre:'game',authorName:'他の人',ownerId:'fake'});expect(created.statusCode).toBe(200);const id=created.json().id;
  const p=(await req(b,'/bootstrap')).json().posts.find((p:{id:string})=>p.id===id);expect(p).toMatchObject({type:'text',origin:'walk',ownerId:user.id,authorName:user.displayName,genre:'game'});
  expect((await req(b,'/posts/'+id,'DELETE')).statusCode).toBe(403);expect((await req(a,'/posts/'+id,'DELETE')).statusCode).toBe(200);
  expect((await req(a,'/posts','POST',{title:'',body:'',genre:'game'})).statusCode).toBe(400);
});
it('validates file signatures, protects unpublished attachments and ownership, supports public video ranges',async()=>{
  expect(identifyMedia(Buffer.from('<svg onload="alert(1)">'))).toBeNull();expect(identifyMedia(png)?.mime).toBe('image/png');
  expect((await upload(a,Buffer.from('<script>alert(1)</script>'))).statusCode).toBe(400);
  const image=(await upload(a,png)).json();expect(image.url).toMatch(/^\/media\//);
  expect((await instance.app.inject({url:image.url})).statusCode).toBe(404);
  expect((await instance.app.inject({url:image.url,headers:{cookie:a}})).statusCode).toBe(200);
  expect((await req(b,'/posts','POST',{title:'盗用',body:'',genre:'anime',attachmentId:image.id})).statusCode).toBe(403);
  const post=(await req(a,'/posts','POST',{title:'自分の画像',body:'作品',genre:'anime',attachmentId:image.id})).json();
  expect((await instance.app.inject({url:image.url})).rawPayload).toEqual(png);
  expect((await req(a,'/uploads/'+image.id,'DELETE')).statusCode).toBe(409);
  await req(a,'/posts/'+post.id,'DELETE');
  const video=readFileSync(new URL('./fixtures/walk-original.webm',import.meta.url));const uploaded=(await upload(a,video,'original.webm')).json();expect(uploaded.mime).toBe('video/webm');
  const published=await req(a,'/posts','POST',{title:'自分の短い動画',body:'',genre:'game',attachmentId:uploaded.id});expect(published.statusCode).toBe(200);
  const response=await instance.app.inject({url:uploaded.url,headers:{range:'bytes=0-15'}});expect(response.statusCode).toBe(206);expect(response.headers['content-range']).toBe(`bytes 0-15/${video.length}`);expect(response.rawPayload).toEqual(video.subarray(0,16));
  expect((await instance.app.inject({url:uploaded.url,headers:{range:'bytes=999999-'}})).statusCode).toBe(416);
});
it('accepts only channel IDs and authenticates collectors, rejects XML entities and unrelated channel content',async()=>{
  expect(channelId('https://www.youtube.com/channel/'+channel)).toBe(channel);expect(channelId('https://evil.test/channel/'+channel)).toBeNull();expect(channelId('https://www.youtube.com/@somebody')).toBeNull();
  expect((await req(b,'/admin/collections')).statusCode).toBe(403);
  expect((await req(a,'/admin/collections','POST',{channel:'https://127.0.0.1/',label:'不正',genre:'game'})).statusCode).toBe(400);
  expect(()=>parseFeed('<!DOCTYPE x [<!ENTITY secret SYSTEM "file:///etc/passwd">]><feed/>',channel)).toThrow();
  expect(parseFeed(xml(channel),channel)[0].title).toBe('ゲーム & アニメ新着');
});
let sourceId:string,itemId:string;
it('collects candidate metadata, deduplicates repeat scans and publishes only after approval',async()=>{
  sourceId=(await req(a,'/admin/collections','POST',{channel,label:'ゲーム公式',genre:'game',autoPublish:false})).json().id;
  expect((await req(a,'/admin/collections/'+sourceId+'/sync','POST',{})).json()).toEqual({added:1,published:0});
  let state=(await req(a,'/admin/collections')).json();const item=state.items.find((i:{source_id:string})=>i.source_id===sourceId);itemId=item.id;expect(item.state).toBe('pending');
  expect((await req(a,'/admin/collections/'+sourceId+'/sync','POST',{})).json()).toEqual({added:0,published:0});
  await req(a,'/admin/collection-items/'+itemId,'POST',{action:'publish'});state=(await req(a,'/admin/collections')).json();const approved=state.items.find((i:{id:string})=>i.id===itemId);
  expect((await req(b,'/bootstrap')).json().posts.find((p:{id:string})=>p.id===approved.post_id)).toMatchObject({origin:'external',provider:'YouTube',genre:'game',isSample:false,authorName:'公式チャンネル'});
});
it('auto-publishes new videos from opted-in sources and does not resurrect deleted posts',async()=>{
  const source=(await req(a,'/admin/collections','POST',{channel:other,label:'アニメ公式',genre:'anime',autoPublish:true})).json().id;
  expect((await req(a,'/admin/collections/'+source+'/sync','POST',{})).json()).toEqual({added:1,published:1});
  const item=(await req(a,'/admin/collections')).json().items.find((i:{source_id:string})=>i.source_id===source);
  await req(a,'/admin/posts/'+item.post_id,'DELETE');expect((await req(a,'/admin/collections/'+source+'/sync','POST',{})).json()).toEqual({added:0,published:0});
});
it('records collection failures without claiming success; paused sources cannot be synchronized',async()=>{
  failure=true;const r=await req(a,'/admin/collections/'+sourceId+'/sync','POST',{});expect(r.statusCode).toBe(502);expect((await req(a,'/admin/collections')).json().sources.find((s:{id:string})=>s.id===sourceId).last_error).toContain('接続失敗');failure=false;
  expect(()=>parseFeed(xml(channel),other)).toThrow('一致しません');
  await req(a,'/admin/collections/'+sourceId,'PATCH',{enabled:false,autoPublish:false});expect((await req(a,'/admin/collections/'+sourceId+'/sync','POST',{})).statusCode).toBe(409);
});
