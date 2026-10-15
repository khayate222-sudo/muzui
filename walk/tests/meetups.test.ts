import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { io, type Socket } from "socket.io-client";
import { createApp } from "../server/app";
import type { DestinationInvite } from "../shared/meetups";
import type { WorldState } from "../shared/model";
type Guest = {
  id: string;
  cookie: string;
  socket: Socket;
  world: WorldState | null;
  location: string;
};
let instance: Awaited<ReturnType<typeof createApp>>,
  origin: string,
  a: Guest,
  b: Guest,
  c: Guest;
const clients: Socket[] = [],
  key = "destination-invites-test-admin-key";
const layout = {
  title: "待ち合わせの庭",
  description: "自分で配置したルーム",
  theme: "garden",
  isPublic: true,
  items: [],
  decorations: [],
};
const request = (
  g: Guest,
  path: string,
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE" = "GET",
  payload?: object,
) =>
  instance.app.inject({
    url: "/api" + path,
    method,
    headers: { cookie: g.cookie, "x-walk-client": "1" },
    payload,
  });
async function guest() {
  const r = await instance.app.inject({ url: "/api/bootstrap" }),
    cookie = String(r.headers["set-cookie"]).split(";")[0],
    socket = io(origin, {
      transports: ["websocket"],
      extraHeaders: { Cookie: cookie },
      forceNew: true,
      reconnection: false,
    });
  clients.push(socket);
  const g: Guest = {
    id: r.json().user.id,
    cookie,
    socket,
    world: null,
    location: "public",
  };
  socket.on("world", (w) => (g.world = w));
  socket.on("context", (w) => (g.location = w.worldId));
  await new Promise<void>((resolve, reject) => {
    socket.once("connect", resolve);
    socket.once("connect_error", reject);
  });
  return g;
}
async function friends(x: Guest, y: Guest) {
  await request(x, "/friendships", "POST", { targetId: y.id });
  const f = (await request(y, "/social"))
    .json()
    .friendships.find((f: { user: { id: string } }) => f.user.id === x.id);
  await request(y, "/friendships/" + f.id, "PATCH", { action: "accept" });
}
const inbox = async (g: Guest) =>
  (await request(g, "/meetups")).json() as DestinationInvite[];
const invite = (
  targetId: string,
  destination: DestinationInvite["destination"],
) => request(a, "/meetups", "POST", { targetId, destination });
const room = async () =>
  (await request(a, "/rooms", "POST", layout)).json() as {
    id: string;
    revision: number;
  };
async function until(f: () => boolean) {
  const started = Date.now();
  while (!f()) {
    if (Date.now() - started > 4000) throw new Error("Presence did not arrive");
    await new Promise((r) => setTimeout(r, 15));
  }
}
beforeEach(async () => {
  instance = await createApp({ database: ":memory:", adminKey: key });
  origin = await instance.app.listen({ port: 0, host: "127.0.0.1" });
  a = await guest();
  b = await guest();
  c = await guest();
});
afterEach(async () => {
  vi.restoreAllMocks();
  clients.splice(0).forEach((s) => s.disconnect());
  await instance.app.close();
});
it("requires authentication, friendship, CSRF protection and valid canonical destinations", async () => {
  expect((await instance.app.inject({ url: "/api/meetups" })).statusCode).toBe(
    401,
  );
  expect(
    (await invite(b.id, { kind: "world", id: "world:music" })).statusCode,
  ).toBe(403);
  await friends(a, b);
  expect(
    (await invite(b.id, { kind: "world", id: "https://evil.example/" }))
      .statusCode,
  ).toBe(400);
  expect(
    (await invite(b.id, { kind: "room", id: "../../admin" })).statusCode,
  ).toBe(400);
  expect((await invite(b.id, { kind: "post", id: "missing" })).statusCode).toBe(
    403,
  );
  expect(
    (
      await instance.app.inject({
        url: "/api/meetups",
        method: "POST",
        headers: {
          cookie: a.cookie,
          origin: "https://evil.example",
          "x-walk-client": "1",
        },
        payload: {
          targetId: b.id,
          destination: { kind: "world", id: "public" },
        },
      })
    ).statusCode,
  ).toBe(403);
  const sent = await invite(b.id, { kind: "world", id: "world:music" });
  expect(sent.statusCode).toBe(200);
  expect(await inbox(c)).toEqual([]);
  expect(await inbox(a)).toEqual([]);
  expect((await inbox(b))[0]).toMatchObject({
    from: { id: a.id },
    title: "音楽の世界",
    destination: { kind: "world", id: "world:music" },
  });
});
it("only delivers public rooms, scopes responses to their recipient and supports declining without movement", async () => {
  await friends(a, b);
  const r = await room();
  const sent = await invite(b.id, { kind: "room", id: r.id });
  expect(sent.statusCode).toBe(200);
  const id = sent.json().id;
  expect(
    (await request(c, "/meetups/" + id + "/respond", "POST", { accept: true }))
      .statusCode,
  ).toBe(410);
  expect(await inbox(c)).toEqual([]);
  expect(await inbox(b)).toHaveLength(1);
  expect((await invite(b.id, { kind: "room", id: r.id })).statusCode).toBe(409);
  const declined = await request(b, "/meetups/" + id + "/respond", "POST", {
    accept: false,
  });
  expect(declined.json()).toEqual({ ok: true });
  expect(await inbox(b)).toEqual([]);
  expect(b.location).toBe("public");
  await request(a, "/rooms/" + r.id, "PUT", {
    ...layout,
    isPublic: false,
    revision: 1,
  });
  expect((await invite(b.id, { kind: "room", id: r.id })).statusCode).toBe(403);
});
it("does not count an invitation or acceptance as viewing, join voice or sync, or disclose continuous sender whereabouts", async () => {
  await friends(a, b);
  const result = await invite(b.id, { kind: "post", id: "text-0-0" });
  const pending = (await inbox(b))[0];
  expect(Object.keys(pending.from).sort()).toEqual([
    "color",
    "displayName",
    "id",
    "style",
  ]);
  expect(pending).not.toHaveProperty("worldId");
  expect(b.world?.counts["text-0-0"]).toBeUndefined();
  expect(b.location).toBe("public");
  expect((await request(b, "/party")).json().party).toBeNull();
  const response = await request(
    b,
    "/meetups/" + result.json().id + "/respond",
    "POST",
    { accept: true },
  );
  expect(response.json().destination).toEqual({ kind: "post", id: "text-0-0" });
  expect(await inbox(b)).toEqual([]);
  expect(b.world?.counts["text-0-0"]).toBeUndefined();
  expect(
    (
      await b.socket
        .timeout(3000)
        .emitWithAck(
          "visit",
          response.json().destination.kind === "post"
            ? { postId: response.json().destination.id }
            : {},
        )
    ).ok,
  ).toBe(true);
  await until(() => b.world?.counts["text-0-0"] === 1);
  expect(
    (await b.socket.timeout(3000).emitWithAck("watching:get", {})).state.group,
  ).toBeNull();
  expect((await request(b, "/bootstrap")).json().user.shareActivity).toBe(
    false,
  );
});
it("invalidates a room invitation when its public access changes and rechecks access on actual travel", async () => {
  await friends(a, b);
  const r = await room(),
    sent = await invite(b.id, { kind: "room", id: r.id });
  await request(a, "/rooms/" + r.id, "PUT", {
    ...layout,
    isPublic: false,
    revision: 1,
  });
  expect(await inbox(b)).toEqual([]);
  expect(
    (
      await request(b, "/meetups/" + sent.json().id + "/respond", "POST", {
        accept: true,
      })
    ).statusCode,
  ).toBe(410);
  await request(a, "/rooms/" + r.id, "PUT", {
    ...layout,
    isPublic: true,
    revision: 2,
  });
  const again = await invite(b.id, { kind: "room", id: r.id });
  expect(
    (
      await request(b, "/meetups/" + again.json().id + "/respond", "POST", {
        accept: true,
      })
    ).statusCode,
  ).toBe(200);
  await request(a, "/rooms/" + r.id, "PUT", {
    ...layout,
    isPublic: false,
    revision: 3,
  });
  expect(
    (await b.socket.timeout(3000).emitWithAck("room:enter", { worldId: r.id }))
      .ok,
  ).toBe(false);
  expect(b.location).toBe("public");
});
it("removes pending destinations on blocking, deletion and account removal", async () => {
  await friends(a, b);
  await invite(b.id, { kind: "post", id: "text-0-0" });
  await request(c, "/admin/login", "POST", { key });
  await request(c, "/admin/posts/text-0-0", "DELETE");
  expect(await inbox(b)).toEqual([]);
  await invite(b.id, { kind: "world", id: "world:music" });
  await request(b, "/blocks/" + a.id, "PUT", { blocked: true });
  expect(await inbox(b)).toEqual([]);
  await request(b, "/blocks/" + a.id, "PUT", { blocked: false });
  await friends(a, b);
  await invite(b.id, { kind: "world", id: "world:music" });
  await request(a, "/account/delete", "POST", { confirm: "削除" });
  expect(await inbox(b)).toEqual([]);
});
it("expires invitations and limits repeated sends", async () => {
  await friends(a, b);
  const first = await invite(b.id, { kind: "world", id: "world:music" });
  expect((await inbox(b))[0].expiresAt - (await inbox(b))[0].createdAt).toBe(
    600000,
  );
  const now = Date.now(),
    clock = vi.spyOn(Date, "now").mockImplementation(() => now + 601000);
  const expired = await request(
    b,
    "/meetups/" + first.json().id + "/respond",
    "POST",
    { accept: true },
  );
  clock.mockRestore();
  expect(expired.statusCode).toBe(410);
  expect(await inbox(b)).toEqual([]);
  for (let i = 0; i < 7; i++)
    await invite(b.id, { kind: "world", id: "world:game" });
  expect(
    (await invite(b.id, { kind: "world", id: "world:music" })).statusCode,
  ).toBe(429);
});
it("keeps old owned rooms in the list and lets a public room outside the first page be resolved directly", async () => {
  const own = await room();
  instance.store.sqlite
    .prepare("UPDATE rooms SET updated_at=0 WHERE id=?")
    .run(own.id);
  const insert = instance.store.sqlite.prepare(
    "INSERT INTO rooms (id,owner_id,title,description,is_public,theme,layout,updated_at) VALUES (?,?,?,?,?,?,?,?)",
  );
  for (let n = 0; n < 103; n++)
    insert.run(
      randomUUID(),
      c.id,
      "他の公開ルーム" + n,
      "",
      1,
      "garden",
      JSON.stringify({ items: [], decorations: [] }),
      Date.now() + n,
    );
  expect((await request(a, "/rooms")).json()[0].id).toBe(own.id);
  expect(
    (await request(b, "/rooms"))
      .json()
      .some((r: { id: string }) => r.id === own.id),
  ).toBe(false);
  expect((await request(b, "/rooms/" + own.id)).json().title).toBe(
    layout.title,
  );
  expect(
    (
      await b.socket
        .timeout(3000)
        .emitWithAck("room:enter", { worldId: own.id })
    ).ok,
  ).toBe(true);
});
