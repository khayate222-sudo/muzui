import {t} from './i18n';
import {useEffect,useState} from 'react';
import {isNative,privatePhoto} from './native';
export default function PrivatePhoto({path,alt}:{path:string;alt:string}){
 const [url,setUrl]=useState(''),[failed,setFailed]=useState(false);
 useEffect(()=>{if(!isNative())return;let active=true;setUrl('');setFailed(false);void privatePhoto(path).then(u=>{if(active)setUrl(u);}).catch(()=>{if(active)setFailed(true);});return()=>{active=false;};},[path]);
 return failed?<p>{t("写真を表示できませんでした。")}</p>:isNative()&&!url?<p>{t("写真を読み込んでいます…")}</p>:<img className="journal-photo" src={isNative()?url:path} alt={alt}/>;
}
