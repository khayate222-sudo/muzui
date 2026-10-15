import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { io, type Socket } from "socket.io-client";
import { createApp } from "../server/app";
import { playbackPosition, type WatchingState } from "../shared/watching";
type Guest = {
  id: string;
  cookie: string;
  socket: Socket;
  state: WatchingState | null;
};
let instance: Awaited<ReturnType<typeof createApp>>,
  origin: string,
  a: Guest,
  b: Guest,
  c: Guest;
const clients: Socket[] = [];
const video = "text-0-0",
  key = "synchronized-watching-admin-key";
async function guest() {
  const boot = await instance.app.inject({ url: "/api/bootstrap" }),
    data = boot.json(),
    cookie = String(boot.headers["set-cookie"]).split(";")[0];
  const socket = io(origin, {
    transports: ["websocket"],
    extraHeaders: { Cookie: cookie },
    forceNew: true,
    reconnection: false,
  });
  clients.push(socket);
  const g: Guest = { id: data.user.id, cookie, socket, state: null };
  socket.on("watching:state", (s) => (g.state = s));
  await new Promise<void>((resolve, reject) => {
    socket.once("connect", resolve);
    socket.once("connect_error", reject);
  });
  return g;
}
const ack = (g: Guest, event: string, data: object = {}) =>
  g.socket.timeout(4000).emitWithAck(event, data) as Promise<{
    ok: boolean;
    error?: string;
    state: WatchingState;
  }>;
const request = (
  g: Guest,
  path: string,
  method: "POST" | "PUT" | "PATCH" = "POST",
  payload: object = {},
) =>
  instance.app.inject({
    url: "/api" + path,
    method,
    headers: { cookie: g.cookie, "x-walk-client": "1" },
    payload,
  });
async function friend(x: Guest, y: Guest) {
  await request(x, "/friendships", "POST", { targetId: y.id });
  const r = await instance.app.inject({
    url: "/api/social",
    headers: { cookie: y.cookie },
  });
  const f = r
    .json()
    .friendships.find((f: { user: { id: string } }) => f.user.id === x.id);
  await request(y, "/friendships/" + f.id, "PATCH", { action: "accept" });
}
async function until(fn: () => boolean) {
  const started = Date.now();
  while (!fn()) {
    if (Date.now() - started > 4000)
      throw new Error("Watching state did not arrive");
    await new Promise((r) => setTimeout(r, 15));
  }
}
async function create() {
  await ack(a, "visit", { postId: video });
  return ack(a, "watching:create", {
    postId: video,
    position: 0,
    consent: true,
  });
}
async function join() {
  await friend(a, b);
  expect((await create()).ok).toBe(true);
  await ack(a, "watching:invite", { targetId: b.id });
  await until(() => !!b.state?.invites.length);
  const id = b.state!.invites[0].id;
  await ack(b, "visit", { postId: video });
  expect(
    (await ack(b, "watching:respond", { id, accept: true, consent: true })).ok,
  ).toBe(true);
  await until(() => a.state?.group?.members.length === 2);
}
beforeEach(async () => {
  instance = await createApp({ database: ":memory:", adminKey: key });
  origin = await instance.app.listen({ host: "127.0.0.1", port: 0 });
  a = await guest();
  b = await guest();
  c = await guest();
  instance.store.sqlite
    .prepare(
      "UPDATE posts SET type='video',origin='walk',media_url=?,owner_id=? WHERE id=?",
    )
    .run("/media/11111111-1111-4111-8111-111111111111.webm", a.id, video);
});
afterEach(async () => {
  vi.restoreAllMocks();
  clients.splice(0).forEach((s) => s.disconnect());
  await instance.app.close();
});
it("requires a direct video, explicit creation/participation consent, a friendship and a recipient-specific invite", async () => {
  await ack(c, "visit", { postId: "text-0-1" });
  expect(
    (
      await ack(c, "watching:create", {
        postId: "text-0-1",
        position: 0,
        consent: true,
      })
    ).ok,
  ).toBe(false);
  await ack(b, "visit", { postId: video });
  expect(
    (await ack(b, "watching:create", { postId: video, position: 0 })).ok,
  ).toBe(false);
  expect((await create()).ok).toBe(true);
  expect((await ack(a, "watching:invite", { targetId: b.id })).ok).toBe(false);
  await friend(a, c);
  await new Promise((r) => setTimeout(r, 510));
  await ack(a, "watching:invite", { targetId: c.id });
  await until(() => !!c.state?.invites.length);
  const id = c.state!.invites[0].id;
  expect(c.state!.group).toBeNull();
  expect(
    (await ack(b, "watching:respond", { id, accept: true, consent: true })).ok,
  ).toBe(false);
  expect((await ack(c, "watching:respond", { id, accept: true })).ok).toBe(
    false,
  );
  await new Promise((r) => setTimeout(r, 310));
  expect(
    (await ack(c, "watching:respond", { id, accept: true, consent: true })).ok,
  ).toBe(false);
  await ack(c, "visit", { postId: video });
  await new Promise((r) => setTimeout(r, 310));
  expect(
    (await ack(c, "watching:respond", { id, accept: true, consent: true })).ok,
  ).toBe(true);
  a.socket.disconnect();
  await until(() => c.state?.group === null);
});
it("only accepts host playback from the participating socket, rejects stale revisions and aligns the server clock", async () => {
  await join();
  const started = await ack(a, "watching:control", {
    position: 5,
    playing: true,
    revision: 1,
  });
  expect(started.ok).toBe(true);
  expect(
    playbackPosition(started.state.group!.playback, started.state.serverNow),
  ).toBeCloseTo(5, 1);
  expect(
    (
      await ack(b, "watching:control", {
        position: 100,
        playing: false,
        revision: 2,
      })
    ).ok,
  ).toBe(false);
  const tab = io(origin, {
    transports: ["websocket"],
    extraHeaders: { Cookie: a.cookie },
    forceNew: true,
    reconnection: false,
  });
  clients.push(tab);
  await new Promise<void>((resolve) => tab.once("connect", resolve));
  expect(
    (
      await tab.timeout(3000).emitWithAck("watching:control", {
        position: 10,
        playing: false,
        revision: 2,
      })
    ).ok,
  ).toBe(false);
  await new Promise((r) => setTimeout(r, 110));
  expect(
    (
      await ack(a, "watching:control", {
        position: 2,
        playing: false,
        revision: 1,
      })
    ).ok,
  ).toBe(false);
  await new Promise((r) => setTimeout(r, 110));
  expect(
    (
      await ack(a, "watching:control", {
        position: 7,
        playing: false,
        revision: 2,
      })
    ).ok,
  ).toBe(true);
  await until(() => b.state?.group?.playback.revision === 3);
  expect(b.state!.group!.playback).toMatchObject({
    position: 7,
    playing: false,
  });
  expect(
    playbackPosition(
      { position: 7, playing: true, updatedAt: 1000, revision: 1 },
      4000,
      8,
    ),
  ).toBe(8);
  expect(
    playbackPosition(
      { position: 7, playing: true, updatedAt: 1000, revision: 1 },
      0,
    ),
  ).toBe(7);
});
it("keeps group consent separate from public viewer consent and does not expose the private group to bystanders", async () => {
  const worlds: Record<
    string,
    { counts: Record<string, number>; viewers: Record<string, unknown[]> }
  > = {};
  for (const g of [a, b, c]) g.socket.on("world", (w) => (worlds[g.id] = w));
  await join();
  await ack(c, "visit", { postId: video });
  await until(() => worlds[c.id]?.counts[video] === 3);
  expect(worlds[c.id].viewers[video]).toHaveLength(0);
  expect(a.state!.group!.members).toHaveLength(2);
  expect(c.state?.group).toBeNull();
  expect((await ack(c, "watching:get")).state.invites).toEqual([]);
  expect(JSON.stringify(c.state)).not.toContain(a.id);
  expect(
    (
      await instance.app.inject({
        url: "/api/bootstrap",
        headers: { cookie: b.cookie },
      })
    ).json().user.shareActivity,
  ).toBe(false);
});
it("leaves on closing the post, ends when the host disconnects and does not automatically rejoin a second device", async () => {
  await join();
  await ack(b, "view", { postId: null });
  await until(() => b.state?.group === null);
  expect(a.state!.group!.members).toHaveLength(1);
  const tab = io(origin, {
    transports: ["websocket"],
    extraHeaders: { Cookie: a.cookie },
    forceNew: true,
    reconnection: false,
  });
  clients.push(tab);
  await new Promise<void>((resolve) => tab.once("connect", resolve));
  await tab.timeout(3000).emitWithAck("visit", { postId: video });
  expect(
    (await tab.timeout(3000).emitWithAck("watching:get", {})).state.group,
  ).toBeNull();
  expect(
    (
      await tab.timeout(3000).emitWithAck("watching:create", {
        postId: video,
        position: 0,
        consent: true,
      })
    ).ok,
  ).toBe(false);
  await friend(a, c);
  await new Promise((r) => setTimeout(r, 510));
  await ack(a, "watching:invite", { targetId: c.id });
  await until(() => !!c.state?.invites.length);
  a.socket.disconnect();
  await until(() => c.state?.invites.length === 0);
});
it("ends on a block and removes pending invitations without changing the public viewer setting", async () => {
  await join();
  await friend(a, c);
  await new Promise((r) => setTimeout(r, 510));
  await ack(a, "watching:invite", { targetId: c.id });
  await until(() => !!c.state?.invites.length);
  await request(b, "/blocks/" + a.id, "PUT", { blocked: true });
  await until(
    () =>
      a.state?.group === null &&
      b.state?.group === null &&
      c.state?.invites.length === 0,
  );
});
it("declines or expires invitations and never joins or moves a user by invitation alone", async () => {
  await friend(a, b);
  await create();
  await ack(a, "watching:invite", { targetId: b.id });
  await until(() => !!b.state?.invites.length);
  expect(
    (
      await ack(b, "watching:respond", {
        id: b.state!.invites[0].id,
        accept: false,
      })
    ).ok,
  ).toBe(true);
  await until(() => b.state?.invites.length === 0);
  expect(b.state!.group).toBeNull();
  await new Promise((r) => setTimeout(r, 510));
  await ack(a, "watching:invite", { targetId: b.id });
  await until(() => !!b.state?.invites.length);
  const id = b.state!.invites[0].id,
    now = Date.now(),
    clock = vi.spyOn(Date, "now").mockImplementation(() => now + 121000);
  // Exercise expiry synchronously without advancing Engine.IO's client ping clock.
  let result: { ok: boolean } | undefined;
  instance.io.sockets.sockets
    .get(b.socket.id!)!
    .listeners("watching:respond")[0](
      { id, accept: true, consent: true },
      (r: { ok: boolean }) => (result = r),
    );
  clock.mockRestore();
  expect(result?.ok).toBe(false);
  expect(b.state?.group).toBeNull();
  await until(() => b.state?.invites.length === 0);
});
it("ends after the video is replaced or the hosting session is revoked", async () => {
  await join();
  instance.store.sqlite
    .prepare("UPDATE posts SET media_url=? WHERE id=?")
    .run("/media/22222222-2222-4222-8222-222222222222.webm", video);
  await ack(c, "view", { postId: null });
  await until(() => b.state?.group === null);
  await new Promise((r) => setTimeout(r, 1010));
  await create();
  await new Promise((r) => setTimeout(r, 510));
  await ack(a, "watching:invite", { targetId: b.id });
  await until(() => !!b.state?.invites.length);
  await ack(b, "watching:respond", {
    id: b.state!.invites[0].id,
    accept: true,
    consent: true,
  });
  await until(() => b.state?.group?.members.length === 2);
  instance.store.sqlite
    .prepare("DELETE FROM sessions WHERE user_id=?")
    .run(a.id);
  await ack(c, "view", { postId: null });
  await until(
    () =>
      a.state?.group === null &&
      b.state?.group === null &&
      b.state?.invites.length === 0,
  );
});
