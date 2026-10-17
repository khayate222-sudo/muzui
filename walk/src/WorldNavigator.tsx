import {t,tr} from './i18n';
import {useState} from 'react';
import type {Bootstrap} from './model';
import WorldWorkshop from './WorldWorkshop';
import { ArrowRight, ChevronLeft, MapPin } from "lucide-react";
import { childrenOf, findPlace, pathTo, canAddWorld, type Place } from "./worlds";
import Modal from "./Modal";
import { worldPresentation } from "./world-presentation";
import { courtyardArt } from "./world-layout";
export function PlaceIllustration({ place }: { place: Place }) {
  return <img className="place-illustration" src={courtyardArt(place)} alt="" loading="lazy" />;
}

export default function WorldNavigator({
  data, refresh, notify, account, reportOwner, worldId,
  travel,
  enter,
  close,
}: {
  data:Bootstrap; refresh:()=>Promise<unknown>; notify:(s:string)=>void; account:()=>void; reportOwner:(id:string,place:Place)=>void; worldId: string;
  travel: boolean;
  enter: (id: string) => void;
  close: () => void;
}) {
  const [workshop,setWorkshop]=useState<'new'|'edit'|null>(null);
  const place = findPlace(worldId),
    destinations = childrenOf(worldId),
    options = place?.genre ? destinations : destinations.length ? destinations : childrenOf("public");
  const worlds = options.filter((p) => !p.id.startsWith("activity:")),
    activities = options.filter((p) => p.id.startsWith("activity:"));
  const choose = (id: string) => {
    enter(id);
    close();
  };
  const card = (p: Place) => (
    <button
      key={p.id}
      className={"destination-card theme-" + p.theme}
      disabled={travel}
      onClick={() => choose(p.id)}
    >
      <span className="destination-edition">
        {worldPresentation(p).edition}
      </span>
      <PlaceIllustration place={p} />
      <div>
        <span>{p.ownerId ? t("住人がつくった世界") : p.parentId === "public" ? t("趣味の入口") : t("もっと奥の世界")}</span>
        <strong>{p.title}</strong>
        <ArrowRight size={17} />
        <p>{worldPresentation(p).subtitle}</p>
        <small className="destination-depth">
          {childrenOf(p.id).length
            ? tr("この先に{count}つの入口",{count:childrenOf(p.id).length})
            : t("好きに浸れる、小さな世界")}
        </small>
      </div>
    </button>
  );
  return (
    <Modal title={t("行き先をえらぶ")} wide close={close}>
      {workshop&&place?<WorldWorkshop parent={workshop==='edit'?findPlace(place.parentId||'')!:place} editing={workshop==='edit'?place:undefined} refresh={refresh} notify={notify} cancel={()=>setWorkshop(null)} done={choose}/>:<div className="destination-sheet">
        <span className="sheet-eyebrow">
          <MapPin size={14} /> YOUR NEXT WORLD
        </span>
        <h2>{t("どの「好き」へ、寄り道する？")}</h2>
        <p>{t("駅から一歩、その先へ。奥へ進むほど、好きなものが近くなる。")}</p>
        <nav className="destination-path" aria-label={t("行き先の現在地")}>
          {pathTo(worldId).map((p) => (
            <button key={p.id} disabled={travel} onClick={() => choose(p.id)}>
              {p.title}
            </button>
          ))}
        </nav>
        {place?.parentId && (
          <button
            className="outline"
            disabled={travel}
            onClick={() => choose(place.parentId!)}
          >
            <ChevronLeft size={16} />{t("ひとつ上の世界へ")}</button>
        )}
        {place?.genre&&<section className="resident-world-invitation"><span className="sheet-eyebrow">RESIDENT WORLDS</span><h3>{t("この先の世界は、住人の手で。")}</h3><p>{canAddWorld(place,data.user.id)?t("ひとつの作品、ひとつの楽しみ。もっと深い「好き」の場所を作ろう。"):t("ここは住人が作った世界です。新しい分岐は趣味の入口、または自分の世界から追加できます。")}</p><div className="feature-buttons">{canAddWorld(place,data.user.id)&&<button className="primary" disabled={travel} onClick={()=>{if(data.requireAccountForPublishing&&!data.account?.registered){account();return;}setWorkshop('new');}}>{t("この先に世界を作る")}</button>}{place.ownerId&&(place.ownerId===data.user.id||data.isAdmin)&&<button className="outline" onClick={()=>setWorkshop('edit')}>{t("世界の案内を編集")}</button>}{place.ownerId&&place.ownerId!==data.user.id&&<button className="text-button" onClick={()=>{close();reportOwner(place.ownerId!,place);}}>{t("この世界の作成者を通報")}</button>}</div></section>}
        <section className="destination-section">
          <h3>{place?.genre ? t("この先への入口") : t("世界への入口")}</h3>{place?.genre&&!worlds.length&&<p className="quiet-world">{t("まだ奥の世界はありません。最初の小さな「好き」を育てよう。")}</p>}
          <div className="destination-grid">{worlds.map(card)}</div>
        </section>
        {worldId==='public'&&data.worlds?.some(p=>p.ownerId===data.user.id)&&<section className="destination-section"><h3>{t("自分が作った世界")}</h3><div className="destination-grid">{data.worlds.filter(p=>p.ownerId===data.user.id).map(card)}</div></section>}
        {activities.length > 0 && (
          <section className="destination-activities">
            <h3>{t("WALKの外で、いまからすること")}</h3>
            <p>{t("終了時刻を決めて残す、現実の活動中の分身。オンラインや投稿の閲覧とは別です。")}</p>
            <div>
              {activities.map((p) => (
                <button
                  key={p.id}
                  disabled={travel}
                  onClick={() => choose(p.id)}
                >
                  <PlaceIllustration place={p} />
                  <span>
                    <strong>{p.title}</strong>
                    <small>{worldPresentation(p).subtitle}</small>
                  </span>
                  <ArrowRight size={16} />
                </button>
              ))}
            </div>
          </section>
        )}
      </div>}
    </Modal>
  );
}
