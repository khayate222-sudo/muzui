import type { FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { destinationSchema, type DestinationInvite } from "../shared/meetups";
import type { Invitation } from "../shared/invitations";
import type { PublicUser } from "../shared/community";

type Pending = {
  id: string;
  senderId: string;
  targetId: string;
  destination: Invitation;
  createdAt: number;
  expiresAt: number;
};
type Context = {
  app: FastifyInstance;
  connected: (a: string, b: string) => boolean;
  person: (id: string) => PublicUser | null;
  resolve: (
    destination: Invitation,
    userId: string,
  ) => { title: string; path: string[] } | null;
  notify: (id: string, event: string) => void;
};
export function destinationInvitations(c: Context) {
  const pending = new Map<string, Pending>();
  function refresh() {
    const changed = new Set<string>();
    for (const [id, i] of pending)
      if (
        i.expiresAt <= Date.now() ||
        !c.connected(i.senderId, i.targetId) ||
        !c.person(i.senderId) ||
        !c.resolve(i.destination, i.senderId) ||
        !c.resolve(i.destination, i.targetId)
      ) {
        pending.delete(id);
        changed.add(i.targetId);
      }
    for (const id of changed) c.notify(id, "meetups");
  }
  const timer = setInterval(refresh, 30000);
  timer.unref();
  const rate = { config: { rateLimit: { max: 8, timeWindow: "1 minute" } } };
  c.app.get("/api/meetups", async (req) => {
    refresh();
    const id = req.session!.userId;
    return [...pending.values()]
      .filter((i) => i.targetId === id)
      .flatMap((i) => {
        const from = c.person(i.senderId),
          place = c.resolve(i.destination, id);
        return from && place
          ? [
              {
                id: i.id,
                from,
                destination: { ...i.destination },
                ...place,
                createdAt: i.createdAt,
                expiresAt: i.expiresAt,
              } satisfies DestinationInvite,
            ]
          : [];
      });
  });
  c.app.post("/api/meetups", rate, async (req, reply) => {
    const p = z
        .object({ targetId: z.string().uuid(), destination: destinationSchema })
        .parse(req.body),
      me = req.session!.userId;
    refresh();
    if (
      !c.connected(me, p.targetId) ||
      !c.resolve(p.destination, me) ||
      !c.resolve(p.destination, p.targetId)
    )
      return reply
        .code(403)
        .send({
          error:
            "この相手や行き先には招待できません。公開設定とつながりを確認してください。",
        });
    if (
      [...pending.values()].some(
        (i) =>
          i.senderId === me &&
          i.targetId === p.targetId &&
          i.destination.kind === p.destination.kind &&
          i.destination.id === p.destination.id,
      )
    )
      return reply.code(409).send({ error: "この場所への招待は送信済みです" });
    if (
      pending.size >= 1000 ||
      [...pending.values()].filter((i) => i.senderId === me).length >= 12 ||
      [...pending.values()].filter((i) => i.targetId === p.targetId).length >=
        12
    )
      return reply
        .code(409)
        .send({ error: "招待が多いため、時間をおいてお試しください" });
    const id = randomUUID(),
      createdAt = Date.now();
    pending.set(id, {
      id,
      senderId: me,
      targetId: p.targetId,
      destination: p.destination,
      createdAt,
      expiresAt: createdAt + 10 * 60000,
    });
    c.notify(p.targetId, "meetups");
    return { ok: true, id };
  });
  c.app.post("/api/meetups/:id/respond", async (req, reply) => {
    const { accept } = z.object({ accept: z.boolean() }).parse(req.body),
      id = (req.params as { id: string }).id,
      me = req.session!.userId;
    refresh();
    const invite = pending.get(id);
    if (!invite || invite.targetId !== me)
      return reply
        .code(410)
        .send({
          error:
            "この招待は終了しました。期限や公開設定が変更された可能性があります。",
        });
    pending.delete(id);
    c.notify(me, "meetups");
    return { ok: true, ...(accept ? { destination: invite.destination } : {}) };
  });
  return { refresh, close: () => clearInterval(timer) };
}
