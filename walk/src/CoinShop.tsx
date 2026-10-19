import {useState} from 'react';
import {Lock,Check,Armchair} from 'lucide-react';
import type {EconomyState,CoinEntry} from '../shared/economy';
import {buildingPolygons,buildingPalette,type BuildingPiece} from '../shared/building';
import {t,tr,localeTag} from './i18n';
export function DecorPreview({kind,color='cream'}:{kind:BuildingPiece['kind'];color?:BuildingPiece['color']}){return <svg className="decor-preview" viewBox="-65 -110 130 140" aria-hidden="true"><ellipse cx="0" cy="10" rx="40" ry="12" fill="#a3957820"/>{buildingPolygons({kind,color,x:0,y:0,z:0,rotation:0}).map((f,i)=><polygon key={i} points={f.points.map(p=>p.join(',')).join(' ')} fill={f.color} stroke="#736349" strokeWidth="1"/>)}</svg>;}
const entryLabels:Record<CoinEntry['kind'],string>={daily:'今日のコイン',shop:'素材・家具の解放',job_reserve:'依頼の報酬を預かり',job_refund:'依頼取消の返却',job_reward:'依頼の完了報酬'};
export default function CoinShop({data,busy,claim,buy,decorate}:{data:EconomyState;busy:boolean;claim:()=>void;buy:(id:string)=>void;decorate:()=>void}){
 const [filter,setFilter]=useState('all');
 return <section className="coin-shop"><h3>{t('暮らしの道具店')}</h3><p>{t('部屋を飾るためのアイテムです')}</p><p>{t('基本パーツと6色は無料です。追加の色は建築用コインで入手できます。')}</p><p>{t('家具や小物は一度解放すれば何度でも配置できます。維持費や、置くたびの支払いはありません。')}</p>
 <button className="primary" disabled={busy||data.coinClaimed} onClick={claim}>{data.coinClaimed?t('今日のコインは受取済み'):t('今日の200コインを受け取る')}</button><p className="fineprint">{t('受け取りはUTCの日付で1日1回です。動画や広告の視聴報酬ではありません。')}</p>
 <details className="coin-guide"><summary>{t('コインはどこから来て、何に使う？')}</summary><p>{t('毎日の無料受け取りと、住人の依頼を完了した報酬で増えます。家具・照明・小物・色の解放と、住人への依頼報酬に使います。')}</p><p>{t('お店での解放はコインを消費します。依頼の報酬は一時的に預かり、完了承認後に相手へ渡します。')}</p><p>{t('100コインの小物は1日の受け取りで選べます。200〜400コインの家具、600コインのアーチは、ゆっくり集める目標です。')}</p><p>{t('チップへの交換、現金での購入・換金はできません。承認や投票権は売りません。')}</p></details>
 <nav className="coin-filters" aria-label={t('お店の種類')}>{([['all','すべて'],['furniture','家具'],['light','照明'],['keepsake','小物'],['material','色と素材']] as const).map(([id,label])=><button className="outline" key={id} aria-pressed={filter===id} onClick={()=>setFilter(id)}>{t(label)}</button>)}</nav>
 <div className="cosmetic-grid">{data.catalog.filter(item=>filter==='all'||item.category===filter).map(item=>{const owned=data.owned.includes(item.id);return <article key={item.id}>{'kind'in item?<DecorPreview kind={item.kind}/>:<div className="material-swatch" style={{background:buildingPalette[item.color][0],borderColor:buildingPalette[item.color][1]}}/>}<h3>{t(item.label)}</h3><p>{t(item.description)}</p><p>{tr('建築用コイン {count}',{count:item.cost})}</p><small>{owned?<><Check size={13}/>{t('解放済み・何度でも配置')}</>:<><Lock size={13}/>{t('一度の解放でずっと使える')}</>}</small><button className="outline" disabled={busy||owned||data.coins<item.cost} onClick={()=>buy(item.id)}>{owned?t('入手済み'):t('コインで入手')}</button>{!owned&&data.coins<item.cost&&<p className="fineprint">{tr('あと {count} コイン',{count:item.cost-data.coins})}</p>}</article>;})}</div>
 <button className="outline" onClick={decorate}><Armchair size={17}/>{t('ルームを開いて飾る')}</button><p className="fineprint">{t('自分のルームの「建築する」から、解放した家具と素材を選べます。')}</p>
 <section className="coin-history"><h3>{t('コインの足あと')}</h3><p>{t('自分だけに見える、直近20件の出入りです。')}</p>{!data.coinHistory.length&&<p>{t('まだコインの記録はありません')}</p>}<ul>{data.coinHistory.map(e=><li key={e.id}><span>{t(entryLabels[e.kind])}<small>{new Date(e.createdAt).toLocaleString(localeTag())}</small></span><strong>{e.delta>0?'+':''}{e.delta}</strong></li>)}</ul></section>
 </section>;
}
