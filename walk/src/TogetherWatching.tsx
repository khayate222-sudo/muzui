import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type RefObject,
} from "react";
import type { Socket } from "socket.io-client";
import { Link2, Pause, Play, Users, X } from "lucide-react";
import type { Bootstrap, Post } from "../shared/model";
import {
  playbackPosition,
  type WatchingInvite,
  type WatchingState,
} from "../shared/watching";
import Avatar from "./Avatar";
import Modal from "./Modal";

const empty = (): WatchingState => ({
  group: null,
  invites: [],
  serverNow: Date.now(),
});
export function useTogetherWatching(
  socket: Socket | null,
  userId: string | undefined,
  video: RefObject<HTMLVideoElement | null>,
  notify: (message: string) => void,
) {
  const [state, setState] = useState<WatchingState>(empty),
    [needsPlay, setNeedsPlay] = useState(false);
  const live = useRef(state);
  live.current = state;
  const offset = useRef(0),
    previous = useRef<string | null>(null),
    previousVideo = useRef<HTMLVideoElement | null>(null),
    retryPlay = useRef(false),
    controlTimer = useRef<ReturnType<typeof setTimeout> | null>(null),
    inFlight = useRef(false);
  const send = useCallback(
    async (event: string, data: object = {}) => {
      if (!socket?.connected)
        throw new Error("接続が戻ってから操作してください");
      const sent = Date.now(),
        result = (await socket
          .timeout(5000)
          .emitWithAck("watching:" + event, data)) as {
          ok: boolean;
          error?: string;
          state?: WatchingState;
        };
      if (!result.ok)
        throw new Error(result.error || "操作を確認できませんでした");
      if (result.state && event === "get")
        offset.current = result.state.serverNow - (sent + Date.now()) / 2;
      return result;
    },
    [socket],
  );
  useEffect(() => {
    if (!socket) return;
    const receive = (next: WatchingState) => setState(next),
      reset = () => setState(empty());
    const load = () => {
      void send("get").catch(() => {});
    };
    socket.on("watching:state", receive);
    socket.on("disconnect", reset);
    socket.on("connect", load);
    if (socket.connected) load();
    const background = () => {
      socket.emit("watching:leave", {}, () => {});
      reset();
      video.current?.pause();
    };
    window.addEventListener("walk:background", background);
    return () => {
      socket.off("watching:state", receive);
      socket.off("disconnect", reset);
      socket.off("connect", load);
      window.removeEventListener("walk:background", background);
      if (controlTimer.current) clearTimeout(controlTimer.current);
    };
  }, [socket, send, video]);
  useEffect(() => {
    const id = state.group?.id || null;
    if (previous.current && !id) {
      previousVideo.current?.pause();
      notify("同期視聴を終了しました。ここからは自分のペースで見られます。");
    }
    if (id) previousVideo.current = video.current;
    if (previous.current !== id) {
      retryPlay.current = false;
      setNeedsPlay(false);
    }
    previous.current = id;
  }, [state.group?.id, notify, video]);
  const align = useCallback(() => {
    const group = live.current.group,
      el = video.current;
    if (!group || group.hostId === userId || !el || !el.readyState) return;
    const target = playbackPosition(
      group.playback,
      Date.now() + offset.current,
      Number.isFinite(el.duration) ? el.duration : Infinity,
    );
    if (
      Math.abs(el.currentTime - target) > 0.65 ||
      (!group.playback.playing && Math.abs(el.currentTime - target) > 0.08)
    )
      el.currentTime = target;
    if (el.playbackRate !== 1) el.playbackRate = 1;
    if (!group.playback.playing) {
      if (!el.paused) el.pause();
      retryPlay.current = false;
      setNeedsPlay(false);
    } else if (el.paused && !retryPlay.current && !el.ended) {
      retryPlay.current = true;
      const groupId = group.id;
      void el
        .play()
        .then(() => {
          if (live.current.group?.id !== groupId) el.pause();
          else {
            retryPlay.current = false;
            setNeedsPlay(false);
          }
        })
        .catch(() => {
          if (live.current.group?.id === groupId) setNeedsPlay(true);
        });
    }
  }, [userId, video]);
  useEffect(() => {
    align();
    const timer = setInterval(align, 350);
    return () => clearInterval(timer);
  }, [state.group, align]);
  const publish = useCallback(() => {
    if (controlTimer.current) clearTimeout(controlTimer.current);
    const update = async () => {
      const group = live.current.group,
        el = video.current;
      if (!group || group.hostId !== userId || !el) return;
      if (inFlight.current) {
        controlTimer.current = setTimeout(() => void update(), 150);
        return;
      }
      if (el.playbackRate !== 1) el.playbackRate = 1;
      inFlight.current = true;
      try {
        await send("control", {
          position: el.currentTime,
          playing: !el.paused && !el.ended,
          revision: group.playback.revision,
        });
      } catch (e) {
        notify((e as Error).message);
      } finally {
        inFlight.current = false;
      }
    };
    controlTimer.current = setTimeout(() => void update(), 140);
  }, [send, userId, video, notify]);
  useEffect(() => {
    const timer = setInterval(() => {
      if (live.current.group?.hostId === userId && !video.current?.paused)
        publish();
    }, 1000);
    return () => clearInterval(timer);
  }, [publish, userId, video]);
  async function resume() {
    const el = video.current;
    if (!el) return;
    try {
      await el.play();
      retryPlay.current = false;
      setNeedsPlay(false);
      align();
    } catch {
      notify("動画を再生できません。接続と端末の再生設定を確認してください。");
    }
  }
  return { state, send, publish, needsPlay, resume };
}
export type TogetherSession = ReturnType<typeof useTogetherWatching>;

export function TogetherControls({
  session,
  data,
  post,
  video,
  notify,
}: {
  session: TogetherSession;
  data: Bootstrap;
  post: Post;
  video: RefObject<HTMLVideoElement | null>;
  notify: (s: string) => void;
}) {
  const [open, setOpen] = useState(false),
    [consent, setConsent] = useState(false),
    [busy, setBusy] = useState(false),
    [sent, setSent] = useState<string[]>([]);
  const group = session.state.group,
    eligible = post.origin === "walk" && post.type === "video";
  if (!eligible) return null;
  const host = group?.hostId === data.user.id;
  async function act(event: string, payload: object) {
    setBusy(true);
    try {
      await session.send(event, payload);
      return true;
    } catch (e) {
      notify((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="together-controls" data-testid="together-controls">
      {group && group.postId === post.id ? (
        <>
          <div className="together-heading">
            <span className="together-symbol">
              <Link2 size={16} />
            </span>
            <strong>同期視聴 · {group.members.length}人</strong>
            <span className="together-status">
              {group.playback.playing ? "再生中" : "一時停止"}
            </span>
          </div>
          <div className="together-members">
            {group.members.map((m) => (
              <span key={m.id}>
                <Avatar color={m.color} style={m.style} size={23} />
                {m.id === data.user.id ? "あなた" : m.displayName}
                {m.id === group.hostId && <small>ホスト</small>}
              </span>
            ))}
          </div>
          <p>
            {host
              ? "あなたの再生・停止・シークに合わせます。"
              : "ホストの再生に合わせています。いつでも退出できます。"}
          </p>
          <div className="together-actions">
            {host ? (
              <button
                className="outline"
                onClick={() => {
                  const el = video.current;
                  if (!el) return;
                  if (el.paused)
                    void el
                      .play()
                      .catch(() => notify("動画の再生ボタンを押してください"));
                  else el.pause();
                }}
              >
                {group.playback.playing ? (
                  <Pause size={15} />
                ) : (
                  <Play size={15} />
                )}{" "}
                {group.playback.playing ? "みんなで一時停止" : "みんなで再生"}
              </button>
            ) : (
              session.needsPlay && (
                <button
                  className="primary"
                  onClick={() => void session.resume()}
                >
                  <Play size={15} />
                  再生を許可して合わせる
                </button>
              )
            )}
            {host && (
              <button
                className="outline"
                onClick={() => {
                  setSent([]);
                  setOpen(true);
                }}
              >
                友達を招待
              </button>
            )}
            <button
              className="text-button"
              disabled={busy}
              onClick={() => void act("leave", {})}
            >
              {host ? "同期視聴を終了" : "退出して個別視聴"}
            </button>
          </div>
        </>
      ) : (
        <button
          className="together-start"
          disabled={!eligible || !!group}
          onClick={() => {
            setConsent(false);
            setOpen(true);
          }}
        >
          <Users size={16} />
          <span>友達と、同じ瞬間を。</span>
          <b>一緒に見る</b>
        </button>
      )}
      {open && (
        <Modal
          title={host ? "同期視聴に友達を招待" : "一緒に見る"}
          close={() => setOpen(false)}
        >
          <div className="together-setup">
            <span className="account-symbol">
              <Link2 size={26} />
            </span>
            <h2>{host ? "この時間を、友達と。" : "好きな動画を、一緒に。"}</h2>
            <p>「{post.title}」</p>
            {!group ? (
              <>
                <p>
                  承認済みの友達と最大6人。あなたがホストになり、再生・停止・再生位置を合わせます。マイクは使いません。
                </p>
                <label className="together-consent">
                  <input
                    type="checkbox"
                    checked={consent}
                    onChange={(e) => setConsent(e.target.checked)}
                  />
                  名前とアバターを参加者に表示し、動画を同期して見ることに同意する
                </label>
                <small>
                  通常の閲覧公開設定は変わりません。ホストが退出・切断すると同期を終了し、各自の視聴に戻ります。
                </small>
                <button
                  className="primary full"
                  disabled={!consent || busy}
                  onClick={() => {
                    video.current?.pause();
                    void act("create", {
                      postId: post.id,
                      consent: true,
                      position: video.current?.currentTime || 0,
                    });
                  }}
                >
                  同期視聴を始める
                </button>
              </>
            ) : (
              <>
                <p>
                  招待は2分間有効です。相手が参加を選ぶまで再生や移動は変えません。
                </p>
                {data.friendships
                  .filter(
                    (f) =>
                      f.status === "accepted" &&
                      !group.members.some((m) => m.id === f.user.id),
                  )
                  .map((f) => (
                    <div className="room-row" key={f.id}>
                      <span>{f.user.displayName}</span>
                      <button
                        className="outline"
                        disabled={busy || sent.includes(f.user.id)}
                        onClick={() =>
                          void act("invite", { targetId: f.user.id }).then(
                            (ok) => {
                              if (ok) {
                                setSent((ids) => [...ids, f.user.id]);
                                notify("同期視聴の招待を送りました");
                              }
                            },
                          )
                        }
                      >
                        {sent.includes(f.user.id)
                          ? "招待済み"
                          : "同期視聴に招待"}
                      </button>
                    </div>
                  ))}
                {!data.friendships.some((f) => f.status === "accepted") && (
                  <p>
                    プロフィールから交流リクエストを送り、双方が承認すると招待できます。
                  </p>
                )}
                <button className="primary full" onClick={() => setOpen(false)}>
                  動画へ戻る
                </button>
              </>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}

export function TogetherInvitations({
  session,
  visit,
  notify,
}: {
  session: TogetherSession;
  visit: (id: string) => Promise<void>;
  notify: (s: string) => void;
}) {
  const [chosen, setChosen] = useState<WatchingInvite | null>(null),
    [consent, setConsent] = useState(false),
    [busy, setBusy] = useState(false);
  const invitation =
    chosen && session.state.invites.find((i) => i.id === chosen.id);
  return (
    <>
      {!chosen && session.state.invites.length > 0 && (
        <button
          className="together-inbox"
          onClick={() => {
            setChosen(session.state.invites[0]);
            setConsent(false);
          }}
        >
          <Link2 size={17} />
          <span>一緒に見る招待 · {session.state.invites.length}</span>
        </button>
      )}
      {chosen && (
        <Modal title="同期視聴への招待" close={() => setChosen(null)}>
          <div className="together-setup">
            {invitation ? (
              <>
                <span className="account-symbol">
                  <Users size={26} />
                </span>
                <h2>{invitation.from.displayName}と、一緒に。</h2>
                <p className="together-video-title">{invitation.post.title}</p>
                <p>
                  参加すると、この動画の場所へ移動し、ホストの再生・停止・再生位置に合わせます。名前とアバターを参加者に表示します。通常の閲覧公開設定は変わりません。
                </p>
                <label className="together-consent">
                  <input
                    type="checkbox"
                    checked={consent}
                    onChange={(e) => setConsent(e.target.checked)}
                  />
                  内容を確認し、同期視聴への参加に同意する
                </label>
                <small>
                  マイクは使いません。退出すると現在の位置で一時停止し、自分のペースで見られます。
                </small>
                <button
                  className="primary full"
                  disabled={!consent || busy || !!session.state.group}
                  onClick={() => {
                    setBusy(true);
                    void (async () => {
                      try {
                        await visit(invitation.post.id);
                        await session.send("respond", {
                          id: invitation.id,
                          accept: true,
                          consent: true,
                        });
                        setChosen(null);
                      } catch (e) {
                        notify((e as Error).message);
                      } finally {
                        setBusy(false);
                      }
                    })();
                  }}
                >
                  同意して一緒に見る
                </button>
                <button
                  className="text-button"
                  disabled={busy}
                  onClick={() => {
                    void session
                      .send("respond", { id: invitation.id, accept: false })
                      .then(() => setChosen(null))
                      .catch((e) => notify(e.message));
                  }}
                >
                  今回は辞退する
                </button>
                {session.state.group && (
                  <p role="status">
                    参加中の同期視聴から退出してから選んでください。
                  </p>
                )}
              </>
            ) : (
              <>
                <h2>この招待は終了しました</h2>
                <p>
                  時間切れ、ホストの退出、または別の端末での操作で終了しました。
                </p>
                <button className="outline" onClick={() => setChosen(null)}>
                  <X size={16} />
                  閉じる
                </button>
              </>
            )}
          </div>
        </Modal>
      )}
    </>
  );
}
