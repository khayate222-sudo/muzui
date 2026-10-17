export const locales=['en','zh-Hans','zh-Hant','ja'] as const;
export type Locale=typeof locales[number];
export function matchLocale(value:string):Locale|null{
  const tag=value.toLowerCase().replaceAll('_','-');
  if(/^zh-hant(-|$)/.test(tag)||/^zh-(tw|hk|mo)(-|$)/.test(tag))return 'zh-Hant';
  if(tag==='zh'||/^zh-hans(-|$)/.test(tag)||/^zh-(cn|sg)(-|$)/.test(tag))return 'zh-Hans';
  if(/^en(-|$)/.test(tag))return 'en';if(/^ja(-|$)/.test(tag))return 'ja';return null;
}
export function preferredLocale(saved:string|null,languages:readonly string[]):Locale{
  if(locales.includes(saved as Locale))return saved as Locale;
  return languages.map(matchLocale).find((v):v is Locale=>!!v)||'en';
}
