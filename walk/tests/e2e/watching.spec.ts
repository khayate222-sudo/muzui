import { test, expect, type Page } from "@playwright/test";
import { readFile, mkdir } from "node:fs/promises";
const mutate = (p: Page, path: string, data: object, method = "POST") =>
  p.request.fetch("/api" + path, {
    method,
    headers: { "X-Walk-Client": "1" },
    data,
  });
async function onboard(p: Page, name: string) {
  await p.goto("/");
  await p.getByLabel("ニックネーム").fill(name);
  await p.getByRole("button", { name: "WALKをはじめる" }).click();
  await expect(p.locator("[role=application][data-ready=true]")).toBeVisible();
  await expect(p.locator(".connection")).toContainText("人が散歩中");
}
async function findVideo(p: Page) {
  await p.getByRole("button", { name: "投稿を探す", exact: true }).click();
  await p.getByLabel("投稿を絞り込む").fill("みんなで見る小さな映像");
  await p
    .getByRole("button", { name: "みんなで見る小さな映像", exact: true })
    .click();
  await expect(p.locator(".post-detail h2")).toHaveText(
    "みんなで見る小さな映像",
  );
  await expect
    .poll(() =>
      p
        .locator(".native-video")
        .evaluate((v: HTMLVideoElement) => v.readyState),
    )
    .toBeGreaterThanOrEqual(2);
}
test("consented mobile viewers join by invitation, follow real video playback and leave for individual viewing", async ({
  browser,
}) => {
  const ca = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
    }),
    cb = await browser.newContext({
      viewport: { width: 320, height: 844 },
      isMobile: true,
      hasTouch: true,
    }),
    cc = await browser.newContext(),
    a = await ca.newPage(),
    b = await cb.newPage(),
    c = await cc.newPage();
  const errors: string[] = [];
  for (const p of [a, b, c]) p.on("pageerror", (e) => errors.push(e.message));
  try {
    await onboard(a, "映像のホスト");
    await onboard(b, "一緒に見る友達");
    await onboard(c, "個別視聴の旅人");
    const aid = (await (await a.request.get("/api/bootstrap")).json()).user.id,
      bid = (await (await b.request.get("/api/bootstrap")).json()).user.id;
    await mutate(a, "/friendships", { targetId: bid });
    const friendship = (await (await b.request.get("/api/social")).json())
      .friendships[0];
    await mutate(
      b,
      "/friendships/" + friendship.id,
      { action: "accept" },
      "PATCH",
    );
    await a.reload();
    const uploaded = await a.request.post("/api/uploads", {
      headers: { "X-Walk-Client": "1" },
      multipart: {
        file: {
          name: "walk-together.webm",
          mimeType: "video/webm",
          buffer: await readFile(
            new URL("../fixtures/walk-together.webm", import.meta.url),
          ),
        },
      },
    });
    expect(uploaded.ok()).toBe(true);
    const post = await mutate(a, "/posts", {
      title: "みんなで見る小さな映像",
      body: "WALKオリジナルの検証映像",
      genre: "discovery",
      attachmentId: (await uploaded.json()).id,
    });
    expect(post.ok()).toBe(true);
    await findVideo(a);
    await findVideo(c);
    await a.getByRole("button", { name: /友達と、同じ瞬間を/ }).click();
    await expect(
      a.getByRole("button", { name: "同期視聴を始める", exact: true }),
    ).toBeDisabled();
    await a
      .getByLabel(
        "名前とアバターを参加者に表示し、動画を同期して見ることに同意する",
      )
      .check();
    await a
      .getByRole("button", { name: "同期視聴を始める", exact: true })
      .click();
    await a
      .getByRole("button", { name: "同期視聴に招待", exact: true })
      .click();
    await a.getByRole("button", { name: "動画へ戻る", exact: true }).click();
    await expect(
      b.getByRole("button", { name: /一緒に見る招待/ }),
    ).toBeVisible();
    await expect(b.locator(".native-video")).toHaveCount(0);
    await b.getByRole("button", { name: /一緒に見る招待/ }).click();
    await expect(
      b.getByRole("button", { name: "同意して一緒に見る", exact: true }),
    ).toBeDisabled();
    await b.getByLabel("内容を確認し、同期視聴への参加に同意する").check();
    await mkdir("artifacts", { recursive: true });
    await b.screenshot({
      path: "artifacts/together-invitation-mobile.png",
      animations: "disabled",
    });
    await b
      .getByRole("button", { name: "同意して一緒に見る", exact: true })
      .click();
    await expect(b.locator(".post-detail h2")).toHaveText(
      "みんなで見る小さな映像",
    );
    await expect(b.getByTestId("together-controls")).toContainText(
      "同期視聴 · 2人",
    );
    await expect(a.getByTestId("together-controls")).toContainText(
      "一緒に見る友達",
    );
    await expect(c.locator(".viewing-box")).toContainText(
      "3人がこの投稿を開いています",
    );
    await expect(c.getByTestId("together-controls")).not.toContainText(
      "同期視聴 ·",
    );
    await expect(c.locator(".viewer-avatars")).not.toContainText(
      "映像のホスト",
    );
    expect(
      (await (await b.request.get("/api/bootstrap")).json()).user.shareActivity,
    ).toBe(false);
    const av = a.locator(".native-video"),
      bv = b.locator(".native-video");
    await expect
      .poll(() => bv.evaluate((v: HTMLVideoElement) => v.readyState))
      .toBeGreaterThanOrEqual(2);
    await av.evaluate((v: HTMLVideoElement) => {
      v.muted = true;
      v.currentTime = 3;
    });
    await expect
      .poll(() => bv.evaluate((v: HTMLVideoElement) => v.currentTime))
      .toBeCloseTo(3, 1);
    await bv.evaluate((v: HTMLVideoElement) => {
      v.muted = true;
      const play = v.play.bind(v);
      let denied = false;
      v.play = () => {
        if (!denied) {
          denied = true;
          return Promise.reject(
            new DOMException("Playback requires a gesture", "NotAllowedError"),
          );
        }
        return play();
      };
    });
    await a.getByRole("button", { name: "みんなで再生", exact: true }).click();
    const allow = b.getByRole("button", {
      name: "再生を許可して合わせる",
      exact: true,
    });
    await expect(allow).toBeVisible();
    await allow.click();
    await expect
      .poll(() => bv.evaluate((v: HTMLVideoElement) => !v.paused))
      .toBe(true);
    await expect
      .poll(() => bv.evaluate((v: HTMLVideoElement) => v.currentTime))
      .toBeGreaterThan(3.1);
    await a
      .getByRole("button", { name: "みんなで一時停止", exact: true })
      .click();
    await expect
      .poll(() => bv.evaluate((v: HTMLVideoElement) => v.paused))
      .toBe(true);
    const paused = await av.evaluate((v: HTMLVideoElement) => v.currentTime);
    await expect
      .poll(() =>
        bv.evaluate(
          (v: HTMLVideoElement, t) => Math.abs(v.currentTime - t),
          paused,
        ),
      )
      .toBeLessThan(0.2);
    await b.getByRole("button", { name: "大画面で見る", exact: true }).click();
    await expect(b.getByTestId("together-controls")).toContainText(
      "映像のホスト",
    );
    await b.screenshot({
      path: "artifacts/together-full-mobile.png",
      animations: "disabled",
    });
    await b.getByRole("button", { name: "箱庭と見る", exact: true }).click();
    expect(
      await b.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await b
      .getByRole("button", { name: "退出して個別視聴", exact: true })
      .click();
    await expect(b.getByTestId("together-controls")).not.toContainText(
      "同期視聴 ·",
    );
    await expect(a.getByTestId("together-controls")).toContainText(
      "同期視聴 · 1人",
    );
    await av.evaluate((v: HTMLVideoElement) => (v.currentTime = 8));
    await expect
      .poll(() =>
        bv.evaluate(
          (v: HTMLVideoElement, t) => Math.abs(v.currentTime - t),
          paused,
        ),
      )
      .toBeLessThan(0.2);
    expect(await bv.evaluate((v: HTMLVideoElement) => v.controls)).toBe(true);
    await b.getByRole("button", { name: "閉じる", exact: true }).last().click();
    await expect(c.locator(".viewing-box")).toContainText(
      "2人がこの投稿を開いています",
    );
    await a
      .getByRole("button", { name: "同期視聴を終了", exact: true })
      .click();
    await expect(a.getByTestId("together-controls")).not.toContainText(
      "同期視聴 ·",
    );
    expect(errors).toEqual([]);
    expect(aid).not.toBe(bid);
  } finally {
    await ca.close();
    await cb.close();
    await cc.close();
  }
});
