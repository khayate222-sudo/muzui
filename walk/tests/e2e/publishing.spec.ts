import { test, expect } from "@playwright/test";
import { fileURLToPath } from "node:url";
test("mobile creator posts a real uploaded video, plays it, finds WALK originals and manages own posts", async ({
  browser,
}) => {
  const context = await browser.newContext({locale:'ja-JP',
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage(),
    errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  try {
    await page.goto("/");
    await page.getByLabel("ニックネーム").fill("ゲーム投稿者");
    await page.getByRole("button", { name: "WALKをはじめる" }).click();
    await expect(
      page.locator("[role=application][data-ready=true]"),
    ).toBeVisible();
    await page
      .locator(".quick-discovery")
      .getByRole("button", { name: "＋ WALKに投稿", exact: true })
      .click();
    await page
      .getByLabel("投稿タイトル", { exact: true })
      .fill("WALKだけのゲーム制作日記");
    await page
      .getByLabel("本文", { exact: true })
      .fill("自分で制作した小さな映像です。");
    await page
      .locator("input[type=file]")
      .setInputFiles(
        fileURLToPath(
          new URL("../fixtures/walk-original.webm", import.meta.url),
        ),
      );
    await expect(page.locator(".collection-form video")).toBeVisible();
    await page
      .getByRole("button", { name: "広場に公開する", exact: true })
      .click();
    await expect(page.locator(".post-detail h2")).toHaveText(
      "WALKだけのゲーム制作日記",
    );
    await expect(page.locator(".post-meta .native-badge")).toHaveText("WALK発");
    await expect(page.locator(".author-row")).toContainText("ゲーム投稿者");
    const video = page.locator(".post-detail video");
    await expect
      .poll(() => video.evaluate((el: HTMLVideoElement) => el.readyState))
      .toBeGreaterThanOrEqual(2);
    await video.evaluate(async (el: HTMLVideoElement) => {
      el.muted = true;
      await el.play();
    });
    await expect
      .poll(() => video.evaluate((el: HTMLVideoElement) => el.currentTime))
      .toBeGreaterThan(0);
    // A screen change must retain this exact player and its chosen playback position.
    const original = await video.elementHandle();
    await video.evaluate((el: HTMLVideoElement) => {
      el.pause();
      el.currentTime = Math.min(0.3, el.duration / 2);
    });
    await expect
      .poll(() => video.evaluate((el: HTMLVideoElement) => el.currentTime))
      .toBeGreaterThan(0);
    const position = await video.evaluate(
      (el: HTMLVideoElement) => el.currentTime,
    );
    const samePlayer = async () =>
      expect(
        await page.evaluate(
          (el) => document.querySelector(".post-detail video") === el,
          original,
        ),
      ).toBe(true);
    await page
      .getByRole("button", { name: "大画面で見る", exact: true })
      .click();
    await samePlayer();
    expect(
      await video.evaluate((el: HTMLVideoElement) => el.currentTime),
    ).toBeCloseTo(position, 1);
    await expect(page.getByRole("dialog")).toHaveAttribute(
      "aria-modal",
      "true",
    );
    await page.getByRole("button", { name: "箱庭と見る", exact: true }).click();
    await samePlayer();
    expect(
      await video.evaluate((el: HTMLVideoElement) => el.currentTime),
    ).toBeCloseTo(position, 1);
    // Use genuine touch input on the handle; a swipe changes the frame, never the post.
    const cdp = await context.newCDPSession(page);
    const swipe = async (dy: number) => {
      await page.locator(".watch-grab").click({ trial: true });
      const box = await page.locator(".watch-grab").boundingBox(),
        x = box!.x + box!.width / 2,
        y = box!.y + box!.height / 2;
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchStart",
        touchPoints: [{ x, y }],
      });
      for (let step = 1; step <= 6; step++)
        await cdp.send("Input.dispatchTouchEvent", {
          type: "touchMove",
          touchPoints: [{ x, y: y + (dy * step) / 6 }],
        });
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchEnd",
        touchPoints: [],
      });
    };
    await swipe(65);
    await expect(page.locator(".watch-side")).toHaveClass(/is-peek/);
    await page
      .getByRole("button", { name: "視聴パネルを広げる", exact: true })
      .focus();
    await page.keyboard.press("Enter");
    await expect(page.locator(".watch-side")).not.toHaveClass(/is-peek/);
    await page.keyboard.press("Enter");
    await expect(page.locator(".watch-side")).toHaveClass(/is-peek/);
    await expect(page.locator(".watch-post")).toHaveAttribute("inert", "");
    await expect(page.locator(".viewing-box")).toContainText(
      "1人がこの投稿を開いています",
    );
    await samePlayer();
    const before = await page.getByTestId("player-position").textContent();
    await page.getByRole("application").focus();
    await page.keyboard.down("ArrowRight");
    try {
      await expect
        .poll(() => page.getByTestId("player-position").textContent())
        .not.toBe(before);
    } finally {
      await page.keyboard.up("ArrowRight");
    }
    await page.screenshot({ path: "artifacts/watch-peek-mobile.png" });
    await swipe(-65);
    await expect(page.locator(".watch-side")).not.toHaveClass(/is-peek/);
    await samePlayer();
    expect(
      await video.evaluate((el: HTMLVideoElement) => el.currentTime),
    ).toBeCloseTo(position, 1);
    await page
      .getByRole("button", { name: "箱庭を広く見る", exact: true })
      .click();
    await page
      .getByRole("button", { name: "視聴パネルを広げる", exact: true })
      .click();
    await expect(page.locator(".watch-post")).not.toHaveAttribute("inert", "");
    await video.evaluate(async (el: HTMLVideoElement) => el.play());
    await expect
      .poll(() => video.evaluate((el: HTMLVideoElement) => el.currentTime))
      .toBeGreaterThan(position);
    await page
      .getByRole("button", { name: "大画面で見る", exact: true })
      .click();
    await page
      .getByRole("button", { name: "この投稿に招待", exact: true })
      .click();
    await expect(
      page.getByRole("dialog", { name: "この場所に招待" }),
    ).toBeVisible();
    await page
      .getByRole("dialog", { name: "この場所に招待" })
      .getByRole("button", { name: "閉じる", exact: true })
      .click();
    await samePlayer();
    expect(
      await page
        .locator(".app-shell")
        .evaluate((el) => (el as HTMLElement).inert),
    ).toBe(true);
    await page.getByRole("button", { name: "箱庭と見る", exact: true }).click();
    expect(
      await page
        .locator(".app-shell")
        .evaluate((el) => (el as HTMLElement).inert),
    ).toBe(false);

    await page
      .getByRole("dialog")
      .getByRole("button", { name: "閉じる", exact: true })
      .click();
    await page
      .locator(".quick-discovery")
      .getByRole("button", { name: "WALK発の投稿", exact: true })
      .click();
    await expect(
      page.getByRole("button", {
        name: "WALKだけのゲーム制作日記",
        exact: true,
      }),
    ).toBeVisible();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "閉じる", exact: true })
      .click();
    for (const width of [390, 320]) {
      await page.setViewportSize({ width, height: 844 });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
    }
    await page
      .locator(".mobile-nav")
      .getByRole("button", { name: "あなた", exact: true })
      .click();
    await page
      .getByRole("button", { name: "自分のWALK投稿を見る", exact: true })
      .click();
    await page.getByRole("button", { name: "削除する", exact: true }).click();
    await page
      .getByRole("button", { name: "投稿の削除を確定", exact: true })
      .click();
    await expect(page.getByRole("dialog").last()).toContainText(
      "最初の「好き」を投稿してみよう。",
    );
    expect(errors).toEqual([]);
  } finally {
    await context.close();
  }
});
