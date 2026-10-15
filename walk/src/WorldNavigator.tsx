import { ArrowRight, ChevronLeft, MapPin } from "lucide-react";
import { childrenOf, findPlace, pathTo, type Place } from "../shared/worlds";
import Modal from "./Modal";
import { worldPresentation } from "./world-presentation";
import { courtyardArt } from "./world-layout";
export function PlaceIllustration({ place }: { place: Place }) {
  return <img className="place-illustration" src={courtyardArt(place)} alt="" loading="lazy" />;
}

export default function WorldNavigator({
  worldId,
  travel,
  enter,
  close,
}: {
  worldId: string;
  travel: boolean;
  enter: (id: string) => void;
  close: () => void;
}) {
  const place = findPlace(worldId),
    destinations = childrenOf(worldId),
    options = destinations.length ? destinations : childrenOf("public");
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
        <span>{p.parentId === "public" ? "趣味の入口" : "もっと奥の世界"}</span>
        <strong>{p.title}</strong>
        <ArrowRight size={17} />
        <p>{worldPresentation(p).subtitle}</p>
        <small className="destination-depth">
          {childrenOf(p.id).length
            ? `この先に${childrenOf(p.id).length}つの入口`
            : "好きに浸れる、小さな世界"}
        </small>
      </div>
    </button>
  );
  return (
    <Modal title="行き先をえらぶ" wide close={close}>
      <div className="destination-sheet">
        <span className="sheet-eyebrow">
          <MapPin size={14} /> YOUR NEXT WORLD
        </span>
        <h2>どの「好き」へ、寄り道する？</h2>
        <p>駅から一歩、その先へ。奥へ進むほど、好きなものが近くなる。</p>
        <nav className="destination-path" aria-label="行き先の現在地">
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
            <ChevronLeft size={16} />
            ひとつ上の世界へ
          </button>
        )}
        <section className="destination-section">
          <h3>{destinations.length ? "世界への入口" : "駅から、別の世界へ"}</h3>
          <div className="destination-grid">{worlds.map(card)}</div>
        </section>
        {activities.length > 0 && (
          <section className="destination-activities">
            <h3>WALKの外で、いまからすること</h3>
            <p>
              終了時刻を決めて残す、現実の活動中の分身。オンラインや投稿の閲覧とは別です。
            </p>
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
      </div>
    </Modal>
  );
}
