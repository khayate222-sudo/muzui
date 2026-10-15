import { it, expect, vi, afterEach } from "vitest";
import { legalConfiguration, releaseProblems } from "../shared/release";
import { createApp } from "../server/app";
const ready = {
  WALK_OPERATOR_NAME: "Test Operator",
  WALK_SUPPORT_EMAIL: "support@walk.example",
  WALK_TERMS_URL: "https://walk.example/terms",
  WALK_PRIVACY_URL: "https://walk.example/privacy",
  WALK_POLICY_VERSION: "test-v1",
  WALK_POLICIES_APPROVED: "true",
  APP_ORIGIN: "https://walk.example",
  COOKIE_SECURE: "true",
};
afterEach(() => vi.unstubAllEnvs());
it("keeps unknown operator information in development and rejects unsafe/incomplete launch configuration", () => {
  expect(legalConfiguration({}).ready).toBe(false);
  expect(legalConfiguration({}).operator).toBe("");
  expect(releaseProblems(ready)).toEqual([]);
  for (const change of [
    { WALK_SUPPORT_EMAIL: "" },
    { WALK_TERMS_URL: "javascript:alert(1)" },
    { WALK_PRIVACY_URL: "http://walk.example/privacy" },
    { WALK_POLICIES_APPROVED: "false" },
    { COOKIE_SECURE: "false" },
    { APP_ORIGIN: "https://localhost" },
  ])
    expect(releaseProblems({ ...ready, ...change }).length).toBeGreaterThan(0);
});
it("blocks public startup until configured and requires a free account for public posting while retaining guest browsing", async () => {
  vi.stubEnv("WALK_PUBLIC_RELEASE", "true");
  await expect(
    createApp({ database: ":memory:", adminKey: "release-test-key" }),
  ).rejects.toThrow("運営者");
  for (const [k, v] of Object.entries(ready)) vi.stubEnv(k, v);
  const app = await createApp({
    database: ":memory:",
    adminKey: "release-test-key",
    origin: ready.APP_ORIGIN,
    secureCookie: true,
  });
  try {
    const boot = await app.app.inject({ url: "/api/bootstrap" }),
      cookie = String(boot.headers["set-cookie"]).split(";")[0];
    expect(boot.json().requireAccountForPublishing).toBe(true);
    expect(
      (
        await app.app.inject({
          url: "/api/posts",
          method: "POST",
          headers: { cookie, "x-walk-client": "1", origin: ready.APP_ORIGIN },
          payload: {
            title: "投稿",
            body: "",
            genre: "art",
            attachmentId: null,
          },
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (await app.app.inject({ url: "/api/public/legal" })).json().ready,
    ).toBe(true);
  } finally {
    await app.app.close();
  }
});
