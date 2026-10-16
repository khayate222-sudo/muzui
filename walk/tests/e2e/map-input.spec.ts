import { test, expect, type Page } from "@playwright/test";
import { toCourtyard } from "../../src/world-layout";
import { gatePoints, findPlace } from "../../shared/worlds";
async function setup(p: Page) {
  await p.goto("/");
  await p.getByLabel("ニックネーム").fill("タップ旅人");
  await p.getByRole("button", { name: "WALKをはじめる" }).click();
  await expect(p.locator("[role=application][data-ready=true]")).toBeVisible();
}
async function point(p: Page, x: number, y: number) {
  let result: { x: number; y: number } | null = null;
  // Read canvas bounds and its camera in one DOM snapshot, after a newly entered world is ready.
  await expect
    .poll(async () => {
      result = await p.getByRole("application").evaluate(
        (host, { x, y }) => {
          const canvas = host.querySelector("canvas"),
            raw = host.getAttribute("data-viewport");
          if (!canvas || !raw) return null;
          const box = canvas.getBoundingClientRect(),
            v = JSON.parse(raw);
          if (!v.width || !v.height || !box.width || !box.height) return null;
          return {
            x:
              box.x +
              (((x - v.scrollX - v.width / 2) * v.zoom + v.width / 2) *
                box.width) /
                v.width,
            y:
              box.y +
              (((y - v.scrollY - v.height / 2) * v.zoom + v.height / 2) *
                box.height) /
                v.height,
          };
        },
        { x, y },
      );
      return result !== null;
    })
    .toBe(true);
  return result!;
}
async function center(p: Page, x: number, y: number) {
  // Pan the visible map rather than bypassing its input system or calling its scene actions.
  for (let i = 0; i < 5; i++) {
    const target = await point(p, x, y),
      box = await p.locator("canvas").boundingBox();
    const cx = box!.x + box!.width / 2,
      cy = box!.y + box!.height / 2;
    if (Math.hypot(target.x - cx, target.y - cy) < 35) return;
    await p.mouse.move(cx, cy);
    await p.mouse.down();
    await p.mouse.move(cx + cx - target.x, cy + cy - target.y, { steps: 12 });
    await p.mouse.up();
    await p.waitForTimeout(150);
  }
}
for (const mobile of [false, true])
  test(`${mobile ? "touch" : "mouse"}: the roof, side wall and sign all open the house; dragging never enters it`, async ({
    browser,
  }) => {
    const context = await browser.newContext({
      viewport: mobile
        ? { width: 390, height: 844 }
        : { width: 1512, height: 982 },
      isMobile: mobile,
      hasTouch: mobile,
    });
    const p = await context.newPage(),
      errors: string[] = [];
    p.on("pageerror", (e) => errors.push(e.message));
    const tap = async (x: number, y: number) => {
      const pt = await point(p, x, y);
      if (mobile) await p.touchscreen.tap(pt.x, pt.y);
      else await p.mouse.click(pt.x, pt.y);
    };
    try {
      await setup(p);
      const gate = gatePoints("public").find(
        (g) => g.place.id === "world:art",
      )!;
      for (const [dx, dy] of [
        [60, -430],
        [240, -100],
        [120, -30],
        [0, 10],
      ]) {
        await center(p, gate.x+dx, gate.y+dy);
        await tap(gate.x + dx, gate.y + dy);
        await expect(p.locator(".map-top")).toContainText("アートの世界");
        await p
          .locator(".world-path")
          .getByRole("button", { name: "不思議な駅", exact: true })
          .click();
        await expect(p.locator(".map-top")).toContainText("不思議な駅");
        await expect(
          p.locator("[role=application][data-ready=true]"),
        ).toBeVisible();
      }
      // The central clock tower and its wall open the guide, not an unrelated world.
      for (const [x,y] of [[1000,180],[1000,600]]) {
        await center(p,x,y);
        await tap(x,y);
        await expect(p.getByRole('dialog',{name:'行き先をえらぶ'})).toBeVisible();
        await p.getByRole('button',{name:'閉じる',exact:true}).click();
      }
      // Every background family retains a working physical return building.
      for (const id of ['world:discovery','world:music','world:video','world:game-rpg']) {
        await p.goto('/#/world/'+encodeURIComponent(id));
        await p.getByRole('button',{name:'この場所へ行く',exact:true}).click();
        await expect(p.locator('.map-top')).toContainText(findPlace(id)!.title);
        await expect(p.locator('[role=application][data-ready=true]')).toBeVisible();
        await center(p,1600,570); await tap(1600,570);
        await expect(p.locator('.map-top')).toContainText(id==='world:game-rpg'?'ゲームの世界':'不思議な駅');
      }
      await p.locator('.world-path').getByRole('button',{name:'不思議な駅',exact:true}).click();
      await expect(p.locator('[role=application][data-ready=true]')).toBeVisible();
      await center(p, gate.x, gate.y - 80);
      const at = await point(p, gate.x, gate.y - 100);
      await p.mouse.move(at.x, at.y);
      await p.mouse.down();
      await p.mouse.move(at.x - 90, at.y + 65, { steps: 15 });
      await p.mouse.up();
      await expect(p.locator(".map-top")).toContainText("不思議な駅");
      if (mobile) {
        await p.screenshot({ path: "artifacts/walk-native-mobile-design.png" });
        for (const width of [320, 390]) {
          await p.setViewportSize({ width, height: 844 });
          expect(
            await p.evaluate(
              () =>
                document.documentElement.scrollWidth <= innerWidth &&
                document.documentElement.scrollHeight <= innerHeight + 1,
            ),
          ).toBe(true);
          await expect(p.locator(".mobile-nav")).toBeVisible();
        }
      }
      expect(errors).toEqual([]);
    } finally {
      await context.close();
    }
  });
test("post board and avatar respond at their visible positions after zooming", async ({
  browser,
}) => {
  const ca = await browser.newContext(),
    cb = await browser.newContext();
  const a = await ca.newPage(),
    b = await cb.newPage();
  try {
    await setup(a);
    await setup(b);
    await b.getByRole("button", { name: "プロフィール設定" }).click();
    await b.getByLabel("ニックネーム").fill("クリックできる住人");
    await b.getByRole("button", { name: "変更を保存" }).click();
    const boot = await (await a.request.get("/api/bootstrap")).json(),
      post = boot.posts.find((p: { id: string }) => p.id === "text-0-0");
    await a
      .locator(".area-dock")
      .getByRole("button", { name: "広場", exact: true })
      .click();
    await expect(
      a.locator("[role=application][data-ready=true]"),
    ).toBeVisible();
    await a.getByRole("button", { name: "拡大", exact: true }).click();
    const board = toCourtyard({x:post.mapX,y:post.mapY});
    await center(a, board.x, board.y - 140);
    const pt = await point(a, board.x, board.y - 140);
    await a.mouse.click(pt.x, pt.y);
    await expect(a.locator(".post-detail h2")).toHaveText(post.title);
    await a.getByRole("button", { name: "閉じる", exact: true }).click();
    await a
      .locator(".world-path")
      .getByRole("button", { name: "不思議な駅", exact: true })
      .click();
    await expect(
      a.locator("[role=application][data-ready=true]"),
    ).toBeVisible();
    const resident=toCourtyard({x:1100,y:750});
    await center(a,resident.x,resident.y-60);
    const peer = await point(a,resident.x,resident.y-60);
    await a.mouse.click(peer.x, peer.y);
    await expect(
      a.getByRole("dialog", { name: "旅人のプロフィール" }),
    ).toContainText("クリックできる住人");
  } finally {
    await ca.close();
    await cb.close();
  }
});
