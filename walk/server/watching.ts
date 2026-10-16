import type { Server, Socket } from "socket.io";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { PublicUser } from "../shared/community";
import type {
  WatchingState,
  WatchingGroup,
  WatchingInvite,
} from "../shared/watching";

type Member = { userId: string; socketId: string };
type Group = {
  id: string;
  hostId: string;
  postId: string;
  source: string;
  members: Member[];
  playback: WatchingGroup["playback"];
};
type Invite = {
  id: string;
  groupId: string;
  targetId: string;
  expiresAt: number;
};
type Context = {
  io: Server;
  viewer: (
    socketId: string,
  ) => { userId: string; postId: string | null } | null;
  person: (id: string) => PublicUser | null;
  video: (
    postId: string,
  ) => { id: string; title: string; source: string } | null;
  connected: (a: string, b: string) => boolean;
  blocked: (a: string, b: string) => boolean;
};
export function synchronizedWatching(c: Context) {
  const groups = new Map<string, Group>(),
    invites = new Map<string, Invite>();
  const memberGroup = (userId: string) =>
    [...groups.values()].find((g) =>
      g.members.some((m) => m.userId === userId),
    );
  const snapshot = (socketId: string, notice?: string): WatchingState => {
    const me = c.viewer(socketId),
      group =
        me &&
        [...groups.values()].find((g) =>
          g.members.some((m) => m.socketId === socketId),
        );
    const pending: WatchingInvite[] = me
      ? [...invites.values()]
          .filter((i) => i.targetId === me.userId)
          .flatMap((i) => {
            const g = groups.get(i.groupId),
              from = g && c.person(g.hostId),
              post = g && c.video(g.postId);
            return g && from && post
              ? [
                  {
                    id: i.id,
                    groupId: i.groupId,
                    expiresAt: i.expiresAt,
                    from,
                    post: { id: post.id, title: post.title },
                  },
                ]
              : [];
          })
      : [];
    return {
      group: group
        ? {
            id: group.id,
            hostId: group.hostId,
            postId: group.postId,
            members: group.members.flatMap((m) => {
              const u = c.person(m.userId);
              return u ? [u] : [];
            }),
            playback: { ...group.playback },
          }
        : null,
      invites: pending,
      serverNow: Date.now(),
      ...(notice ? { notice } : {}),
    };
  };
  const emit = (id: string, notice?: string) =>
    c.io.to(id).emit("watching:state", snapshot(id, notice));
  const emitAll = () => {
    for (const id of c.io.sockets.sockets.keys()) emit(id);
  };
  function end(g: Group) {
    groups.delete(g.id);
    for (const [id, i] of invites) if (i.groupId === g.id) invites.delete(id);
  }
  function leave(socketId: string) {
    const g = [...groups.values()].find((g) =>
      g.members.some((m) => m.socketId === socketId),
    );
    if (!g) return false;
    if (g.members.find((m) => m.socketId === socketId)?.userId === g.hostId)
      end(g);
    else g.members = g.members.filter((m) => m.socketId !== socketId);
    return true;
  }
  function refresh() {
    let changed = false;
    for (const g of groups.values()) {
      const host = g.members.find((m) => m.userId === g.hostId),
        active = (m: Member) => {
          const v = c.viewer(m.socketId);
          return v?.userId === m.userId && v.postId === g.postId;
        };
      if (
        !host ||
        !active(host) ||
        c.video(g.postId)?.source !== g.source ||
        g.members.some((m, i) =>
          g.members.slice(i + 1).some((n) => c.blocked(m.userId, n.userId)),
        )
      ) {
        end(g);
        changed = true;
        continue;
      }
      const valid = g.members.filter((m) => active(m));
      if (valid.length !== g.members.length) {
        g.members = valid;
        changed = true;
      }
    }
    for (const [id, i] of invites) {
      const g = groups.get(i.groupId);
      if (
        i.expiresAt <= Date.now() ||
        !g ||
        !c.connected(g.hostId, i.targetId) ||
        g.members.some((m) => c.blocked(m.userId, i.targetId))
      ) {
        invites.delete(id);
        changed = true;
      }
    }
    if (changed) emitAll();
  }
  const timer = setInterval(() => {
    refresh();
    for (const g of groups.values())
      if (g.playback.playing) for (const m of g.members) emit(m.socketId);
  }, 2000);
  timer.unref();
  function attach(socket: Socket, userId: string) {
    const last = new Map<string, number>();
    const handle = (
      event: string,
      ms: number,
      action: (data: unknown) => string | void,
    ) =>
      socket.on("watching:" + event, (data, ack) => {
        if (typeof ack !== "function") return;
        refresh();
        const now = Date.now();
        if (now - (last.get(event) || 0) < ms)
          return ack({ ok: false, error: "少し待ってから操作してください" });
        last.set(event, now);
        const error = action(data);
        if (error) return ack({ ok: false, error });
        if (event === "control") {
          for (const m of memberGroup(userId)?.members || []) emit(m.socketId);
        } else if (event === "get") emit(socket.id);
        else emitAll();
        ack({ ok: true, state: snapshot(socket.id) });
      });
    handle("get", 250, () => {});
    handle("create", 1000, (data) => {
      const p = z
        .object({
          postId: z.string().max(80),
          consent: z.literal(true),
          position: z.number().finite().min(0).max(86400),
        })
        .safeParse(data);
      if (!p.success) return "参加内容への同意が必要です";
      if (
        c.viewer(socket.id)?.postId !== p.data.postId ||
        !c.video(p.data.postId)
      )
        return "直接投稿した動画かWALKのオリジナル映像を開いてください";
      if (memberGroup(userId))
        return "すでに同期視聴中です。参加中の端末で退出してください";
      if (groups.size >= 1000) return "いまは新しいグループを作れません";
      const id = randomUUID();
      groups.set(id, {
        id,
        hostId: userId,
        postId: p.data.postId,
        source: c.video(p.data.postId)!.source,
        members: [{ userId, socketId: socket.id }],
        playback: {
          position: p.data.position,
          playing: false,
          updatedAt: Date.now(),
          revision: 1,
        },
      });
    });
    handle("invite", 500, (data) => {
      const p = z.object({ targetId: z.string().uuid() }).safeParse(data),
        g = memberGroup(userId);
      if (
        !p.success ||
        !g ||
        g.hostId !== userId ||
        !g.members.some((m) => m.socketId === socket.id)
      )
        return "ホストだけが招待できます";
      if (
        !c.connected(userId, p.data.targetId) ||
        g.members.some((m) => c.blocked(m.userId, p.data.targetId))
      )
        return "承認済みの友達だけ招待できます";
      if (memberGroup(p.data.targetId)) return "相手はすでに同期視聴中です";
      if (
        g.members.length >= 6 ||
        [...invites.values()].filter((i) => i.groupId === g.id).length >= 12 ||
        [...invites.values()].filter((i) => i.targetId === p.data.targetId)
          .length >= 12
      )
        return "これ以上招待できません";
      if (
        [...invites.values()].some(
          (i) => i.groupId === g.id && i.targetId === p.data.targetId,
        )
      )
        return "招待は送信済みです";
      const id = randomUUID();
      invites.set(id, {
        id,
        groupId: g.id,
        targetId: p.data.targetId,
        expiresAt: Date.now() + 120000,
      });
    });
    handle("respond", 300, (data) => {
      const p = z
          .object({
            id: z.string().uuid(),
            accept: z.boolean(),
            consent: z.literal(true).optional(),
          })
          .safeParse(data),
        i = p.success ? invites.get(p.data.id) : undefined;
      if (!p.success || !i || i.targetId !== userId)
        return "招待が見つかりません";
      const g = groups.get(i.groupId)!;
      if (p.data.accept) {
        if (!p.data.consent) return "参加内容への同意が必要です";
        if (memberGroup(userId) || g.members.length >= 6)
          return "このグループには参加できません";
        if (c.viewer(socket.id)?.postId !== g.postId)
          return "招待された動画を開いてから参加してください";
        g.members.push({ userId, socketId: socket.id });
        for (const [id, pending] of invites)
          if (pending.targetId === userId) invites.delete(id);
      } else invites.delete(i.id);
    });
    handle("control", 100, (data) => {
      const p = z
          .object({
            position: z.number().finite().min(0).max(86400),
            playing: z.boolean(),
            revision: z.number().int().min(1),
          })
          .safeParse(data),
        g = memberGroup(userId);
      if (
        !p.success ||
        !g ||
        g.hostId !== userId ||
        !g.members.some((m) => m.socketId === socket.id)
      )
        return "再生操作はホストが行います";
      if (p.data.revision !== g.playback.revision)
        return "再生状態が更新されました。もう一度操作してください";
      g.playback = {
        position: p.data.position,
        playing: p.data.playing,
        updatedAt: Date.now(),
        revision: g.playback.revision + 1,
      };
    });
    handle("leave", 0, () => {
      leave(socket.id);
    });
    socket.on("disconnect", () => {
      if (leave(socket.id)) emitAll();
    });
    emit(socket.id);
  }
  return { attach, refresh, close: () => clearInterval(timer) };
}
