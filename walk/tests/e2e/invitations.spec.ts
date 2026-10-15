import { test, expect, type Page } from "@playwright/test";
async function start(p: Page, name: string) {
  await p.getByLabel("ニックネーム").fill(name);
  await p.getByText("「好き」をきっかけに、つながる", { exact: true }).click();
  await p.getByRole("button", { name: "WALKをはじめる" }).click();
  await expect(p.locator("[role=application][data-ready=true]")).toBeVisible();
}
test("world and post links arrive at their real location after confirmation; previews do not count as views", async ({
  browser,
}) => {
  const ca = await browser.newContext({
      permissions: ["clipboard-read", "clipboard-write"],
    }),
    cb = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
    });
  const a = await ca.newPage(),
    b = await cb.newPage();
  try {
    await a.goto("/");
    await start(a, "招待する旅人");
    await a
      .locator(".area-dock")
      .getByRole("button", { name: "ゲーム", exact: true })
      .click();
    await expect(a.locator(".map-top")).toContainText("ゲームの世界");
    await a
      .getByRole("button", { name: "この世界に招待", exact: true })
      .first()
      .click();
    const worldLink = await a
      .getByLabel("招待リンク", { exact: true })
      .inputValue();
    expect(worldLink).toContain("#/world/world%3Agame");
    await a
      .getByRole("button", { name: "リンクをコピー", exact: true })
      .click();
    expect(await a.evaluate(() => navigator.clipboard.readText())).toBe(
      worldLink,
    );
    await expect(
      a.getByText("このリンクはこの端末用です。", { exact: false }),
    ).toBeVisible();
    await a.getByRole("button", { name: "閉じる", exact: true }).click();
    await b.goto(worldLink);
    await start(b, "招待された旅人");
    await expect(b.getByRole("dialog", { name: "WALKへの招待" })).toContainText(
      "ゲームの世界",
    );
    await expect(b.locator(".map-top")).toContainText("不思議な駅");
    await b.getByRole("button", { name: "この場所へ行く" }).click();
    await expect(b.locator(".map-top")).toContainText("ゲームの世界");
    await a.getByRole("button", { name: "投稿を探す", exact: true }).click();
    await a.getByLabel("投稿を絞り込む").fill("雨の日のプレイリスト");
    await a.locator(".tile-title").first().click();
    const title = await a.locator(".post-detail h2").innerText();
    await a.getByRole("button", { name: "この投稿に招待" }).click();
    const postLink = await a
      .getByLabel("招待リンク", { exact: true })
      .inputValue();
    await a.getByRole("button", { name: "閉じる", exact: true }).last().click();
    await b.goto(postLink);
    await expect(b.getByRole("dialog", { name: "WALKへの招待" })).toContainText(
      title,
    );
    await expect(a.locator(".viewing-box")).toContainText(
      "1人がこの投稿を開いています",
    );
    await b.getByRole("button", { name: "この場所へ行く" }).click();
    await expect(b.locator(".post-detail h2")).toHaveText(title);
    await expect(a.locator(".viewing-box")).toContainText(
      "2人がこの投稿を開いています",
    );
    await expect(b.locator(".viewing-box")).toContainText("招待する旅人");
    await b.getByRole("button", { name: "閉じる", exact: true }).click();
    await b.goto("/#/post/no-such-post");
    await expect(b.getByRole("dialog", { name: "WALKへの招待" })).toContainText(
      "この行き先は見つかりませんでした",
    );
    await expect(b.getByRole("button", { name: "この場所へ行く" })).toHaveCount(
      0,
    );
  } finally {
    await ca.close();
    await cb.close();
  }
});
