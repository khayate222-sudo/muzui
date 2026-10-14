import { afterEach, describe, expect, it } from 'vitest';
import { copyFileSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
// @ts-expect-error JavaScript entrypoint is also used directly by Windows, before tsx is installed.
import { checkLocalProject } from '../scripts/check-local.mjs';
const folders:string[]=[];
function fixture(){const dir=mkdtempSync(join(tmpdir(),'WALK space 日本語 '));folders.push(dir);mkdirSync(join(dir,'scripts'));mkdirSync(join(dir,'server'));copyFileSync(new URL('../package.json',import.meta.url),join(dir,'package.json'));copyFileSync(new URL('../package-lock.json',import.meta.url),join(dir,'package-lock.json'));writeFileSync(join(dir,'scripts/start-production.mjs'),'');writeFileSync(join(dir,'server/index.ts'),'');return dir;}
afterEach(()=>{for(const dir of folders.splice(0))rmSync(dir,{recursive:true,force:true});});
describe('local download preflight',()=>{
  it('accepts the shipped manifest and lockfile in a path with spaces and Japanese characters without changing them',()=>{const dir=fixture(),before=readFileSync(join(dir,'package-lock.json'));expect(checkLocalProject(dir)).toEqual({name:'walk-social',lockfileVersion:3});expect(readFileSync(join(dir,'package-lock.json'))).toEqual(before);});
  it('explains full extraction when a batch file is launched on its own from a ZIP',()=>{const dir=mkdtempSync(join(tmpdir(),'walk-lone-launcher-'));folders.push(dir);writeFileSync(join(dir,'START_WINDOWS.cmd'),'@echo off');expect(()=>checkLocalProject(dir)).toThrow(/すべて展開/);});
  it('rejects a missing, malformed, or mismatched lockfile before installation',()=>{const dir=fixture(),lock=join(dir,'package-lock.json');rmSync(lock);expect(()=>checkLocalProject(dir)).toThrow(/package-lock.json/);writeFileSync(lock,'{broken');expect(()=>checkLocalProject(dir)).toThrow(/読み込めません/);writeFileSync(lock,JSON.stringify({name:'another-project',lockfileVersion:3}));expect(()=>checkLocalProject(dir)).toThrow(/WALK用/);});
});
