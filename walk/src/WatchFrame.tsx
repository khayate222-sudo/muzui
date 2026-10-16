import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type PointerEvent,
} from "react";
import { createPortal } from "react-dom";
import { ArrowRight, ChevronsDown, ChevronsUp, Armchair, X } from "lucide-react";
import type { Post } from "../shared/model";
import { useDialogFocus } from "./useDialogFocus";
export default function WatchFrame({
  large,
  toggle,
  close,
  children,
  audience,
  next,
  room,
  hasPost = true,
}: {
  large: boolean;
  next?: { disabled: boolean; go: () => void };
  toggle: () => void;
  close: () => void;
  children: ReactNode;
  audience: ReactNode;
  hasPost?: boolean;
  room?: { active: boolean; title: string; toggle: () => void; posts: Post[]; selected?: string; open: (id: string) => void; edit?: () => void; after?:ReactNode; busy: boolean };
}) {
  const panel = useRef<HTMLElement>(null),
    content = useRef<HTMLDivElement>(null),
    [peek, setPeek] = useState(false),
    gesture = useRef<{ y: number; id: number } | null>(null),
    skipClick = useRef(false);
  const inRoom = !!room?.active && !large;
  useDialogFocus(panel, close, large || inRoom);
  useEffect(() => {
    if (inRoom) content.current?.scrollTo({ top: 0, behavior: 'instant' });
  }, [inRoom, room?.selected]);
  useEffect(() => {
    const desktop = matchMedia("(min-width:761px)"),
      reset = () => {
        if (desktop.matches) setPeek(false);
      };
    desktop.addEventListener("change", reset);
    return () => desktop.removeEventListener("change", reset);
  }, []);
  useEffect(() => {
    if (large || inRoom) return;
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !document.querySelector('[aria-modal="true"]'))
        close();
    };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [large, inRoom, close]);
  function endDrag(e: PointerEvent<HTMLButtonElement>) {
    const start = gesture.current;
    gesture.current = null;
    if (!start || start.id !== e.pointerId) return;
    const dy = e.clientY - start.y;
    if (Math.abs(dy) > 36) {
      setPeek(dy > 0);
      skipClick.current = true;
    }
  }
  // The same portal, section and media subtree survive every layout change.
  // In particular, switching to large mode never reloads a video or an external iframe.
  return createPortal(
    <div
      className={"watch-layer " + (large ? "is-large" : inRoom ? "is-room" : "")}
      onMouseDown={(e) => {
        if (large && e.target === e.currentTarget) close();
      }}
    >
      <section
        ref={panel}
        className={
          "watch-panel " +
          (large ? "watch-full modal" : inRoom ? "watch-room modal" : "watch-side") +
          (peek && !large && !inRoom ? " is-peek" : "")
        }
        role="dialog"
        aria-modal={large || inRoom}
        aria-label="A LITTLE DISCOVERY"
      >
        {!large && !inRoom && (
          <button
            className="watch-grab"
            aria-label={peek ? "視聴パネルを広げる" : "箱庭を広く見る"}
            aria-expanded={!peek}
            onPointerDown={(e) => {
              gesture.current = { y: e.clientY, id: e.pointerId };
              skipClick.current = false;
              e.currentTarget.setPointerCapture(e.pointerId);
            }}
            onPointerUp={endDrag}
            onPointerCancel={() => {
              gesture.current = null;
              skipClick.current = true;
            }}
            onClick={(event) => {
              if (skipClick.current && event.detail > 0) {
                skipClick.current = false;
                return;
              }
              skipClick.current = false;
              setPeek((v) => !v);
            }}
          >
            <span className="grab-line" />
            {peek ? <ChevronsUp size={14} /> : <ChevronsDown size={14} />}
          </button>
        )}
        <div className="watch-controls">
          <span>
            {inRoom ? "窓辺で視聴" : large
              ? "大画面で視聴"
              : peek
                ? "箱庭を広く見る"
                : "箱庭と一緒に視聴"}
          </span>
          {next && hasPost && (
            <button
              className="primary watch-next"
              aria-label="次の投稿・動画へ"
              disabled={next.disabled}
              onClick={next.go}
            >
              次へ <ArrowRight size={16} />
            </button>
          )}
          {room && <button className="outline room-mode-button" aria-pressed={room.active} onClick={room.toggle}><Armchair size={15}/>{room.active ? "箱庭へ戻る" : "窓辺で見る"}</button>}
          {hasPost && <button className="outline" onClick={toggle}>
            {large ? room?.active ? "部屋と見る" : "箱庭と見る" : "大画面で見る"}
          </button>}
          <button className="icon-button" aria-label="閉じる" onClick={close}>
            <X size={18} />
          </button>
        </div>
        <div ref={content} className="watch-content">
          <div className="watch-audience">{audience}</div>
          <div
            className="watch-post"
            inert={!large && !inRoom && peek}
            aria-hidden={!large && !inRoom && peek ? true : undefined}
          >
            {children}
          </div>
          {inRoom && room && <section className="room-shelf" aria-label="この部屋の投稿"><div><h3>今夜、何を見よう。</h3>{room.edit&&<button className="text-button" onClick={room.edit}>投稿の配置を編集</button>}</div><p>この部屋に置いた投稿から選べます。</p><div className="room-shelf-items">{room.posts.map(p => <button key={p.id} disabled={room.busy} aria-current={p.id === room.selected ? 'true' : undefined} onClick={() => room.open(p.id)}><span>{p.type === 'video' || p.type === 'youtube' || p.provider === 'TikTok' ? 'PLAY' : p.type === 'image' ? 'PHOTO' : 'READ'}</span><b>{p.title}</b><small>{p.authorName}</small></button>)}</div>{!room.posts.length && <p className="room-empty-hint">保存した投稿や、自分の動画をルームに配置すると、ここで選べます。</p>}</section>}
          {inRoom&&room?.after}
        </div>
      </section>
    </div>,
    document.body,
  );
}
