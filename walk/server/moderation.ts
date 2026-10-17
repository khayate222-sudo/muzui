import type { FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { Store } from "./db";
import type { ModerationReport } from "../shared/moderation";
export function moderation({
  app,
  store: { sqlite },
  changed,
}: {
  app: FastifyInstance;
  store: Store;
  changed: (id: string, suspended: boolean) => void;
}) {
  const suspended = (id: string) =>
    !!sqlite
      .prepare("SELECT user_id FROM user_moderation WHERE user_id=?")
      .get(id);
  app.get("/api/admin/reports", async () =>
    sqlite
      .prepare(
        `SELECT r.id,r.reporter_id AS reporterId,r.target_type AS targetType,r.target_id AS targetId,r.reason,r.created_at AS createdAt,r.status,r.moderation_note AS moderationNote,r.resolved_at AS resolvedAt,
 CASE WHEN r.target_type='user' THEN u.display_name ELSE p.title END AS targetLabel,CASE WHEN r.target_type='user' THEN u.id ELSE p.owner_id END AS targetUserId
 FROM reports r LEFT JOIN users u ON r.target_type='user' AND r.target_id=u.id LEFT JOIN posts p ON r.target_type='post' AND r.target_id=p.id ORDER BY r.created_at DESC`,
      )
      .all()
      .map((row) => {
        const r = row as Omit<ModerationReport, "suspended" | "targetDeleted">;
        return {
          ...r,
          targetLabel: r.targetLabel || "削除済み",
          targetDeleted: !r.targetLabel,
          suspended: !!r.targetUserId && suspended(r.targetUserId),
        };
      }),
  );
  app.patch("/api/admin/reports/:id", async (req, reply) => {
    const { status, note } = z
        .object({
          status: z.enum(["open", "resolved", "dismissed"]),
          note: z.string().trim().min(3).max(1000),
        })
        .parse(req.body),
      id = (req.params as { id: string }).id,
      row = sqlite
        .prepare("SELECT target_type,target_id FROM reports WHERE id=?")
        .get(id) as { target_type: string; target_id: string } | undefined;
    if (!row) return reply.code(404).send({ error: "通報が見つかりません" });
    sqlite.transaction(() => {
      sqlite
        .prepare(
          "UPDATE reports SET status=?,moderation_note=?,resolved_at=? WHERE id=?",
        )
        .run(status, note, status === "open" ? null : Date.now(), id);
      sqlite
        .prepare("INSERT INTO moderation_actions VALUES (?,?,?,?,?,?,?)")
        .run(
          randomUUID(),
          req.session!.userId,
          row.target_type,
          row.target_id,
          "report:" + status,
          note,
          Date.now(),
        );
    })();
    return { ok: true };
  });
  app.post("/api/admin/users/:id/moderation", async (req, reply) => {
    const id = (req.params as { id: string }).id,
      p = z
        .object({
          suspended: z.boolean(),
          reason: z.string().trim().min(3).max(1000),
        })
        .parse(req.body);
    if (p.suspended && id === req.session!.userId)
      return reply
        .code(409)
        .send({ error: "操作中の管理者自身を利用停止にはできません" });
    if (!sqlite.prepare("SELECT id FROM users WHERE id=?").get(id))
      return reply.code(404).send({ error: "対象が見つかりません" });
    sqlite.transaction(() => {
      if (p.suspended)
        sqlite
          .prepare(
            "INSERT INTO user_moderation VALUES (?,?,?) ON CONFLICT(user_id) DO UPDATE SET reason=excluded.reason,suspended_at=excluded.suspended_at",
          )
          .run(id, p.reason, Date.now());
      else
        sqlite.prepare("DELETE FROM user_moderation WHERE user_id=?").run(id);
      sqlite
        .prepare("INSERT INTO moderation_actions VALUES (?,?,?,?,?,?,?)")
        .run(
          randomUUID(),
          req.session!.userId,
          "user",
          id,
          p.suspended ? "suspend" : "restore",
          p.reason,
          Date.now(),
        );
    })();
    changed(id,p.suspended);
    return { ok: true };
  });
  return { suspended };
}
