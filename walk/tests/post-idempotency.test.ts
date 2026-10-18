import {beforeEach,afterEach,it,expect} from 'vitest';
import {randomUUID} from 'node:crypto';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createApp} from '../server/app';

let instance:Awaited<ReturnType<typeof createApp>>,cookie:string,directory:string;
const payload=()=>({requestId:randomUUID(),title:'Retry once',body:'Private draft text',genre:'game'});
const request=(body:object,identity=cookie)=>instance.app.inject({url:'/api/posts',method:'POST',headers:{cookie:identity,'x-walk-client':'1'},payload:body});
beforeEach(async()=>{
  directory=await mkdtemp(join(tmpdir(),'walk-idempotency-'));
  instance=await createApp({database:join(directory,'walk.sqlite'),adminKey:'idempotency-test-admin-key'});
  cookie=(await instance.app.inject({url:'/api/bootstrap'})).headers['set-cookie']!.toString().split(';')[0];
});
afterEach(async()=>{await instance.app.close();await rm(directory,{recursive:true,force:true});});
it('commits one post for concurrent matching retries and retains the result after a server restart',async()=>{
  const body=payload(),responses=await Promise.all([request(body),request(body),request(body)]);
  for(const r of responses)expect(r.statusCode,r.body).toBe(200);
  expect(new Set(responses.map(r=>r.json().id)).size).toBe(1);
  const id=responses[0].json().id;
  await instance.app.close();instance=await createApp({database:join(directory,'walk.sqlite'),adminKey:'idempotency-test-admin-key'});
  expect((await request(body)).json()).toEqual({id});
  expect(instance.store.sqlite.prepare('SELECT COUNT(*) AS n FROM posts WHERE title=?').get(body.title)).toEqual({n:1});
  expect(instance.store.sqlite.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
});
it('rejects changed content, scopes keys to their owner and accepts older clients without a key',async()=>{
  const body=payload(),a=await request(body);
  expect((await request({...body,title:'Different content'})).statusCode).toBe(409);
  const other=(await instance.app.inject({url:'/api/bootstrap'})).headers['set-cookie']!.toString().split(';')[0];
  const b=await request(body,other);expect(b.statusCode).toBe(200);expect(b.json().id).not.toBe(a.json().id);
  const legacy={title:'Older client',body:'',genre:'game'};
  expect((await request(legacy)).statusCode).toBe(200);
  expect((await request(legacy)).json().id).not.toBe(a.json().id);
});
it('retains a deleted-post tombstone, and removes the ledger when the account is deleted',async()=>{
  const body=payload(),id=(await request(body)).json().id;
  const headers={cookie,'x-walk-client':'1'};
  expect((await instance.app.inject({url:'/api/posts/'+id,method:'DELETE',headers})).statusCode).toBe(200);
  expect((await request(body)).statusCode).toBe(410);
  expect(instance.store.sqlite.prepare('SELECT post_id FROM post_requests').get()).toEqual({post_id:null});
  expect((await instance.app.inject({url:'/api/account/delete',method:'POST',headers,payload:{confirm:'DELETE'}})).statusCode).toBe(200);
  expect(instance.store.sqlite.prepare('SELECT COUNT(*) AS n FROM post_requests').get()).toEqual({n:0});
});
it('returns the original post even at the posting limit, while a new request still fails',async()=>{
  const body=payload(),id=(await request(body)).json().id;
  const db=instance.store.sqlite;
  // Migration column order is intentionally independent of the application model.
  const columns=(db.prepare('PRAGMA table_info(posts)').all() as {name:string}[]).map(c=>c.name);
  const copy=db.prepare(`INSERT INTO posts (${columns.join(',')}) SELECT ${columns.map(c=>c==='id'?'?':c).join(',')} FROM posts WHERE id=?`);
  for(let i=0;i<99;i++)copy.run(randomUUID(),id);
  expect((await request(body)).json()).toEqual({id});
  expect((await request({...body,requestId:randomUUID()})).statusCode).toBe(409);
  expect(db.prepare('SELECT COUNT(*) AS n FROM post_requests').get()).toEqual({n:1});
});
it('rolls back the post if saving its retry receipt fails, allowing a clean retry',async()=>{
  const body=payload(),db=instance.store.sqlite;
  db.exec("CREATE TRIGGER fail_receipt BEFORE INSERT ON post_requests BEGIN SELECT RAISE(ABORT,'test receipt failure'); END");
  expect((await request(body)).statusCode).toBe(500);
  expect(db.prepare('SELECT COUNT(*) AS n FROM posts WHERE title=?').get(body.title)).toEqual({n:0});
  db.exec('DROP TRIGGER fail_receipt');
  expect((await request(body)).statusCode).toBe(200);
  expect(db.prepare('SELECT COUNT(*) AS n FROM posts WHERE title=?').get(body.title)).toEqual({n:1});
});
it('validates identifiers and does not reserve a key for rejected content',async()=>{
  const body=payload();
  expect((await request({...body,requestId:'invalid'})).statusCode).toBe(400);
  expect((await request({...body,title:''})).statusCode).toBe(400);
  expect(instance.store.sqlite.prepare('SELECT COUNT(*) AS n FROM post_requests').get()).toEqual({n:0});
  expect((await request(body)).statusCode).toBe(200);
});
