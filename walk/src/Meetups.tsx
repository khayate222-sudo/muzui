import { useCallback, useEffect, useRef, useState } from "react";
import type { Socket } from "socket.io-client";
import { ArrowRight, MapPin, Send } from "lucide-react";
import type { Friendship } from "../shared/model";
import type { Invitation } from "../shared/invitations";
import type { DestinationInvite } from "../shared/meetups";
import { api } from "./api";
import Modal from "./Modal";
import Avatar from "./Avatar";
import { PlaceIllustration } from "./WorldNavigator";
import { findPlace } from "../shared/worlds";

export function usePlaceInvitations(
  socket: Socket | null,
  userId: string | undefined,
  notify: (s: string) => void,
) {
  const [invites, setInvites] = useState<DestinationInvite[]>([]),
    [error, setError] = useState("");
  const seen = useRef(new Set<string>()),
    sequence = useRef(0);
  const reload = useCallback(
    async (announce = false) => {
      if (!userId) return;
      const request = ++sequence.current;
      try {
        const next = await api<DestinationInvite[]>("/meetups");
        if (request !== sequence.current) return;
        if (
          announce &&
          next.some((i) => !seen.current.has(i.id)) &&
          !document.querySelector('[aria-modal="true"]')
        )
          notify("場所への招待が届きました。通知から行き先を確認できます。");
        seen.current = new Set(next.map((i) => i.id));
        setInvites(next);
        setError("");
      } catch (e) {
        if (request === sequence.current) setError((e as Error).message);
      }
    },
    [userId, notify],
  );
  useEffect(() => {
    if (!socket || !userId) return;
    const update = () => void reload(true),
      load = () => void reload(),
      reset = () => {
        sequence.current++;
        setInvites([]);
      };
    socket.on("meetups", update);
    socket.on("connect", load);
    socket.on("disconnect", reset);
    if (socket.connected) load();
    return () => {
      sequence.current++;
      socket.off("meetups", update);
      socket.off("connect", load);
      socket.off("disconnect", reset);
    };
  }, [socket, userId, reload]);
  return { invites, error, reload };
}

export function FriendDestinationSend({
  target,
  friends,
  notify,
}: {
  target: Invitation;
  friends: Friendship[];
  notify: (s: string) => void;
}) {
  const [busy, setBusy] = useState<string | null>(null),
    [sent, setSent] = useState<string[]>([]);
  return (
    <section className="friend-destination-send">
      <h3>
        <Send size={16} />
        友達をこの場所に誘う
      </h3>
      <p>
        承認済みの友達に、10分間有効の招待を送ります。相手が確認してから移動します。
      </p>
      {friends
        .filter((f) => f.status === "accepted")
        .map((f) => (
          <div className="destination-friend" key={f.id}>
            <Avatar color={f.user.color} style={f.user.style} size={30} />
            <span>{f.user.displayName}</span>
            <button
              className="outline"
              disabled={!!busy || sent.includes(f.user.id)}
              onClick={() => {
                setBusy(f.user.id);
                void api("/meetups", "POST", {
                  targetId: f.user.id,
                  destination: target,
                })
                  .then(() => {
                    setSent((ids) => [...ids, f.user.id]);
                    notify("場所への招待を送りました");
                  })
                  .catch((e) => notify(e.message))
                  .finally(() => setBusy(null));
              }}
            >
              {sent.includes(f.user.id)
                ? "招待済み"
                : busy === f.user.id
                  ? "送信中…"
                  : "ここに招待"}
            </button>
          </div>
        ))}
      {!friends.some((f) => f.status === "accepted") && (
        <p className="fineprint">
          プロフィールから交流リクエストを送り、双方が承認すると直接招待できます。リンクでの共有も利用できます。
        </p>
      )}
    </section>
  );
}

export function PlaceInvitationInbox({
  state,
  go,
}: {
  state: ReturnType<typeof usePlaceInvitations>;
  go: (target: Invitation) => Promise<void>;
}) {
  const [chosen, setChosen] = useState<DestinationInvite | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [accepted, setAccepted] = useState<Invitation | null>(null);
  const current = chosen && state.invites.some((i) => i.id === chosen.id),
    place =
      chosen?.destination.kind === "world"
        ? findPlace(chosen.destination.id)
        : null;
  function close() {
    setChosen(null);
    setAccepted(null);
    setError("");
  }
  async function respond(accept: boolean) {
    if (!chosen || busy) return;
    setBusy(true);
    setError("");
    try {
      let destination = accepted;
      if (!destination) {
        const result = await api<{ destination?: Invitation }>(
          "/meetups/" + chosen.id + "/respond",
          "POST",
          { accept },
        );
        destination = result.destination || null;
        if (destination) setAccepted(destination);
      }
      if (accept && destination) {
        await go(destination);
        close();
      } else {
        close();
        await state.reload();
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (!state.invites.length && !state.error && !chosen) return null;
  return (
    <section className="place-invitation-inbox">
      <div className="side-heading">
        <h3>
          <MapPin size={17} />
          場所への招待
        </h3>
        <span className="soft-badge">{state.invites.length}</span>
      </div>
      {state.error && (
        <p role="alert">
          {state.error}
          <button className="text-button" onClick={() => void state.reload()}>
            再読み込み
          </button>
        </p>
      )}
      <div className="place-invitation-list">
        {state.invites.map((i) => (
          <article key={i.id}>
            <Avatar color={i.from.color} style={i.from.style} size={35} />
            <div>
              <strong>{i.from.displayName}から</strong>
              <p>{i.title}</p>
              <small>
                {i.destination.kind === "room"
                  ? "公開ルーム"
                  : i.destination.kind === "post"
                    ? "投稿"
                    : "世界"}
                への招待 ·{" "}
                {new Intl.DateTimeFormat("ja", {
                  hour: "2-digit",
                  minute: "2-digit",
                }).format(i.expiresAt)}
                まで
              </small>
            </div>
            <button
              className="outline"
              onClick={() => {
                setChosen(i);
                setError("");
                setAccepted(null);
              }}
            >
              行き先を確認
            </button>
          </article>
        ))}
      </div>
      {chosen && (
        <Modal title="友達から場所への招待" close={close}>
          <div className="destination-invitation">
            <span className="sheet-eyebrow">
              <MapPin size={15} />
              MEET AT A PLACE
            </span>
            {place ? (
              <PlaceIllustration place={place} />
            ) : (
              <span className="destination-symbol">
                {chosen.destination.kind === "room" ? "⌂" : "▤"}
              </span>
            )}
            <h2>{chosen.title}</h2>
            <p className="destination-path">{chosen.path.join(" › ")}</p>
            <div className="destination-sender">
              <Avatar
                color={chosen.from.color}
                style={chosen.from.style}
                size={30}
              />
              <span>{chosen.from.displayName}からの招待</span>
            </div>
            <p>
              行き先を共有する招待です。相手の現在地を追跡せず、今もここにいることを示すものではありません。
            </p>
            <small>
              移動しても、パーティ・音声・同期視聴には自動参加しません。投稿は実際に開いてから閲覧人数に含まれます。
            </small>
            {error && <p role="alert">{error}</p>}
            {!current && !accepted && !busy && (
              <p role="status">
                この招待は終了しました。期限や公開設定が変更された可能性があります。
              </p>
            )}
            <button
              className="primary full"
              disabled={busy || (!current && !accepted)}
              onClick={() => void respond(true)}
            >
              {busy
                ? "行き先を確認中…"
                : accepted
                  ? "もう一度移動する"
                  : "確認してこの場所へ行く"}
              <ArrowRight size={17} />
            </button>
            {current && !accepted && (
              <button
                className="text-button"
                disabled={busy}
                onClick={() => void respond(false)}
              >
                今回は辞退する
              </button>
            )}
          </div>
        </Modal>
      )}
    </section>
  );
}
