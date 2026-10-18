import {afterEach,beforeEach,it,expect,vi} from 'vitest';
import {readPostDraft,writePostDraft,removePostDraft,clearPostDrafts,type PostDraft} from '../src/post-draft';
let values:Map<string,string>;
const draft=():PostDraft=>({version:1,requestId:crypto.randomUUID(),title:'未公開 $& {title}',body:'Private note',genre:'game',worldId:'',attachment:null,attempted:false,savedPostId:null});
beforeEach(()=>{
  values=new Map();vi.stubGlobal('localStorage',{
    get length(){return values.size;},key:(i:number)=>[...values.keys()][i]??null,
    getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>values.set(key,value),removeItem:(key:string)=>values.delete(key),
  });
});
afterEach(()=>vi.unstubAllGlobals());
it('keeps owners separate and restores the exact request and attachment after an uncertain submission',()=>{
  const original={...draft(),attempted:true,attachment:{id:crypto.randomUUID(),url:'/media/11111111-1111-4111-8111-111111111111.png',mime:'image/png' as const}};
  expect(writePostDraft('owner-a',original)).toBe(true);expect(readPostDraft('owner-a')).toEqual(original);expect(readPostDraft('owner-b')).toBeNull();
  writePostDraft('owner-b',draft());removePostDraft('owner-a');expect(readPostDraft('owner-a')).toBeNull();expect(readPostDraft('owner-b')).not.toBeNull();
});
it('discards corrupt, oversized, unrecognized and external-URL draft data safely',()=>{
  for(const raw of ['{bad',JSON.stringify({...draft(),body:'x'.repeat(4001)}),JSON.stringify({...draft(),version:2}),JSON.stringify({...draft(),attachment:{id:crypto.randomUUID(),url:'https://outside.test/private',mime:'image/png'}})]){
    values.set('walk-post-draft-v1:owner',raw);expect(readPostDraft('owner')).toBeNull();
  }
});
it('clears all local drafts on a session change and preserves unrelated settings',()=>{
  writePostDraft('a',draft());writePostDraft('b',draft());localStorage.setItem('walk-locale-v1','zh-Hant');clearPostDrafts();
  expect([...values.entries()]).toEqual([['walk-locale-v1','zh-Hant']]);
});
it('reports blocked storage without crashing reading, saving or cleanup',()=>{
  vi.stubGlobal('localStorage',{getItem(){throw new Error('blocked');},setItem(){throw new Error('full');},removeItem(){throw new Error('blocked');},get length(){throw new Error('blocked');}});
  expect(readPostDraft('owner')).toBeNull();expect(writePostDraft('owner',draft())).toBe(false);expect(()=>{removePostDraft('owner');clearPostDrafts();}).not.toThrow();
});
