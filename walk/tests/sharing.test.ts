import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {shareInvitation} from '../src/sharing';
import {setLocale,type Locale} from '../src/i18n';
import {Share} from '@capacitor/share';
vi.mock('../src/native',()=>({isNative:()=>true,serviceUrl:()=> 'https://walk.invalid'}));
vi.mock('@capacitor/share',()=>({Share:{share:vi.fn()}}));
beforeEach(()=>{vi.mocked(Share.share).mockReset();});
afterEach(()=>setLocale('ja'));
const cases:[Locale,string,string][]=[['en','Meet around something you love on WALK.','Invite to WALK'],['zh-Hans','在 WALK，因喜欢而相聚。','邀请加入 WALK'],['zh-Hant','在 WALK，因喜歡而相聚。','邀請加入 WALK']];
it.each(cases)('uses the selected language in native share copy while preserving the title and URL (%s)',async(locale,text,dialogTitle)=>{
  setLocale(locale);vi.mocked(Share.share).mockResolvedValue({});const title='不思議な駅 $& {count}',url='https://walk.invalid/#/world/world%3Agame';
  expect(await shareInvitation(title,url)).toBe('shared');expect(Share.share).toHaveBeenCalledExactlyOnceWith({title,url,text,dialogTitle});
});
it('keeps a cancelled native share distinct from a successful share',async()=>{
  vi.mocked(Share.share).mockRejectedValue(Object.assign(new Error('cancelled'),{name:'AbortError'}));expect(await shareInvitation('Title','https://walk.invalid')).toBe('cancelled');
});
