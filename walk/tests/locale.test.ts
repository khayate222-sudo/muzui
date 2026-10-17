import {afterEach,expect,it} from 'vitest';
import {preferredLocale,matchLocale} from '../shared/locale';
import {setLocale,t,tr} from '../src/i18n';
import {messages} from '../src/locales/messages';
import {findPlace,setWorldCatalog} from '../src/worlds';
import {places} from '../shared/worlds';
import {createApp} from '../server/app';

afterEach(()=>{setLocale('ja');setWorldCatalog(undefined);});
it('honors explicit language preference and script tags without inferring a country or rewriting unsupported preferences',()=>{
  expect(preferredLocale('zh-Hant',['en-US'])).toBe('zh-Hant');expect(preferredLocale('broken',['fr-FR','zh-TW'])).toBe('zh-Hant');expect(preferredLocale(null,['zh-Hant-HK'])).toBe('zh-Hant');expect(matchLocale('zh_Hans_SG')).toBe('zh-Hans');expect(preferredLocale(null,['fr-FR'])).toBe('en');expect(preferredLocale(null,['ja-JP'])).toBe('ja');
});
it('keeps translated dynamic values intact, including dollar signs and template-like user text',()=>{
 for(const [source,translated]of Object.entries(messages))for(const value of Object.values(translated)){
  expect(value.trim().length,source).toBeGreaterThan(0);
  expect([...value.matchAll(/\{(\w+)\}/g)].map(m=>m[1]).sort(),source).toEqual([...source.matchAll(/\{(\w+)\}/g)].map(m=>m[1]).sort());
 }
 setLocale('en');expect(tr('この先に{count}つの入口',{count:3})).toBe('3 entrances ahead');
 expect(tr('hello {name}',{name:'$& {count} 不思議な駅'})).toBe('hello $& {count} 不思議な駅');
});
it('localizes builtin world names live while leaving resident and edited world content byte-for-byte unchanged',()=>{
  const built=places[0],user={...places[1],id:'user:one',title:'不思議な駅',ownerId:'resident'},edited={...places[2],title:'私が変更した案内'};setWorldCatalog([built,user,edited]);
  setLocale('en');expect(findPlace('public')?.title).toBe('The Between Station');expect(findPlace('user:one')?.title).toBe('不思議な駅');expect(findPlace(edited.id)?.title).toBe(edited.title);
  setLocale('zh-Hant');expect(findPlace('public')?.title).toBe('奇妙車站');expect(findPlace('user:one')?.title).toBe(user.title);expect(built.title).toBe('不思議な駅');expect(t('user content not in the catalog')).toBe('user content not in the catalog');
});
it('uses the chosen language only when creating a private room and never renames an existing room on a later retry',async()=>{
  const instance=await createApp({database:':memory:',adminKey:'international-room-locale-test-key'});
  try{const boot=await instance.app.inject({url:'/api/bootstrap'}),cookie=String(boot.headers['set-cookie']).split(';')[0],request=(locale:string)=>instance.app.inject({url:'/api/solo/room',method:'POST',headers:{cookie,'x-walk-client':'1'},payload:{postId:'walk-short-sketch-mug',locale}});
    const first=await request('zh-Hant');expect(first.statusCode).toBe(200);expect(first.json()).toMatchObject({title:'我的窗邊',isPublic:false});const next=await request('en');expect(next.json()).toEqual(first.json());expect((await request('unsupported')).statusCode).toBe(400);
  }finally{await instance.app.close();}
});
it('accepts international deletion confirmation only with an authenticated password and preserves unrelated users',async()=>{
 const instance=await createApp({database:':memory:',adminKey:'international-delete-test-key'});
 const cookie=(response:{headers:Record<string,unknown>})=>String(response.headers['set-cookie']).split(';')[0];
 const request=(session:string,path:string,payload?:object)=>instance.app.inject({url:'/api'+path,method:payload?'POST':'GET',headers:{cookie:session,'x-walk-client':'1'},payload});
 try{
  const one=await request('','/bootstrap'),two=await request('','/bootstrap'),registered=await request(cookie(one),'/account/register',{handle:'delete_in_english',password:'international strong passphrase',accepted:true,policyVersion:'development-2026-10'});
  expect(registered.statusCode).toBe(200);const session=cookie(registered);
  expect((await request(session,'/account/delete',{confirm:'delete',password:'international strong passphrase'})).statusCode).toBe(400);
  expect((await request(session,'/account/delete',{confirm:'DELETE',password:'wrong password'})).statusCode).toBe(403);
  expect((await request(session,'/account/delete',{confirm:'DELETE',password:'international strong passphrase'})).statusCode).toBe(200);
  expect((await request(cookie(two),'/bootstrap')).json().user.id).toBe(two.json().user.id);
  expect(instance.store.sqlite.prepare('SELECT id FROM users WHERE id=?').get(one.json().user.id)).toBeUndefined();
 }finally{await instance.app.close();}
});
