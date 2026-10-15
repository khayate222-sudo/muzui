import { ArrowRight, ChevronLeft, MapPin } from "lucide-react";
import { childrenOf, findPlace, pathTo, type Place } from "../shared/worlds";
import Modal from "./Modal";
import { worldPresentation } from "./world-presentation";
import { worldEmblem } from "./world-emblem";
export function PlaceIllustration({ place }: { place: Place }) {
  const japan = place.theme === "japan",
    future = place.theme === "future",
    cave = place.gate === "cave";
  return (
    <svg
      viewBox="0 0 180 130"
      aria-hidden="true"
      className="place-illustration"
    >
      <ellipse cx="90" cy="115" rx="64" ry="10" fill="#23384e" opacity=".12" />
      {cave ? (
        <>
          <path
            d="M28 112L35 66 74 22 117 28 151 72 159 113 91 128Z"
            fill="#899f8c"
          />
          <path d="M28 112L35 66 74 22 83 70 63 114" fill="#b6c2a6" />
          <path d="M64 115V83a27 27 0 0154 0v32" fill="#345365" />
          <path d="M75 114V83a16 16 0 0132 0v31" fill="#86bfb4" />
        </>
      ) : (
        <>
          <path
            d="M34 61L101 74V120L34 106Z"
            fill={future ? "#d1e8ee" : "#eee0c7"}
          />
          <path
            d="M101 74L150 49V97L101 120Z"
            fill={future ? "#7facc3" : "#b7a48d"}
          />
          <path
            d="M20 61L70 14 110 73Z"
            fill={japan ? "#a77284" : place.color}
          />
          <path
            d="M70 14L159 43 110 73Z"
            fill={japan ? "#c19ba7" : future ? "#9cd3df" : "#b8c2a4"}
          />
          <path d="M68 112V85a11 11 0 0122 0v32" fill="#3b536b" />
          <path d="M45 76L59 79V96L45 93Z" fill="#ffe1a2" />
          <path d="M115 75L136 65V83L115 94Z" fill="#aee9df" />
          {place.gate === "castle" && (
            <>
              <path
                d="M29 49V16L41 2 53 16V54Z"
                fill={future ? "#719bbd" : "#8d87ad"}
              />
              <path
                d="M122 48V12L134 0 146 12V35"
                fill={future ? "#a1cfdf" : "#a6a5c4"}
              />
            </>
          )}
          {future && (
            <path
              d="M112 59L150 40M112 103L141 88"
              stroke="#6edfcc"
              strokeWidth="3"
            />
          )}
        </>
      )}
      <g
        transform={
          cave ? "translate(91 52) scale(.38)" : "translate(77 53) scale(.38)"
        }
      >
        {worldEmblem(place).map((s, i) =>
          s.kind === "polygon" ? (
            <polygon
              key={i}
              points={s.points
                .reduce((out, n, j) => out + (j % 2 ? "," : " ") + n, "")
                .trim()}
              fill={s.fill}
            />
          ) : s.kind === "circle" ? (
            <circle key={i} cx={s.x} cy={s.y} r={s.r} fill={s.fill} />
          ) : (
            <rect
              key={i}
              x={s.x}
              y={s.y}
              width={s.width}
              height={s.height}
              rx="3"
              fill={s.fill}
            />
          ),
        )}
      </g>
      <circle cx="28" cy="104" r="12" fill="#87a888" />
      <circle cx="20" cy="100" r="8" fill="#b0c69a" />
    </svg>
  );
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
