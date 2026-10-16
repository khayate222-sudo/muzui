import { unlink } from "node:fs/promises";
import { join } from "node:path";
import type { Store } from "./db";
export function dataManagement({
  store: { sqlite },
  mediaDirectory,
  leaveCommunity,
  evictRooms,
  disconnect,
  changed,
}: {
  store: Store;
  mediaDirectory: string;
  leaveCommunity: (id: string) => void;
  evictRooms: () => void;
  disconnect: (id: string) => void;
  changed: () => void;
}) {
  let cleaning = false;
  async function clean() {
    if (cleaning || !sqlite.open) return;
    cleaning = true;
    try {
      const files = sqlite
        .prepare("SELECT filename FROM media_cleanup LIMIT 100")
        .all() as { filename: string }[];
      for (const f of files) {
        if (!/^[a-f0-9-]{36}\.(png|jpg|webp|gif|mp4|webm)$/.test(f.filename))
          continue;
        try {
          await unlink(join(mediaDirectory, f.filename));
        } catch (e) {
          if (!(e instanceof Error && "code" in e && e.code === "ENOENT"))
            continue;
        }
        if (sqlite.open)
          sqlite
            .prepare("DELETE FROM media_cleanup WHERE filename=?")
            .run(f.filename);
      }
    } finally {
      cleaning = false;
    }
  }
  async function removeUser(id: string) {
    sqlite.transaction(() => {
      leaveCommunity(id);
      const files = sqlite
        .prepare("SELECT filename FROM media_uploads WHERE owner_id=?")
        .all(id) as { filename: string }[];
      for (const f of files) {
        sqlite
          .prepare("INSERT OR IGNORE INTO media_cleanup VALUES (?,?)")
          .run(f.filename, Date.now());
        sqlite
          .prepare(
            "UPDATE posts SET media_url='',type=CASE WHEN type IN ('image','video') THEN 'text' ELSE type END WHERE media_url=? AND (owner_id IS NULL OR owner_id<>?)",
          )
          .run("/media/" + f.filename, id);
      }
      sqlite
        .prepare(
          "DELETE FROM moderation_actions WHERE (target_type='user' AND target_id=?) OR (target_type='post' AND target_id IN (SELECT id FROM posts WHERE owner_id=?))",
        )
        .run(id, id);
      sqlite
        .prepare(
          "DELETE FROM reports WHERE reporter_id=? OR (target_type='user' AND target_id=?) OR (target_type='post' AND target_id IN (SELECT id FROM posts WHERE owner_id=?))",
        )
        .run(id, id, id);
      sqlite
        .prepare("DELETE FROM messages WHERE sender_id=? OR receiver_id=?")
        .run(id, id);
      sqlite
        .prepare(
          "DELETE FROM friendships WHERE requester_id=? OR receiver_id=?",
        )
        .run(id, id);
      sqlite
        .prepare("DELETE FROM blocks WHERE user_id=? OR target_id=?")
        .run(id, id);
      sqlite.prepare("DELETE FROM activities WHERE user_id=?").run(id);
      sqlite.prepare("DELETE FROM rooms WHERE owner_id=?").run(id);
      sqlite.prepare("DELETE FROM posts WHERE owner_id=?").run(id);
      sqlite.prepare("DELETE FROM media_uploads WHERE owner_id=?").run(id);
      // Keep other residents' posts when their host leaves. Each branch below
      // an owned world has the same owner (enforced by world creation).
      sqlite.prepare("UPDATE posts SET world_id=NULL WHERE world_id IN (SELECT id FROM user_worlds WHERE owner_id=?)").run(id);
      sqlite.prepare("DELETE FROM user_worlds WHERE owner_id=?").run(id);
      sqlite.prepare("DELETE FROM users WHERE id=?").run(id);
    })();
    disconnect(id);
    evictRooms();
    changed();
    await clean();
  }
  return { removeUser, clean };
}
