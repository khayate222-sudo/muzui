import {beforeEach,afterEach,it,expect} from 'vitest';
import {randomUUID} from 'node:crypto';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createApp} from '../server/app';
import {buildingPiecesSchema,type BuildingPiece} from '../shared/building';
let instance:Awaited<ReturnType<typeof createApp>>,a:string,b:string,room:string,directory:string;
const piece:BuildingPiece={x:2,y:2,z:0,kind:'wall',color:'cream',rotation:0};
const input={title:'Build workshop',description:'Keep these decorations',theme:'garden',isPublic:false,items:[],decorations:[{kind:'tree',x:700,y:800}]};
const req=(cookie:string,path:string,method:'GET'|'POST'|'PUT'|'DELETE'='GET',payload?:object)=>instance.app.inject({url:'/api'+path,method,headers:{cookie,'x-walk-client':'1'},payload});
const save=(pieces:BuildingPiece[],revision=0,requestId=randomUUID(),cookie=a,id=room)=>req(cookie,'/rooms/'+id+'/build','PUT',{pieces,revision,requestId});
beforeEach(async()=>{directory=await mkdtemp(join(tmpdir(),'walk-build-'));instance=await createApp({database:join(directory,'walk.sqlite'),adminKey:'building-test-only-admin-key'});a=(await req('','/bootstrap')).headers['set-cookie']!.toString().split(';')[0];b=(await req('','/bootstrap')).headers['set-cookie']!.toString().split(';')[0];room=(await req(a,'/rooms','POST',input)).json().id;});
afterEach(async()=>{await instance.app.close();await rm(directory,{recursive:true,force:true});});
it('saves separate geometry without replacing old decorations or publication settings, and survives restart',async()=>{
 expect((await save([piece])).json()).toMatchObject({revision:1,pieces:[piece]});
 let r=(await req(a,'/rooms/'+room)).json();expect(r.decorations).toEqual(input.decorations);expect(r.isPublic).toBe(false);
 expect((await req(a,'/rooms/'+room,'PUT',{...input,title:'Renamed',revision:r.revision})).statusCode).toBe(200);
 await instance.app.close();instance=await createApp({database:join(directory,'walk.sqlite'),adminKey:'building-test-only-admin-key'});
 r=(await req(a,'/rooms/'+room)).json();expect(r.title).toBe('Renamed');expect(r.build.pieces).toEqual([piece]);expect(instance.store.sqlite.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
});
it('allows public visits but never grants editing, history or restore permission to visitors or station worlds',async()=>{
 expect((await req(b,'/rooms/'+room)).statusCode).toBe(404);await req(a,'/rooms/'+room,'PUT',{...input,isPublic:true,revision:1});await save([piece]);
 expect((await req(b,'/rooms/'+room)).json().build.pieces).toEqual([piece]);expect((await save([piece],1,randomUUID(),b)).statusCode).toBe(403);
 expect((await req(b,'/rooms/'+room+'/build/history')).statusCode).toBe(403);expect((await save([piece],0,randomUUID(),a,'public')).statusCode).toBe(403);
 const snapshot=(await req(a,'/rooms/'+room+'/build/history')).json()[0];expect((await req(b,'/rooms/'+room+'/build/restore','POST',{revision:1,requestId:randomUUID(),snapshotId:snapshot.id})).statusCode).toBe(403);
});
it('rejects protected paths, overlapping cells, raised floors, unknown parts, URLs and oversized builds',async()=>{
 for(const pieces of [[{...piece,x:5,y:8}],[piece,piece],[{...piece,kind:'floor',z:1}],[{...piece,kind:'script'}],[{...piece,url:'https://outside.test'}],Array(181).fill(piece)]){
  expect(buildingPiecesSchema.safeParse(pieces).success).toBe(false);expect((await req(a,'/rooms/'+room+'/build','PUT',{pieces,revision:0,requestId:randomUUID()})).statusCode).toBe(400);
 }
 expect((await req(a,'/rooms/'+room)).json().build.revision).toBe(0);
});
it('deduplicates uncertain retries, refuses request-id collisions and rejects stale editors without replacing the winner',async()=>{
 const id=randomUUID();expect((await save([piece],0,id)).json().revision).toBe(1);expect((await save([piece],0,id)).json().revision).toBe(1);
 expect((await save([{...piece,color:'clay'}],0,id)).statusCode).toBe(409);
 const results=await Promise.all([save([{...piece,color:'wood'}],1),save([{...piece,color:'slate'}],1)]);expect(results.map(r=>r.statusCode).sort()).toEqual([200,409]);
 const current=(await req(a,'/rooms/'+room)).json().build;expect(current.revision).toBe(2);expect((await req(a,'/rooms/'+room+'/build/history')).json()).toHaveLength(2);
 expect((await save(current.pieces,2)).json().revision).toBe(2);expect((await req(a,'/rooms/'+room+'/build/history')).json()).toHaveLength(2);
});
it('keeps eight recoverable versions and idempotently restores even when the target snapshot is pruned',async()=>{
 for(let n=0;n<10;n++)expect((await save([{...piece,color: (['cream','wood','slate'] as const)[n%3]}],n)).statusCode).toBe(200);
 const history=(await req(a,'/rooms/'+room+'/build/history')).json();expect(history).toHaveLength(8);const oldest=history.at(-1),requestId=randomUUID();
 const restore={revision:10,requestId,snapshotId:oldest.id};const first=await req(a,'/rooms/'+room+'/build/restore','POST',restore);expect(first.statusCode).toBe(200);expect(first.json().revision).toBe(11);
 expect((await req(a,'/rooms/'+room+'/build/restore','POST',restore)).json()).toEqual(first.json());expect((await req(a,'/rooms/'+room+'/build/history')).json()).toHaveLength(8);
});
it('exports only owned builds and cascades current geometry and history on room or account deletion',async()=>{
 await save([piece]);const other=(await req(b,'/rooms','POST',input)).json().id;await save([piece],0,randomUUID(),b,other);
 const exported=(await req(a,'/account/export','POST',{})).json();expect(exported.builds).toHaveLength(1);expect(exported.builds[0].room_id).toBe(room);expect(exported.buildingHistory).toHaveLength(1);
 await req(a,'/account/delete','POST',{confirm:'DELETE'});expect(instance.store.sqlite.prepare('SELECT room_id FROM room_builds').all()).toEqual([{room_id:other}]);
 await req(b,'/rooms/'+other,'DELETE');expect(instance.store.sqlite.prepare('SELECT * FROM room_build_history').all()).toEqual([]);expect(instance.store.sqlite.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
});

it('checks server-side material ownership and preserves free parts after unlocking a coin material',async()=>{
 const special={...piece,color:'sakura' as const};expect((await save([special])).statusCode).toBe(403);expect((await req(a,'/rooms/'+room)).json().build.revision).toBe(0);
 await req(a,'/economy/coins/claim','POST',{});expect((await req(a,'/economy/shop','POST',{itemId:'sakura'})).statusCode).toBe(200);expect((await save([special])).statusCode).toBe(200);
 expect((await save([special,{...piece,x:3}],1)).statusCode).toBe(200);expect((await req(a,'/economy')).json().coins).toBe(50);expect((await save([{...special,color:'midnight'}],2)).statusCode).toBe(403);expect((await req(a,'/rooms/'+room)).json().build.pieces).toHaveLength(2);
});

it('unlocks new furniture once and permits repeated placement without per-piece costs or other owners rights',async()=>{
 const lantern={...piece,kind:'lantern' as const};expect((await save([lantern])).statusCode).toBe(403);await req(a,'/economy/coins/claim','POST',{});
 expect((await req(a,'/economy/shop','POST',{itemId:'lantern',cost:0})).statusCode).toBe(400);await req(a,'/economy/shop','POST',{itemId:'lantern'});await req(a,'/economy/shop','POST',{itemId:'lantern'});expect((await req(a,'/economy')).json().coins).toBe(100);
 expect((await save([lantern,{...lantern,x:3}])).statusCode).toBe(200);expect((await req(a,'/economy')).json()).toMatchObject({coins:100,owned:['lantern']});const other=(await req(b,'/rooms','POST',input)).json().id;expect((await save([lantern],0,randomUUID(),b,other)).statusCode).toBe(403);
});
