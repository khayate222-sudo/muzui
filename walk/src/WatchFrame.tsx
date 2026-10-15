import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type PointerEvent,
} from "react";
import { createPortal } from "react-dom";
import { ArrowRight, ChevronsDown, ChevronsUp, X } from "lucide-react";
import { useDialogFocus } from "./useDialogFocus";
export default function WatchFrame({
  large,
  toggle,
  close,
  children,
  audience,
  next,
}: {
  large: boolean;
  next?: { disabled: boolean; go: () => void };
  toggle: () => void;
  close: () => void;
  children: ReactNode;
  audience: ReactNode;
}) {
  const panel = useRef<HTMLElement>(null),
    [peek, setPeek] = useState(false),
    gesture = useRef<{ y: number; id: number } | null>(null),
    skipClick = useRef(false);
  useDialogFocus(panel, close, large);
  useEffect(() => {
    const desktop = matchMedia("(min-width:761px)"),
      reset = () => {
        if (desktop.matches) setPeek(false);
      };
    desktop.addEventListener("change", reset);
    return () => desktop.removeEventListener("change", reset);
  }, []);
  useEffect(() => {
    if (large) return;
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !document.querySelector('[aria-modal="true"]'))
        close();
    };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [large, close]);
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
      className={"watch-layer " + (large ? "is-large" : "")}
      onMouseDown={(e) => {
        if (large && e.target === e.currentTarget) close();
      }}
    >
      <section
        ref={panel}
        className={
          "watch-panel " +
          (large ? "watch-full modal" : "watch-side") +
          (peek && !large ? " is-peek" : "")
        }
        role="dialog"
        aria-modal={large}
        aria-label="A LITTLE DISCOVERY"
      >
        {!large && (
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
            {large
              ? "大画面で視聴"
              : peek
                ? "箱庭を広く見る"
                : "箱庭と一緒に視聴"}
          </span>
          {next && (
            <button
              className="primary watch-next"
              aria-label="次の投稿・動画へ"
              disabled={next.disabled}
              onClick={next.go}
            >
              次へ <ArrowRight size={16} />
            </button>
          )}
          <button className="outline" onClick={toggle}>
            {large ? "箱庭と見る" : "大画面で見る"}
          </button>
          <button className="icon-button" aria-label="閉じる" onClick={close}>
            <X size={18} />
          </button>
        </div>
        <div className="watch-content">
          <div className="watch-audience">{audience}</div>
          <div
            className="watch-post"
            inert={!large && peek}
            aria-hidden={!large && peek ? true : undefined}
          >
            {children}
          </div>
        </div>
      </section>
    </div>,
    document.body,
  );
}
