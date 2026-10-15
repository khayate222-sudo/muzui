import { beforeEach, afterEach, it, expect } from "vitest";
import { io, type Socket } from "socket.io-client";
import { createApp } from "../server/app";
import { digest } from "../server/passwords";
let instance: Awaited<ReturnType<typeof createApp>>, origin: string;
const clients: Socket[] = [];
const req = (
  cookie: string,
  path: string,
  method: "GET" | "POST" | "PUT" | "PATCH" = "GET",
  body?: object,
) =>
  instance.app.inject({
    url: "/api" + path,
    method,
    headers: { cookie, "x-walk-client": "1" },
    payload: body,
  });
async function guest() {
  const r = await req("", "/bootstrap");
  return {
    cookie: String(r.headers["set-cookie"]).split(";")[0],
    id: r.json().user.id,
  };
}
const admin = async (cookie: string) => {
  expect(
    (
      await req(cookie, "/admin/login", "POST", {
        key: "moderation-test-admin-key",
      })
    ).statusCode,
  ).toBe(200);
};
beforeEach(async () => {
  instance = await createApp({
    database: ":memory:",
    adminKey: "moderation-test-admin-key",
  });
  origin = await instance.app.listen({ port: 0, host: "127.0.0.1" });
});
afterEach(async () => {
  clients.splice(0).forEach((s) => s.disconnect());
  await instance.app.close();
});
it("restricts moderation to admins, keeps an audit trail, and records resolution separately from banning", async () => {
  const a = await guest(),
    b = await guest();
  await req(b.cookie, "/reports", "POST", {
    targetType: "user",
    targetId: a.id,
    reason: "確認が必要なユーザーです",
  });
  expect((await req(b.cookie, "/admin/reports")).statusCode).toBe(403);
  await admin(b.cookie);
  const r = (await req(b.cookie, "/admin/reports")).json()[0];
  expect(r.status).toBe("open");
  expect(r.targetUserId).toBe(a.id);
  expect(
    (
      await req(a.cookie, "/admin/reports/" + r.id, "PATCH", {
        status: "resolved",
        note: "対応した",
      })
    ).statusCode,
  ).toBe(403);
  expect(
    (
      await req(b.cookie, "/admin/reports/" + r.id, "PATCH", {
        status: "resolved",
        note: "内容を確認して対応した",
      })
    ).statusCode,
  ).toBe(200);
  expect((await req(b.cookie, "/admin/reports")).json()[0].status).toBe(
    "resolved",
  );
  expect(
    (await req(a.cookie, "/bootstrap")).json().account.suspension,
  ).toBeNull();
  expect(
    (
      instance.store.sqlite
        .prepare("SELECT COUNT(*) AS n FROM moderation_actions")
        .get() as { n: number }
    ).n,
  ).toBe(1);
});
it("suspends sockets, hides content and rooms, blocks actions, retains data access and restores access on appeal", async () => {
  const a = await guest(),
    b = await guest();
  await admin(b.cookie);
  const post = (
    await req(a.cookie, "/posts", "POST", {
      title: "検証投稿",
      body: "本文",
      genre: "art",
      attachmentId: null,
    })
  ).json();
  await req(a.cookie, "/favorites/" + post.id, "PUT", { saved: true });
  const room = (
    await req(a.cookie, "/rooms", "POST", {
      title: "公開の部屋",
      description: "",
      isPublic: true,
      theme: "garden",
      items: [{ postId: post.id, x: 1000, y: 700 }],
      decorations: [],
    })
  ).json();
  const socket = io(origin, {
    extraHeaders: { Cookie: a.cookie },
    reconnection: false,
  });
  clients.push(socket);
  await new Promise<void>((resolve, reject) => {
    socket.once("connect", resolve);
    socket.once("connect_error", reject);
  });
  expect(
    (
      await req(b.cookie, "/admin/users/" + a.id + "/moderation", "POST", {
        suspended: true,
        reason: "投稿内容の確認のため停止しています",
      })
    ).statusCode,
  ).toBe(200);
  await new Promise<void>((resolve) =>
    socket.connected ? socket.once("disconnect", () => resolve()) : resolve(),
  );
  expect(
    (await req(a.cookie, "/bootstrap")).json().account.suspension.reason,
  ).toContain("投稿内容");
  expect(
    (await req(b.cookie, "/bootstrap"))
      .json()
      .posts.some((p: { id: string }) => p.id === post.id),
  ).toBe(false);
  expect(
    (await req(b.cookie, "/rooms"))
      .json()
      .some((r: { id: string }) => r.id === room.id),
  ).toBe(false);
  expect(
    (
      await req(a.cookie, "/posts", "POST", {
        title: "別の投稿",
        body: "",
        genre: "art",
        attachmentId: null,
      })
    ).statusCode,
  ).toBe(403);
  const exported = await req(a.cookie, "/account/export", "POST", {});
  expect(exported.statusCode).toBe(200);
  expect(exported.json().posts[0].id).toBe(post.id);
  expect(
    (
      await req(b.cookie, "/admin/users/" + a.id + "/moderation", "POST", {
        suspended: false,
        reason: "内容を確認して再開しました",
      })
    ).statusCode,
  ).toBe(200);
  expect(
    (await req(b.cookie, "/bootstrap"))
      .json()
      .posts.some((p: { id: string }) => p.id === post.id),
  ).toBe(true);
  expect((await req(a.cookie, "/account")).json().suspension).toBeNull();
  expect(
    (
      await req(b.cookie, "/admin/users/" + b.id + "/moderation", "POST", {
        suspended: true,
        reason: "自分を停止する",
      })
    ).statusCode,
  ).toBe(409);
});
it("expires privileged admin access without deleting the user session", async () => {
  const a = await guest();
  await admin(a.cookie);
  instance.store.sqlite
    .prepare("UPDATE sessions SET admin_expires_at=? WHERE token_hash=?")
    .run(Date.now() - 1, digest(a.cookie.split("=")[1]));
  expect((await req(a.cookie, "/admin/reports")).statusCode).toBe(403);
  expect((await req(a.cookie, "/bootstrap")).statusCode).toBe(200);
});
