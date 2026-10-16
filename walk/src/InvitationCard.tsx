import { ArrowRight, Link } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "./api";
import type { Room } from "../shared/community";
import type { Bootstrap } from "../shared/model";
import { findPlace, pathTo, postWorld } from "./worlds";
import type { Invitation } from "../shared/invitations";
import Modal from "./Modal";
import { PlaceIllustration } from "./WorldNavigator";
export default function InvitationCard({
  target,
  data,
  connected,
  go,
  close,
}: {
  target: Invitation;
  data: Bootstrap;
  connected: boolean;
  go: () => Promise<void>;
  close: () => void;
}) {
  const [roomState, setRoomState] = useState<{
      id: string;
      value: Room | null;
      done: boolean;
    }>({ id: "", value: null, done: false }),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    setError("");
    if (target.kind !== "room") return;
    let active = true;
    setRoomState({ id: target.id, value: null, done: false });
    void api<Room>("/rooms/" + encodeURIComponent(target.id))
      .then((r) => {
        if (active)
          setRoomState({
            id: target.id,
            value: r.isPublic ? r : null,
            done: true,
          });
      })
      .catch(() => {
        if (active) setRoomState({ id: target.id, value: null, done: true });
      });
    return () => {
      active = false;
    };
  }, [target.kind, target.id]);
  const room =
      target.kind === "room" && roomState.id === target.id
        ? roomState.value
        : null,
    loading =
      target.kind === "room" && (roomState.id !== target.id || !roomState.done);
  const post =
      target.kind === "post"
        ? data.posts.find((p) => p.id === target.id)
        : undefined,
    place = findPlace(post ? postWorld(post) : target.id);
  const valid =
    target.kind === "room" ? !!room : target.kind === "post" ? !!post : !!place;
  return (
    <Modal title="WALKへの招待" close={close}>
      <div className="invitation-card">
        <span className="sheet-eyebrow">
          <Link size={15} /> MEET ME HERE
        </span>
        {place && <PlaceIllustration place={place} />}
        {room && <RoomIllustration theme={room.theme} />}
        <h2>
          {loading
            ? "行き先を確認しています…"
            : valid
              ? room?.title || post?.title || place?.title
              : "この行き先は見つかりませんでした"}
        </h2>
        <p>
          {valid
            ? room
              ? `不思議な駅 › 住人のルーム › ${room.title}`
              : pathTo(place?.id || "")
                  .map((p) => p.title)
                  .join(" › ")
            : loading
              ? "公開設定を確認しています。"
              : "削除された投稿や、現在公開されていない場所の可能性があります。"}
        </p>
        {valid && (
          <>
            {room && (
              <p className="destination-room-owner">
                公開ルーム · {room.ownerName}
              </p>
            )}
            <p>
              移動してから、同じ場所の人や投稿を見ることができます。パーティ・音声・同期視聴には自動参加しません。
            </p>
            {error && <p role="alert">{error}</p>}
            <button
              className="primary full"
              disabled={!connected || busy}
              onClick={() => {
                setBusy(true);
                setError("");
                void go()
                  .catch((e) => setError(e.message))
                  .finally(() => setBusy(false));
              }}
            >
              {busy
                ? "移動を確認しています…"
                : connected
                  ? "この場所へ行く"
                  : "接続しています…"}
              <ArrowRight size={18} />
            </button>
          </>
        )}
      </div>
    </Modal>
  );
}

export function RoomIllustration({ theme }: { theme: Room["theme"] }) {
  const night = theme === "night",
    studio = theme === "studio",
    roof = night ? "#62638d" : studio ? "#7ca6bc" : "#a5b59b";
  return (
    <svg
      className="place-illustration room-invitation-art"
      viewBox="0 0 180 130"
      aria-hidden="true"
    >
      <ellipse
        cx="90"
        cy="113"
        rx="70"
        ry="13"
        fill={night ? "#a4a2cd" : "#d8e4da"}
        opacity=".5"
      />
      {night && (
        <g fill="#b6acd9">
          <path d="M35 14l2 5 5 2-5 2-2 5-2-5-5-2 5-2Z" />
          <circle cx="149" cy="17" r="3" />
          <circle cx="154" cy="37" r="1.8" />
        </g>
      )}
      <path d="M34 61l65 15v43l-65-15Z" fill={night ? "#adaac8" : "#eee3d1"} />
      <path d="M99 76l50-25v43l-50 25Z" fill={night ? "#797b9d" : "#b7b6a4"} />
      <path d="M21 61 69 15l42 59Z" fill={roof} />
      <path
        d="m69 15 91 29-49 30Z"
        fill={night ? "#9295bb" : studio ? "#b3d3df" : "#ced6b4"}
      />
      <path d="M66 111V87a12 12 0 0 1 24 0v30" fill="#435b71" />
      <path d="m44 75 13 3v16l-13-3Z" fill="#f4dba8" />
      <path d="m113 77 21-10v16l-21 10Z" fill={night ? "#ffe4af" : "#c7deda"} />
      {studio ? (
        <g>
          <path
            d="m23 110 8-25 8 28"
            stroke="#b39678"
            strokeWidth="3"
            fill="none"
          />
          <path d="m19 83 24 5-2 17-24-5Z" fill="#f6eee1" />
          <path
            d="m23 95 6-6 8 10"
            stroke="#9dadbe"
            strokeWidth="2"
            fill="none"
          />
        </g>
      ) : (
        <g>
          <path d="M28 115V93" stroke="#9c9c7d" strokeWidth="4" />
          <circle cx="28" cy="90" r="14" fill={night ? "#8796a4" : "#96b49a"} />
          <circle cx="20" cy="86" r="10" fill={night ? "#a8b2bd" : "#b9cc9c"} />
        </g>
      )}
      <path
        d="m120 117 23-12 11 4-22 13Z"
        fill={night ? "#b2a5c3" : "#c6b4a1"}
      />
    </svg>
  );
}
