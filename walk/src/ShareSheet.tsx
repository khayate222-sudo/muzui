import { useRef, useState } from "react";
import { Check, Copy, Share2 } from "lucide-react";
import type { Invitation } from "../shared/invitations";
import { shareInvitation, shareUrl } from "./sharing";
import Modal from "./Modal";
export default function ShareSheet({
  target,
  title,
  close,
}: {
  target: Invitation;
  title: string;
  close: () => void;
}) {
  const [status, setStatus] = useState(""),
    input = useRef<HTMLInputElement>(null),
    url = shareUrl(target);
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(
    new URL(url).hostname,
  );
  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setStatus("リンクをコピーしました");
    } catch {
      input.current?.focus();
      input.current?.select();
      setStatus("リンクを選択しました。コピーして送ってください");
    }
  }
  async function share() {
    try {
      const result = await shareInvitation(title, url);
      if (result !== "cancelled")
        setStatus(
          result === "copied"
            ? "リンクをコピーしました"
            : "共有メニューを開きました",
        );
    } catch {
      setStatus("共有メニューを開けませんでした。リンクをコピーできます");
    }
  }
  return (
    <Modal title="この場所に招待" close={close}>
      <div className="share-sheet">
        <span className="share-symbol">
          <Share2 size={26} />
        </span>
        <h2>{title}</h2>
        <p>同じ「好き」がある場所で、待ち合わせ。</p>
        <label>
          招待リンク
          <input
            ref={input}
            aria-label="招待リンク"
            value={url}
            readOnly
            onClick={(e) => e.currentTarget.select()}
          />
        </label>
        <div className="share-buttons">
          <button className="outline" onClick={() => void copy()}>
            <Copy size={17} />
            リンクをコピー
          </button>
          <button className="primary" onClick={() => void share()}>
            <Share2 size={17} />
            共有する
          </button>
        </div>
        {local && (
          <p className="fineprint">
            このリンクはこの端末用です。別の端末への招待には公開サーバーのURLが必要です。
          </p>
        )}
        {status && (
          <p className="share-status" role="status">
            <Check size={16} />
            {status}
          </p>
        )}
      </div>
    </Modal>
  );
}
