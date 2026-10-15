import { expect, it } from "vitest";
import { invitationUrl, readInvitation } from "../shared/invitations";
it("round-trips world, post and public room invitations without leaking the current query or hash", () => {
  for (const target of [
    { kind: "world", id: "world:game-rpg" },
    { kind: "post", id: "text-0-0" },
    { kind: "room", id: "11111111-1111-4111-8111-111111111111" },
  ] as const) {
    const url = new URL(
      invitationUrl("https://walk.example/path?private=secret#old", target),
    );
    expect(url.pathname).toBe("/");
    expect(url.search).toBe("");
    expect(readInvitation(url.hash)).toEqual(target);
  }
});
it("rejects malformed fragments, encoded separators and arbitrary destinations", () => {
  for (const hash of [
    "#/world/%",
    "#/post/../../api/admin",
    "#/world/https://evil.example",
    "#/world/%2Fapi%2Fadmin",
    "#/post/id?next=evil",
    "#/world/id#other",
    "#/world/",
    "#/unknown/id",
    "#/post/" + "x".repeat(121),
    "#/room/world:music",
    "#/room/%2e%2e%2fadmin",
  ])
    expect(readInvitation(hash)).toBeNull();
  expect(() =>
    invitationUrl("javascript:alert(1)", { kind: "world", id: "public" }),
  ).toThrow();
  expect(() =>
    invitationUrl("https://user:password@walk.example/", {
      kind: "world",
      id: "public",
    }),
  ).toThrow();
  expect(() =>
    invitationUrl("https://walk.example/", { kind: "room", id: "not-a-room" }),
  ).toThrow();
});
