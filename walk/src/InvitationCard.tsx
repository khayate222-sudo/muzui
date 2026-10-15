import { ArrowRight, Link } from "lucide-react";
import type { Bootstrap } from "../shared/model";
import { findPlace, pathTo, postWorld } from "../shared/worlds";
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
  go: () => void;
  close: () => void;
}) {
  const post =
      target.kind === "post"
        ? data.posts.find((p) => p.id === target.id)
        : undefined,
    place = findPlace(post ? postWorld(post) : target.id);
  const valid = target.kind === "post" ? !!post : !!place;
  return (
    <Modal title="WALKへの招待" close={close}>
      <div className="invitation-card">
        <span className="sheet-eyebrow">
          <Link size={15} /> MEET ME HERE
        </span>
        {place && <PlaceIllustration place={place} />}
        <h2>
          {valid
            ? post?.title || place?.title
            : "この行き先は見つかりませんでした"}
        </h2>
        <p>
          {valid
            ? pathTo(place?.id || "")
                .map((p) => p.title)
                .join(" › ")
            : "削除された投稿や、現在公開されていない場所の可能性があります。"}
        </p>
        {valid && (
          <>
            <p>移動してから、同じ場所の人や投稿を見ることができます。</p>
            <button className="primary full" disabled={!connected} onClick={go}>
              {connected ? "この場所へ行く" : "接続しています…"}
              <ArrowRight size={18} />
            </button>
          </>
        )}
      </div>
    </Modal>
  );
}
