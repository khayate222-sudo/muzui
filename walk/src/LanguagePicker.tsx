import {Globe2} from 'lucide-react';
import {setLocale,useLocale,type Locale} from './i18n';
import './locales/language.css';
export default function LanguagePicker(){
  const locale=useLocale();
  return <label className="language-picker"><Globe2 size={16}/><span lang="en">Language</span><select aria-label="Language" value={locale} onChange={e=>setLocale(e.target.value as Locale)}><option value="en" lang="en">English</option><option value="zh-Hans" lang="zh-Hans">简体中文</option><option value="zh-Hant" lang="zh-Hant">繁體中文</option><option value="ja" lang="ja">日本語</option></select></label>;
}
