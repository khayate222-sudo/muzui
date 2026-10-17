import {afterEach,beforeEach,it,expect,vi} from 'vitest';
import {MockAgent} from 'undici';
import {createApp} from '../server/app';
import {parseYouTubePreview,loadYouTubeOEmbed} from '../server/youtube';
import {youtubeThumbnail} from '../shared/youtube';
import type {Bootstrap} from '../shared/model';

const id='M7lc1UVf-VE',channel='UC'+'a'.repeat(22),key='youtube-import-testing-key';
const metadata=()=>({type:'video',provider_name:'YouTube',title:'検証用：描く時間',author_name:'検証用の作者',author_url:'https://www.youtube.com/channel/'+channel,thumbnail_url:'https://untrusted.example/image.jpg',html:'<script>never use this</script>'});
let instance:Awaited<ReturnType<typeof createApp>>,cookie:string,calls:string[],load:(id:string)=>Promise<unknown>;
const req=(path:string,method:'GET'|'POST'='GET',payload?:object)=>instance.app.inject({url:'/api'+path,method,headers:{cookie,'x-walk-client':'1'},payload});
const preview=(url='https://youtu.be/'+id)=>req('/youtube/preview','POST',{url});
beforeEach(async()=>{calls=[];load=async()=>metadata();instance=await createApp({database:':memory:',adminKey:key,youtubeLoader:async id=>{calls.push(id);return load(id);},collectionFeed:async channel=>`<feed xmlns:yt="http://www.youtube.com/xml/schemas/2015"><yt:channelId>${channel}</yt:channelId><entry><yt:videoId>${id}</yt:videoId><title>検証用の新着</title><author><name>検証用の作者</name></author><published>2026-10-01T10:00:00Z</published></entry></feed>`});const boot=await instance.app.inject({url:'/api/bootstrap'});cookie=String(boot.headers['set-cookie']).split(';')[0];});
afterEach(async()=>{vi.restoreAllMocks();await instance.app.close();});

it('requires authentication and a real YouTube URL without following arbitrary hosts or accepting injected preview fields',async()=>{
  expect((await instance.app.inject({url:'/api/youtube/preview',method:'POST',headers:{'x-walk-client':'1'},payload:{url:'https://youtu.be/'+id}})).statusCode).toBe(401);
  for(const url of ['https://127.0.0.1/video','https://youtube.com.evil.example/watch?v='+id,'https://user:secret@youtube.com/watch?v='+id,'https://www.youtube.com/playlist?list=abc','http://youtu.be/'+id])expect((await preview(url)).statusCode).toBe(400);
  expect((await req('/youtube/preview','POST',{url:'https://youtu.be/'+id,title:'偽装'})).statusCode).toBe(400);expect(calls).toEqual([]);
});

it('previews canonical metadata and a fixed official image URL, without publishing, saving or changing privacy',async()=>{
  const before=(await req('/bootstrap')).json() as Bootstrap,result=await preview('https://www.youtube.com/shorts/'+id+'?tracking=1');expect(result.statusCode).toBe(200);
  expect(result.json()).toMatchObject({videoId:id,url:'https://www.youtube.com/watch?v='+id,title:'検証用：描く時間',authorName:'検証用の作者',channelId:channel,thumbnailUrl:youtubeThumbnail(id),source:'youtube-oembed'});expect(result.json()).not.toHaveProperty('html');expect(calls).toEqual([id]);
  const after=(await req('/bootstrap')).json() as Bootstrap;expect(after.posts).toEqual(before.posts);expect(after.favorites).toEqual([]);expect(after.user.shareActivity).toBe(false);expect(after.friendships).toEqual([]);expect((await req('/rooms')).json()).toEqual([]);
});

it('coalesces simultaneous lookups and refreshes metadata after ten minutes',async()=>{
  const results=await Promise.all([preview(),preview(),preview()]);expect(results.every(r=>r.statusCode===200)).toBe(true);expect(calls).toHaveLength(1);
  const time=results[0].json().fetchedAt;vi.spyOn(Date,'now').mockReturnValue(time+600001);expect((await preview()).statusCode).toBe(200);expect(calls).toHaveLength(2);
});

it('reports unavailable or invalid responses without caching errors, and permits a later retry',async()=>{
  for(const value of [{...metadata(),provider_name:'Someone else'},{...metadata(),author_url:'https://evil.example/author'},{...metadata(),title:''}]){load=async()=>value;expect((await preview()).statusCode).toBe(502);}
  load=async()=>{throw new Error('internal proxy credentials must not appear');};const failed=await preview();expect(failed.statusCode).toBe(502);expect(failed.body).not.toContain('credentials');
  load=async()=>metadata();expect((await preview()).statusCode).toBe(200);expect(calls).toHaveLength(5);
});

it('supports international channel handles, bounds display fields, and refuses executable author URLs',()=>{
  const p=parseYouTubePreview({...metadata(),author_url:'https://www.youtube.com/@%E7%B5%B5%E6%8F%8F%E3%81%8D?tracking=1',title:'長'.repeat(150),author_name:'名'.repeat(80)},id);expect(p.title).toHaveLength(120);expect(p.authorName).toHaveLength(60);expect(p.channelId).toBeNull();expect(p.authorUrl).not.toContain('?');
  expect(()=>parseYouTubePreview({...metadata(),author_url:'javascript:alert(1)'},id)).toThrow();expect(youtubeThumbnail('../bad')).toBe('');
});

it('uses only the official HTTPS oEmbed endpoint and refuses redirects and oversized responses',async()=>{
  const agent=new MockAgent();agent.disableNetConnect();const pool=agent.get('https://www.youtube.com'),path=(p:string)=>p.startsWith('/oembed?')&&new URL('https://www.youtube.com'+p).searchParams.get('url')==='https://www.youtube.com/watch?v='+id;
  try{
    pool.intercept({path,method:'GET'}).reply(200,metadata(),{headers:{'content-type':'application/json'}});expect(await loadYouTubeOEmbed(id,new AbortController().signal,agent)).toMatchObject({title:'検証用：描く時間'});
    pool.intercept({path,method:'GET'}).reply(302,'',{headers:{location:'http://127.0.0.1/private'}});await expect(loadYouTubeOEmbed(id,new AbortController().signal,agent)).rejects.toThrow();
    pool.intercept({path,method:'GET'}).reply(200,'x'.repeat(66000),{headers:{'content-type':'application/json'}});await expect(loadYouTubeOEmbed(id,new AbortController().signal,agent)).rejects.toThrow();agent.assertNoPendingInterceptors();
  }finally{await agent.close();}
});

it('places imports in valid nested worlds and preserves the original destination and attribution on duplicates',async()=>{
  const input={url:'https://youtu.be/'+id,title:'登録した一本',authorName:'元の作者',genre:'game',body:'',worldId:'world:game-rpg'};
  expect((await req('/imports','POST',{...input,worldId:'world:art'})).statusCode).toBe(400);
  const first=await req('/imports','POST',input);expect(first.statusCode).toBe(200);const next=await req('/imports','POST',{...input,title:'上書きしない',authorName:'別人',worldId:'world:game'});expect(next.json()).toMatchObject({id:first.json().id,existing:true,worldId:'world:game-rpg'});
  const boot=(await req('/bootstrap')).json() as Bootstrap;expect(boot.posts.find(p=>p.id===first.json().id)).toMatchObject({title:input.title,authorName:input.authorName,worldId:'world:game-rpg'});expect(boot.favorites).toEqual([first.json().id]);
});

it('keeps collected videos pending on invalid destinations and publishes into the selected nested world once',async()=>{
  await req('/admin/login','POST',{key});const source=(await req('/admin/collections','POST',{channel,label:'検証用の収集元',genre:'game',autoPublish:false})).json();
  expect((await req('/admin/collections/'+source.id+'/sync','POST',{})).json()).toEqual({added:1,published:0});const item=(await req('/admin/collections')).json().items[0];
  expect((await req('/admin/collection-items/'+item.id,'POST',{action:'publish',worldId:'world:art'})).statusCode).toBe(400);
  expect((await req('/admin/collections')).json().items[0].state).toBe('pending');expect((await req('/admin/collection-items/'+item.id,'POST',{action:'publish',worldId:'world:game-rpg'})).statusCode).toBe(200);
  const boot=(await req('/bootstrap')).json() as Bootstrap;expect(boot.posts.find(p=>p.externalUrl==='https://www.youtube.com/watch?v='+id&&!p.isSample)?.worldId).toBe('world:game-rpg');
  expect((await req('/admin/collections/'+source.id+'/sync','POST',{})).json()).toEqual({added:0,published:0});
});
