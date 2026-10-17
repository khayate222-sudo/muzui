import { test, expect, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";
const mutate = (p: Page, path: string, data: object, method = "POST") =>
  p.request.fetch("/api" + path, {
    method,
    headers: { "X-Walk-Client": "1" },
    data,
  });
async function onboard(p: Page, name: string) {
  await p.getByLabel("ニックネーム").fill(name);
  await p.getByRole("button", { name: "WALKをはじめる" }).click();
  await expect(p.locator("[role=application][data-ready=true]")).toBeVisible();
  await expect(p.locator(".connection")).toContainText("人が散歩中");
}
async function closeTop(p: Page) {
  await p
    .getByRole("dialog")
    .last()
    .getByRole("button", { name: "閉じる", exact: true })
    .click();
}
async function openPost(p: Page, title: string) {
  await p.getByRole("button", { name: "投稿を探す", exact: true }).click();
  await p.getByLabel("投稿を絞り込む").fill(title);
  await p.getByRole("button", { name: title, exact: true }).click();
  await expect(p.locator(".post-detail h2")).toHaveText(title);
}
test("a public room shares its own link, loads outside the first listing, and a stale private destination never moves the recipient", async ({
  browser,
}) => {
  const ca = await browser.newContext({locale:'ja-JP',
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
    }),
    cb = await browser.newContext({locale:'ja-JP',
      viewport: { width: 320, height: 844 },
      isMobile: true,
      hasTouch: true,
    }),
    cc = await browser.newContext({locale:'ja-JP'}),
    a = await ca.newPage(),
    b = await cb.newPage(),
    c = await cc.newPage();
  const errors: string[] = [];
  for (const p of [a, b, c]) p.on("pageerror", (e) => errors.push(e.message));
  try {
    await a.goto("/");
    await onboard(a, "星の部屋の住人");
    const bootstrap = await (await a.request.get("/api/bootstrap")).json(),
      post = bootstrap.posts.find((p: { id: string }) => p.id === "text-0-0");
    await mutate(a, "/favorites/" + post.id, { saved: true }, "PUT");
    const layout = {
      title: "星あかりの待ち合わせ",
      description: "住人が育てる、静かな夜の庭",
      theme: "night",
      isPublic: true,
      items: [{ postId: post.id, x: 480, y: 600 }],
      decorations: [{ kind: "tree", x: 900, y: 700 }],
    };
    const created = await mutate(a, "/rooms", layout);
    expect(created.ok()).toBe(true);
    const room = await created.json();
    await a.reload();
    await a
      .locator(".quick-discovery")
      .getByRole("button", { name: /ルームを探す/ })
      .click();
    const card = a.locator(".room-card").filter({ hasText: layout.title });
    await card.getByRole("button", { name: "訪問する", exact: true }).click();
    await expect(a.locator(".map-top")).toContainText(layout.title);
    await a
      .locator(".quick-discovery")
      .getByRole("button", { name: "このルームに招待", exact: true })
      .click();
    const link = await a.getByLabel("招待リンク", { exact: true }).inputValue();
    expect(link).toContain("#/room/" + room.id);
    expect(link).not.toContain("#/world/public");
    await closeTop(a);
    await cb.route("**/api/rooms", async (route) => {
      const response = await route.fetch();
      const rooms = await response.json();
      await route.fulfill({
        response,
        json: rooms.filter((r: { id: string }) => r.id !== room.id),
      });
    });
    await b.goto(link);
    await onboard(b, "庭への訪問者");
    await expect(b.getByRole("dialog", { name: "WALKへの招待" })).toContainText(
      layout.title,
    );
    await expect(b.locator(".map-top")).toContainText("不思議な駅");
    await expect(b.getByRole("dialog", { name: "WALKへの招待" })).toContainText(
      "公開ルーム · 星の部屋の住人",
    );
    await mkdir("artifacts", { recursive: true });
    await b.screenshot({
      path: "artifacts/public-room-invitation-mobile.png",
      animations: "disabled",
    });
    await b
      .getByRole("button", { name: "この場所へ行く", exact: true })
      .click();
    await expect(b.locator(".map-top")).toContainText(layout.title);
    await expect(b.locator(".world-path")).toContainText(layout.title);
    await openPost(b, post.title);
    await expect
      .poll(() =>
        b
          .getByTestId("player-position")
          .textContent()
          .then((t) => JSON.parse(t || "null")?.x),
      )
      .toBe(480);
    await closeTop(b);
    await c.goto(link);
    await onboard(c, "公開設定を確認する旅人");
    await expect(c.getByRole("dialog", { name: "WALKへの招待" })).toContainText(
      layout.title,
    );
    await mutate(
      a,
      "/rooms/" + room.id,
      { ...layout, isPublic: false, revision: 1 },
      "PUT",
    );
    await expect(b.locator(".map-top")).toContainText("不思議な駅");
    await c
      .getByRole("button", { name: "この場所へ行く", exact: true })
      .click();
    await expect(
      c.getByRole("dialog", { name: "WALKへの招待" }).getByRole("alert"),
    ).toContainText("ルームを表示できません");
    await expect(c.locator(".map-top")).toContainText("不思議な駅");
    await c.reload();
    await expect(c.getByRole("dialog", { name: "WALKへの招待" })).toContainText(
      "この行き先は見つかりませんでした",
    );
    await expect(
      c.getByRole("button", { name: "この場所へ行く", exact: true }),
    ).toHaveCount(0);
    await a
      .locator(".quick-discovery")
      .getByRole("button", { name: "このルームに招待", exact: true })
      .click();
    await expect(a.getByRole("status")).toContainText("このルームは非公開です");
    expect(
      (await (await a.request.get("/api/rooms/" + room.id)).json()).decorations,
    ).toEqual(layout.decorations);
    expect(errors).toEqual([]);
  } finally {
    await ca.close();
    await cb.close();
    await cc.close();
  }
});
test("friends receive a destination, confirm or decline it on mobile, and post previews do not count as views", async ({
  browser,
}) => {
  const ca = await browser.newContext({locale:'ja-JP',
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
    }),
    cb = await browser.newContext({locale:'ja-JP',
      viewport: { width: 320, height: 844 },
      isMobile: true,
      hasTouch: true,
    }),
    a = await ca.newPage(),
    b = await cb.newPage();
  const errors: string[] = [];
  for (const p of [a, b]) p.on("pageerror", (e) => errors.push(e.message));
  try {
    await a.goto("/");
    await onboard(a, "待ち合わせA");
    await b.goto("/");
    await onboard(b, "待ち合わせB");
    const bid = (await (await b.request.get("/api/bootstrap")).json()).user.id;
    await mutate(a, "/friendships", { targetId: bid });
    const f = (await (await b.request.get("/api/social")).json())
      .friendships[0];
    await mutate(b, "/friendships/" + f.id, { action: "accept" }, "PATCH");
    await a.reload();
    await a
      .locator(".world-gates")
      .getByRole("button", { name: "ゲームの世界", exact: true })
      .click();
    await expect(a.locator(".map-top")).toContainText("ゲームの世界");
    await a
      .locator(".world-gates")
      .getByRole("button", { name: "RPGの世界", exact: true })
      .click();
    await expect(a.locator(".map-top")).toContainText("RPGの世界");
    await a
      .locator(".quick-discovery")
      .getByRole("button", { name: "この世界に招待", exact: true })
      .click();
    await a.getByRole("button", { name: "ここに招待", exact: true }).click();
    await expect(
      a.getByRole("button", { name: "招待済み", exact: true }),
    ).toBeDisabled();
    await closeTop(a);
    await expect(b.locator(".notification b")).toHaveText("1");
    await expect(b.locator(".map-top")).toContainText("不思議な駅");
    await b.getByRole("button", { name: "通知", exact: true }).click();
    await expect(b.locator(".place-invitation-inbox")).toContainText(
      "RPGの世界",
    );
    await b.getByRole("button", { name: "行き先を確認", exact: true }).click();
    await expect(
      b.getByRole("dialog", { name: "友達から場所への招待" }),
    ).toContainText("今もここにいることを示すものではありません");
    await expect(b.locator(".map-top")).toContainText("不思議な駅");
    await b.screenshot({
      path: "artifacts/friend-place-invitation-mobile.png",
      animations: "disabled",
    });
    await b
      .getByRole("button", { name: "確認してこの場所へ行く", exact: true })
      .click();
    await expect(b.locator(".map-top")).toContainText("RPGの世界");
    await expect(
      b.getByRole("dialog", { name: "つながりとチャット" }),
    ).toHaveCount(0);
    expect((await (await b.request.get("/api/party")).json()).party).toBeNull();
    await openPost(a, "雨の日のプレイリスト");
    await a
      .getByRole("button", { name: "この投稿に招待", exact: true })
      .click();
    await a.getByRole("button", { name: "ここに招待", exact: true }).click();
    await closeTop(a);
    await expect(b.locator(".notification b")).toHaveText("1");
    await b.getByRole("button", { name: "通知", exact: true }).click();
    await b.getByRole("button", { name: "行き先を確認", exact: true }).click();
    await expect(a.locator(".viewing-box")).toContainText(
      "1人がこの投稿を開いています",
    );
    await expect(b.locator(".post-detail")).toHaveCount(0);
    await b
      .getByRole("button", { name: "確認してこの場所へ行く", exact: true })
      .click();
    await expect(b.locator(".post-detail h2")).toHaveText(
      "雨の日のプレイリスト",
    );
    await expect(a.locator(".viewing-box")).toContainText(
      "2人がこの投稿を開いています",
    );
    expect(
      (await (await b.request.get("/api/bootstrap")).json()).user.shareActivity,
    ).toBe(false);
    await b.getByRole("button", { name: "通知", exact: true }).click();
    await expect(
      b
        .locator(".social-people .person-row")
        .filter({ hasText: "待ち合わせA" }),
    ).toContainText("現在地は確認できません");
    await closeTop(b);
    await closeTop(a);
    await closeTop(b);
    await a
      .locator(".area-dock")
      .getByRole("button", { name: "ゲーム", exact: true })
      .click();
    await expect(a.locator(".map-top")).toContainText("ゲームの世界");
    await a
      .locator(".quick-discovery")
      .getByRole("button", { name: "この世界に招待", exact: true })
      .click();
    await a.getByRole("button", { name: "ここに招待", exact: true }).click();
    await closeTop(a);
    await expect(b.locator(".notification b")).toHaveText("1");
    await b.getByRole("button", { name: "通知", exact: true }).click();
    await b.getByRole("button", { name: "行き先を確認", exact: true }).click();
    await b
      .getByRole("button", { name: "今回は辞退する", exact: true })
      .click();
    await expect(b.locator(".place-invitation-list article")).toHaveCount(0);
    await expect(b.locator(".map-top")).toContainText("音楽の世界");
    expect(
      await b.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    expect(errors).toEqual([]);
  } finally {
    await ca.close();
    await cb.close();
  }
});
