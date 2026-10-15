import { beforeEach, afterEach, it, expect } from "vitest";
import { io, type Socket } from "socket.io-client";
import { readFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../server/app";
import { digest } from "../server/passwords";
let instance: Awaited<ReturnType<typeof createApp>>,
  origin: string,
  directory: string;
const clients: Socket[] = [];
const password = "a long test passphrase";
const cookieOf = (r: { headers: Record<string, unknown> }) =>
  [r.headers["set-cookie"]]
    .flat()
    .map(String)
    .map((s) => s.split(";")[0])
    .filter((s) => s.startsWith("walk_session="))
    .at(-1) || "";
const req = (
  cookie: string,
  path: string,
  method: "GET" | "POST" | "PATCH" | "PUT" = "GET",
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
  return { cookie: cookieOf(r), id: r.json().user.id };
}
async function register(cookie: string, handle = "test_walker") {
  const r = await req(cookie, "/account/register", "POST", {
    handle,
    password,
    policyVersion: "development-2026-10",
    accepted: true,
  });
  expect(r.statusCode, r.body).toBe(200);
  return { cookie: cookieOf(r), code: r.json().recoveryCode as string };
}
async function connect(cookie: string) {
  const s = io(origin, {
    extraHeaders: { Cookie: cookie },
    reconnection: false,
  });
  clients.push(s);
  await new Promise<void>((resolve, reject) => {
    s.once("connect", resolve);
    s.once("connect_error", reject);
  });
  return s;
}
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "walk-account-test-"));
  instance = await createApp({
    database: ":memory:",
    adminKey: "account-tests-admin-key",
    mediaDirectory: directory,
  });
  origin = await instance.app.listen({ port: 0, host: "127.0.0.1" });
});
afterEach(async () => {
  clients.splice(0).forEach((s) => s.disconnect());
  await instance.app.close();
  await rm(directory, { recursive: true, force: true });
});
it("registers the current guest in place, rotates its session, retains records and logs in on another device", async () => {
  const a = await guest();
  await req(a.cookie, "/profile", "PATCH", {
    displayName: "引き継ぐ人",
    color: "#112233",
    style: "fox",
    shareActivity: true,
  });
  await req(a.cookie, "/favorites/text-0-0", "PUT", { saved: true });
  const oldSocket = await connect(a.cookie),
    registered = await register(a.cookie);
  await new Promise<void>((resolve) =>
    oldSocket.connected
      ? oldSocket.once("disconnect", () => resolve())
      : resolve(),
  );
  const boot = (await req(registered.cookie, "/bootstrap")).json();
  expect(boot.user.id).toBe(a.id);
  expect(boot.favorites).toContain("text-0-0");
  expect(boot.account.handle).toBe("test_walker");
  expect((await req(a.cookie, "/bootstrap")).statusCode).toBe(401);
  const b = await guest(),
    login = await req(b.cookie, "/auth/login", "POST", {
      handle: "TEST_WALKER",
      password,
    });
  expect(login.statusCode).toBe(200);
  const logged = (await req(cookieOf(login), "/bootstrap")).json();
  expect(logged.user.id).toBe(a.id);
  expect(logged.user.style).toBe("fox");
  expect(logged.favorites).toContain("text-0-0");
  const row = instance.store.sqlite
    .prepare("SELECT * FROM accounts")
    .get() as Record<string, unknown>;
  expect(row.password_hash).not.toBe(password);
  expect(JSON.stringify(row)).not.toContain(registered.code);
  expect((await req(cookieOf(login), "/account")).json().sessions).toBe(2);
});
it("never silently replaces a guest with saved data or accepts a stale policy", async () => {
  const a = await guest(),
    registered = await register(a.cookie),
    b = await guest();
  await req(b.cookie, "/favorites/text-0-0", "PUT", { saved: true });
  const r = await req(b.cookie, "/auth/login", "POST", {
    handle: "test_walker",
    password,
  });
  expect(r.statusCode).toBe(409);
  expect((await req(b.cookie, "/bootstrap")).json().user.id).toBe(b.id);
  const wrong = await req(b.cookie, "/account/register", "POST", {
    handle: "another_walker",
    password,
    policyVersion: "old",
    accepted: true,
  });
  expect(wrong.statusCode).toBe(400);
  expect((await req(registered.cookie, "/account")).json().registered).toBe(
    true,
  );
});
it("uses a one-time recovery code and immediately revokes all previous devices", async () => {
  const a = await guest(),
    registered = await register(a.cookie),
    socket = await connect(registered.cookie);
  const recovered = await req("", "/auth/recover", "POST", {
    handle: "test_walker",
    recoveryCode: registered.code,
    password: "replacement long passphrase",
  });
  expect(recovered.statusCode, recovered.body).toBe(200);
  expect(recovered.json().recoveryCode).not.toBe(registered.code);
  await new Promise<void>((resolve) =>
    socket.connected ? socket.once("disconnect", () => resolve()) : resolve(),
  );
  expect((await req(registered.cookie, "/activities")).statusCode).toBe(401);
  expect(
    (
      await req("", "/auth/recover", "POST", {
        handle: "test_walker",
        recoveryCode: registered.code,
        password,
      })
    ).statusCode,
  ).toBe(403);
  expect(
    (await req("", "/auth/login", "POST", { handle: "test_walker", password }))
      .statusCode,
  ).toBe(403);
  expect(
    (
      await req("", "/auth/login", "POST", {
        handle: "test_walker",
        password: "replacement long passphrase",
      })
    ).statusCode,
  ).toBe(200);
});
it("requires reauthentication to export private data, change credentials, or log out other devices", async () => {
  const a = await guest(),
    registered = await register(a.cookie);
  await req(registered.cookie, "/activities", "POST", {
    kind: "study",
    title: "非公開の勉強",
    endsAt: Date.now() + 3600000,
    shared: false,
    note: "秘密のメモ",
  });
  expect(
    (
      await req(registered.cookie, "/account/export", "POST", {
        password: "wrong",
      })
    ).statusCode,
  ).toBe(403);
  const data = await req(registered.cookie, "/account/export", "POST", {
    password,
  });
  expect(data.statusCode).toBe(200);
  expect(data.json().activities[0].note).toBe("秘密のメモ");
  expect(data.body).not.toMatch(
    /password_hash|recovery_hash|token_hash|is_admin/,
  );
  const changed = await req(registered.cookie, "/account/credentials", "POST", {
    password,
    newPassword: "a new longer password",
  });
  expect(changed.statusCode).toBe(200);
  expect((await req(registered.cookie, "/bootstrap")).statusCode).toBe(401);
  const updatedCookie = cookieOf(changed),
    other = await req("", "/auth/login", "POST", {
      handle: "test_walker",
      password: "a new longer password",
    });
  const otherSocket = await connect(cookieOf(other));
  const out = await req(updatedCookie, "/account/logout-others", "POST", {
    password: "a new longer password",
  });
  expect(out.statusCode).toBe(200);
  await new Promise<void>((resolve) =>
    otherSocket.connected
      ? otherSocket.once("disconnect", () => resolve())
      : resolve(),
  );
  expect((await req(cookieOf(out), "/account")).json().sessions).toBe(1);
  expect((await req(cookieOf(other), "/bootstrap")).statusCode).toBe(401);
});
it("deletes owned data, attachments, chat, rooms and ghosts, and moves a room visitor back to the station", async () => {
  const a = await guest(),
    registered = await register(a.cookie),
    b = await guest(),
    db = instance.store.sqlite;
  await req(registered.cookie, "/activities", "POST", {
    kind: "gym",
    title: "活動中",
    endsAt: Date.now() + 3600000,
    shared: true,
    note: "",
  });
  const image = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aN1cAAAAASUVORK5CYII=",
      "base64",
    ),
    body = Buffer.concat([
      Buffer.from(
        '--test\r\nContent-Disposition: form-data; name="file"; filename="photo.png"\r\nContent-Type: image/png\r\n\r\n',
      ),
      image,
      Buffer.from("\r\n--test--\r\n"),
    ]);
  const upload = await instance.app.inject({
    url: "/api/uploads",
    method: "POST",
    headers: {
      cookie: registered.cookie,
      "x-walk-client": "1",
      "content-type": "multipart/form-data; boundary=test",
    },
    payload: body,
  });
  expect(upload.statusCode).toBe(200);
  const media = upload.json();
  const post = await req(registered.cookie, "/posts", "POST", {
    title: "削除する投稿",
    body: "本文",
    genre: "art",
    attachmentId: media.id,
  });
  expect(post.statusCode).toBe(200);
  await req(registered.cookie, "/favorites/" + post.json().id, "PUT", {
    saved: true,
  });
  const room = (
    await req(registered.cookie, "/rooms", "POST", {
      title: "所有する部屋",
      description: "",
      isPublic: true,
      theme: "garden",
      items: [{ postId: post.json().id, x: 1000, y: 700 }],
      decorations: [],
    })
  ).json();
  expect(room.id).toBeTruthy();
  db.prepare("INSERT INTO friendships VALUES ('friend',?,?,'accepted',?)").run(
    a.id,
    b.id,
    Date.now(),
  );
  db.prepare("INSERT INTO messages VALUES ('message',?,?,'会話',?)").run(
    a.id,
    b.id,
    Date.now(),
  );
  await req(registered.cookie, "/party/invite", "POST", { targetId: b.id });
  const inv = (await req(b.cookie, "/party")).json().invites[0];
  await req(b.cookie, "/party/respond", "POST", { id: inv.id, accept: true });
  const visitor = await connect(b.cookie);
  expect(
    (
      await visitor
        .timeout(5000)
        .emitWithAck("room:enter", { worldId: room.id })
    ).ok,
  ).toBe(true);
  expect(
    (
      await req(registered.cookie, "/account/delete", "POST", {
        confirm: "削除",
        password: "wrong",
      })
    ).statusCode,
  ).toBe(403);
  const context = new Promise<string>((resolve) =>
    visitor.on("context", (r) => {
      if (r.worldId === "public") resolve(r.worldId);
    }),
  );
  const removed = await req(registered.cookie, "/account/delete", "POST", {
    confirm: "削除",
    password,
  });
  expect(removed.statusCode, removed.body).toBe(200);
  expect(await context).toBe("public");
  expect(
    db.prepare("SELECT id FROM users WHERE id=?").get(a.id),
  ).toBeUndefined();
  for (const table of [
    "accounts",
    "activities",
    "media_uploads",
    "rooms",
    "messages",
    "friendships",
  ])
    expect(
      (db.prepare("SELECT COUNT(*) AS n FROM " + table).get() as { n: number })
        .n,
    ).toBe(0);
  expect((await instance.app.inject({ url: media.url })).statusCode).toBe(404);
  await expect(
    readFile(join(directory, media.url.split("/").at(-1))),
  ).rejects.toThrow();
  expect((await req(b.cookie, "/party")).json().party.ownerId).toBe(b.id);
  expect(db.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
});
it("supports native login and recovery after token expiry, protects web origins, and renews active accounts", async () => {
  const a = await guest(),
    registered = await register(a.cookie),
    token = registered.cookie.split("=")[1];
  instance.store.sqlite
    .prepare("UPDATE sessions SET expires_at=? WHERE token_hash=?")
    .run(Date.now() + 1000, digest(token));
  const renewed = await req(registered.cookie, "/bootstrap");
  expect(renewed.statusCode).toBe(200);
  expect(
    (
      instance.store.sqlite
        .prepare("SELECT expires_at FROM sessions WHERE token_hash=?")
        .get(digest(token)) as { expires_at: number }
    ).expires_at,
  ).toBeGreaterThan(Date.now() + 29 * 86400000);
  const native = await instance.app.inject({
    url: "/api/auth/login",
    method: "POST",
    headers: {
      authorization: "Bearer " + "a".repeat(64),
      "x-walk-client": "1",
      "x-walk-native": "1",
      origin: "capacitor://localhost",
    },
    payload: { handle: "test_walker", password },
  });
  expect(native.statusCode, native.body).toBe(200);
  expect(native.json().token).toMatch(/^[a-f0-9]{64}$/);
  expect(native.headers["set-cookie"]).toBeUndefined();
  expect(
    (
      await instance.app.inject({
        url: "/api/auth/login",
        method: "POST",
        headers: { "x-walk-client": "1", origin: "https://evil.example" },
        payload: { handle: "test_walker", password },
      })
    ).statusCode,
  ).toBe(403);
  await req(registered.cookie, "/account/logout", "POST", {});
  expect((await req(registered.cookie, "/bootstrap")).statusCode).toBe(401);
  // An expired cookie must not turn the app shell into an API error page.
  expect((await instance.app.inject({url:'/',headers:{cookie:registered.cookie}})).statusCode).toBe(404);
  expect((await req("", "/public/legal")).statusCode).toBe(200);
});
it("persists throttling across requests and prevents cookie changes from evading login attempt limits", async () => {
  const a = await guest();
  await register(a.cookie);
  for (let i = 0; i < 8; i++)
    await req("", "/auth/login", "POST", {
      handle: "test_walker",
      password: "wrong",
    });
  expect(
    (await req("", "/auth/login", "POST", { handle: "test_walker", password }))
      .statusCode,
  ).toBe(429);
  expect((await req("", "/account/export", "POST", {})).statusCode).toBe(401);
  expect(
    (await req("", "/account/delete", "POST", { confirm: "削除" })).statusCode,
  ).toBe(401);
});
it("counts private activity photos in the same storage allowance as post attachments", async () => {
  const a = await guest();
  const activity = (
    await req(a.cookie, "/activities", "POST", {
      kind: "study",
      title: "写真の上限",
      endsAt: Date.now() + 3600000,
      shared: false,
      note: "",
    })
  ).json();
  // A metadata fixture simulates a full media allocation without creating a 200MB test file.
  instance.store.sqlite
    .prepare("INSERT INTO media_uploads VALUES (?,?,?,?,?,?)")
    .run(
      "quota-fixture",
      a.id,
      "22222222-2222-4222-8222-222222222222.png",
      "image/png",
      200 * 1024 * 1024,
      Date.now(),
    );
  const image = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aN1cAAAAASUVORK5CYII=",
    "base64",
  );
  const body = Buffer.concat([
    Buffer.from(
      '--quota\r\nContent-Disposition: form-data; name="file"; filename="p.png"\r\nContent-Type: image/png\r\n\r\n',
    ),
    image,
    Buffer.from("\r\n--quota--\r\n"),
  ]);
  const photo = await instance.app.inject({
    url: "/api/activities/" + activity.id + "/photo",
    method: "POST",
    headers: {
      cookie: a.cookie,
      "x-walk-client": "1",
      "content-type": "multipart/form-data; boundary=quota",
    },
    payload: body,
  });
  expect(photo.statusCode).toBe(409);
  expect(
    (
      instance.store.sqlite
        .prepare("SELECT photo FROM activities WHERE id=?")
        .get(activity.id) as { photo: unknown }
    ).photo,
  ).toBeNull();
});
