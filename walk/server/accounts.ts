import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import type { Store } from "./db";
import {
  handleSchema,
  passwordSchema,
  type AccountSummary,
} from "../shared/accounts";
import { legalConfiguration, type LegalConfiguration } from "../shared/release";
import {
  digest,
  hashPassword,
  verifyPassword,
  dummyPassword,
  recoveryCode,
  recoveryDigest,
  sameDigest,
} from "./passwords";
export type Session = {
  tokenHash: string;
  userId: string;
  isAdmin: boolean;
  expiresAt: number;
  createdAt: number;
  adminExpiresAt?: number;
};
type Account = {
  user_id: string;
  handle: string;
  password_hash: string;
  recovery_hash: string;
  policy_version: string;
  accepted_at: number;
  created_at: number;
  updated_at: number;
};
type Context = {
  app: FastifyInstance;
  store: Store;
  secureCookie: boolean;
  legal?: LegalConfiguration;
  disconnect: (userId: string, tokenHash?: string) => void;
  removeUser: (userId: string) => Promise<void>;
  guest: (req: FastifyRequest, reply: FastifyReply) => unknown;
};
export const anonymousAccountRoutes = new Set([
  "/api/auth/login",
  "/api/auth/recover",
  "/api/auth/guest",
  "/api/public/legal",
]);
export function accounts({
  app,
  store: { sqlite },
  secureCookie,
  legal = legalConfiguration(process.env),
  disconnect,
  removeUser,
  guest,
}: Context) {
  const read = (id: string) =>
    sqlite.prepare("SELECT * FROM accounts WHERE user_id=?").get(id) as
      | Account
      | undefined;
  const byHandle = (handle: string) =>
    sqlite.prepare("SELECT * FROM accounts WHERE handle=?").get(handle) as
      | Account
      | undefined;
  const tokenOf = (req: FastifyRequest) =>
    /^Bearer ([a-f0-9]{64})$/.exec(req.headers.authorization || "")?.[1] ||
    req.cookies.walk_session;
  const currentHash = (req: FastifyRequest) => {
    const token = tokenOf(req);
    return token ? digest(token) : "";
  };
  function summary(id: string): AccountSummary {
    const account = read(id),
      suspension = sqlite
        .prepare(
          "SELECT reason,suspended_at AS since FROM user_moderation WHERE user_id=?",
        )
        .get(id) as AccountSummary["suspension"];
    const queries = [
      "SELECT 1 FROM posts WHERE owner_id=?",
      "SELECT 1 FROM favorites WHERE user_id=?",
      "SELECT 1 FROM reactions WHERE user_id=?",
      "SELECT 1 FROM rooms WHERE owner_id=?",
      "SELECT 1 FROM user_worlds WHERE owner_id=?",
      "SELECT 1 FROM activities WHERE user_id=?",
      "SELECT 1 FROM messages WHERE sender_id=?",
      "SELECT 1 FROM friendships WHERE requester_id=? OR receiver_id=?",
      "SELECT 1 FROM media_uploads WHERE owner_id=?",
    ];
    return {
      suspension: suspension || null,
      registered: !!account,
      handle: account?.handle || null,
      guestHasData:
        !account &&
        queries.some(
          (q) =>
            !!sqlite
              .prepare(q + " LIMIT 1")
              .get(...(q.includes(" OR ") ? [id, id] : [id])),
        ),
      sessions: (
        sqlite
          .prepare(
            "SELECT COUNT(*) AS n FROM sessions WHERE user_id=? AND expires_at>?",
          )
          .get(id, Date.now()) as { n: number }
      ).n,
    };
  }
  const native = (req: FastifyRequest) => req.headers["x-walk-native"] === "1";
  function issue(req: FastifyRequest, reply: FastifyReply, id: string) {
    const token = randomBytes(32).toString("hex"),
      createdAt = Date.now(),
      expiresAt = createdAt + 30 * 86400000;
    sqlite
      .prepare(
        "INSERT INTO sessions (token_hash,user_id,expires_at,is_admin,created_at) VALUES (?,?,?,0,?)",
      )
      .run(digest(token), id, expiresAt, createdAt);
    if (!native(req))
      reply.setCookie("walk_session", token, {
        httpOnly: true,
        sameSite: "strict",
        secure: secureCookie,
        path: "/",
        maxAge: 30 * 86400,
      });
    return { ok: true as const, ...(native(req) ? { token } : {}), expiresAt };
  }
  function revokeCurrent(req: FastifyRequest) {
    const key = currentHash(req);
    if (!key) return;
    const old = sqlite
      .prepare("SELECT user_id FROM sessions WHERE token_hash=?")
      .get(key) as { user_id: string } | undefined;
    sqlite.prepare("DELETE FROM sessions WHERE token_hash=?").run(key);
    if (old) disconnect(old.user_id, key);
  }
  function clearCookie(reply: FastifyReply) {
    reply.clearCookie("walk_session", {
      httpOnly: true,
      sameSite: "strict",
      secure: secureCookie,
      path: "/",
    });
  }
  function attempt(req: FastifyRequest, handle: string) {
    const now = Date.now();
    sqlite.prepare("DELETE FROM auth_attempts WHERE resets_at<=?").run(now);
    return sqlite.transaction(() => {
      const keys = [
        { bucket: digest("ip:" + req.ip), max: 30 },
        { bucket: digest("handle:" + handle), max: 15 },
      ];
      for (const k of keys) {
        const row = sqlite
          .prepare("SELECT attempts FROM auth_attempts WHERE bucket=?")
          .get(k.bucket) as { attempts: number } | undefined;
        if ((row?.attempts || 0) >= k.max) return false;
      }
      for (const k of keys)
        sqlite
          .prepare(
            "INSERT INTO auth_attempts VALUES (?,1,?) ON CONFLICT(bucket) DO UPDATE SET attempts=attempts+1",
          )
          .run(k.bucket, now + 15 * 60000);
      return true;
    })();
  }
  const rate = {
    config: {
      rateLimit: {
        max: 8,
        timeWindow: "1 minute",
        keyGenerator: (req: FastifyRequest) => req.ip,
      },
    },
  };
  const error = (reply: FastifyReply, status: number, message: string) =>
    reply.code(status).send({ error: message });
  async function authenticate(
    req: FastifyRequest,
    reply: FastifyReply,
    password: unknown,
  ) {
    const p = z.string().max(128).parse(password),
      row = read(req.session!.userId);
    if (!row)
      return error(
        reply,
        409,
        "このゲストはまだアカウントに登録されていません",
      );
    if (!attempt(req, row.handle))
      return error(reply, 429, "認証の回数が多いため、15分ほど待ってください");
    if (!(await verifyPassword(p, row.password_hash)))
      return error(reply, 403, "パスワードが正しくありません");
    if (read(row.user_id)?.password_hash !== row.password_hash)
      return error(
        reply,
        409,
        "認証情報が変更されました。もう一度お試しください",
      );
    return row;
  }
  function canLeaveGuest(req: FastifyRequest, reply: FastifyReply) {
    if (req.session && summary(req.session.userId).guestHasData) {
      error(
        reply,
        409,
        "今のゲストに記録があります。先にこのゲストをアカウント登録してから、別のアカウントへログインしてください。記録は統合・削除していません。",
      );
      return false;
    }
    return true;
  }
  app.get("/api/public/legal", async () => ({
    ...legal,
    development: !legal.ready,
    publicRelease: process.env.WALK_PUBLIC_RELEASE === "true",
  }));
  app.get("/api/account", async (req) => summary(req.session!.userId));
  app.post("/api/auth/guest", rate, async (req, reply) => {
    z.object({ confirm: z.literal("新しいゲストを作成") }).parse(req.body);
    revokeCurrent(req);
    clearCookie(reply);
    return guest(req, reply);
  });
  app.post("/api/account/register", rate, async (req, reply) => {
    const p = z
        .object({
          handle: handleSchema,
          password: passwordSchema,
          policyVersion: z.literal(legal.policyVersion),
          accepted: z.literal(true),
        })
        .parse(req.body),
      id = req.session!.userId;
    if (read(id))
      return error(reply, 409, "このユーザーは既にアカウント登録されています");
    if (!attempt(req, p.handle))
      return error(reply, 429, "操作が多すぎます。15分ほど待ってください");
    if (byHandle(p.handle))
      return error(
        reply,
        409,
        "そのログインIDは使えません。別のIDを選んでください",
      );
    const passwordHash = await hashPassword(p.password),
      code = recoveryCode(),
      now = Date.now();
    const result = sqlite.transaction(() => {
      if (!sqlite.prepare("SELECT id FROM users WHERE id=?").get(id))
        return "expired";
      if (read(id) || byHandle(p.handle)) return "conflict";
      sqlite
        .prepare("INSERT INTO accounts VALUES (?,?,?,?,?,?,?,?)")
        .run(
          id,
          p.handle,
          passwordHash,
          recoveryDigest(code),
          legal.policyVersion,
          now,
          now,
          now,
        );
      sqlite.prepare("DELETE FROM sessions WHERE user_id=?").run(id);
      return "ok";
    })();
    if (result !== "ok")
      return error(
        reply,
        result === "expired" ? 401 : 409,
        "登録状態が変わりました。画面を再読み込みしてください",
      );
    disconnect(id);
    return { ...issue(req, reply, id), handle: p.handle, recoveryCode: code };
  });
  app.post("/api/auth/login", rate, async (req, reply) => {
    const p = z
      .object({ handle: handleSchema, password: z.string().max(128) })
      .parse(req.body);
    if (!attempt(req, p.handle))
      return error(reply, 429, "認証の回数が多いため、15分ほど待ってください");
    const row = byHandle(p.handle),
      valid = await verifyPassword(
        p.password,
        row?.password_hash || (await dummyPassword),
      );
    if (!row || !valid)
      return error(reply, 403, "ログインIDまたはパスワードが正しくありません");
    if (read(row.user_id)?.password_hash !== row.password_hash)
      return error(reply, 403, "ログインIDまたはパスワードが正しくありません");
    if (!canLeaveGuest(req, reply)) return;
    revokeCurrent(req);
    sqlite
      .prepare("DELETE FROM auth_attempts WHERE bucket=?")
      .run(digest("handle:" + p.handle));
    return issue(req, reply, row.user_id);
  });
  app.post("/api/auth/recover", rate, async (req, reply) => {
    const p = z
      .object({
        handle: handleSchema,
        recoveryCode: z.string().max(100),
        password: passwordSchema,
      })
      .parse(req.body);
    if (!attempt(req, p.handle))
      return error(reply, 429, "認証の回数が多いため、15分ほど待ってください");
    const row = byHandle(p.handle);
    if (!row || !sameDigest(row.recovery_hash, recoveryDigest(p.recoveryCode)))
      return error(reply, 403, "ログインIDまたは復旧コードが正しくありません");
    if (!canLeaveGuest(req, reply)) return;
    const passwordHash = await hashPassword(p.password),
      code = recoveryCode();
    if (!canLeaveGuest(req, reply)) return;
    const updated = sqlite
      .prepare(
        "UPDATE accounts SET password_hash=?,recovery_hash=?,updated_at=? WHERE user_id=? AND recovery_hash=?",
      )
      .run(
        passwordHash,
        recoveryDigest(code),
        Date.now(),
        row.user_id,
        row.recovery_hash,
      );
    if (!updated.changes)
      return error(
        reply,
        409,
        "この復旧コードは既に使われたか、更新されています",
      );
    revokeCurrent(req);
    sqlite.prepare("DELETE FROM sessions WHERE user_id=?").run(row.user_id);
    disconnect(row.user_id);
    return {
      ...issue(req, reply, row.user_id),
      recoveryCode: code,
      handle: row.handle,
    };
  });
  app.post("/api/account/credentials", rate, async (req, reply) => {
    const p = z
        .object({
          password: z.string().max(128),
          newPassword: passwordSchema.optional(),
        })
        .parse(req.body),
      row = await authenticate(req, reply, p.password);
    if (!row || !("user_id" in row)) return;
    const passwordHash = p.newPassword
        ? await hashPassword(p.newPassword)
        : row.password_hash,
      code = recoveryCode();
    const updated = sqlite
      .prepare(
        "UPDATE accounts SET password_hash=?,recovery_hash=?,updated_at=? WHERE user_id=? AND password_hash=?",
      )
      .run(
        passwordHash,
        recoveryDigest(code),
        Date.now(),
        row.user_id,
        row.password_hash,
      );
    if (!updated.changes)
      return error(
        reply,
        409,
        "認証情報が変更されました。もう一度お試しください",
      );
    sqlite.prepare("DELETE FROM sessions WHERE user_id=?").run(row.user_id);
    disconnect(row.user_id);
    return {
      ...issue(req, reply, row.user_id),
      handle: row.handle,
      recoveryCode: code,
    };
  });
  app.post("/api/account/logout", async (req, reply) => {
    revokeCurrent(req);
    clearCookie(reply);
    return { ok: true };
  });
  app.post("/api/account/logout-others", rate, async (req, reply) => {
    const row = await authenticate(
      req,
      reply,
      z.object({ password: z.string().max(128) }).parse(req.body).password,
    );
    if (!row || !("user_id" in row)) return;
    sqlite.prepare("DELETE FROM sessions WHERE user_id=?").run(row.user_id);
    disconnect(row.user_id);
    return issue(req, reply, row.user_id);
  });
  app.post("/api/account/export", rate, async (req, reply) => {
    const p = z
        .object({ password: z.string().max(128).optional() })
        .parse(req.body || {}),
      id = req.session!.userId;
    if (read(id)) {
      const authenticated = await authenticate(req, reply, p.password);
      if (!authenticated || !("user_id" in authenticated)) return;
    }
    const all = (sql: string) => sqlite.prepare(sql).all(id);
    const result = {
      version: 1,
      createdAt: Date.now(),
      profile: sqlite.prepare("SELECT * FROM users WHERE id=?").get(id),
      account: read(id)
        ? {
            handle: read(id)!.handle,
            createdAt: read(id)!.created_at,
            policyVersion: read(id)!.policy_version,
          }
        : null,
      worlds: all("SELECT id,parent_id,title,description,landscape,created_at FROM user_worlds WHERE owner_id=?"),
      posts: all("SELECT * FROM posts WHERE owner_id=?"),
      favorites: all("SELECT * FROM favorites WHERE user_id=?"),
      reactions: all("SELECT * FROM reactions WHERE user_id=?"),
      sentMessages: all(
        "SELECT id,receiver_id,content,created_at FROM messages WHERE sender_id=?",
      ),
      friendships: sqlite
        .prepare(
          "SELECT id,requester_id,receiver_id,status,created_at FROM friendships WHERE requester_id=? OR receiver_id=?",
        )
        .all(id, id),
      blocks: all("SELECT target_id,created_at FROM blocks WHERE user_id=?"),
      activities: all(
        "SELECT id,kind,title,starts_at,ends_at,finished_at,shared,note,photo IS NOT NULL AS has_photo FROM activities WHERE user_id=?",
      ),
      rooms: all(
        "SELECT id,title,description,is_public,theme,layout,updated_at FROM rooms WHERE owner_id=?",
      ),
      attachments: all(
        "SELECT id,filename,mime,bytes,created_at FROM media_uploads WHERE owner_id=?",
      ),
      reports: all(
        "SELECT target_type,target_id,reason,created_at FROM reports WHERE reporter_id=?",
      ),
    };
    reply.header(
      "Content-Disposition",
      'attachment; filename="walk-data.json"',
    );
    return result;
  });
  app.post("/api/account/delete", rate, async (req, reply) => {
    const p = z
        .object({
          confirm: z.literal("削除"),
          password: z.string().max(128).optional(),
        })
        .parse(req.body),
      id = req.session!.userId;
    if (read(id)) {
      const authenticated = await authenticate(req, reply, p.password);
      if (!authenticated || !("user_id" in authenticated)) return;
    }
    await removeUser(id);
    clearCookie(reply);
    return { ok: true };
  });
  return { summary, registered: (id: string) => !!read(id) };
}
