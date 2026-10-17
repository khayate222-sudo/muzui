import { test, expect, type Page } from '@playwright/test';
import { places } from '../../shared/worlds';
async function onboard(p: Page) {
  await p.goto('/'); await p.getByLabel('ニックネーム').fill('風景を歩く旅人');
  await p.getByRole('button', { name: 'WALKをはじめる' }).click();
  await expect(p.getByRole('button', { name: 'WALKをはじめる', exact: true })).toHaveCount(0);
  await expect(p.locator('[role=application][data-ready=true]')).toBeVisible();
  await expect(p.getByTestId('player-position')).not.toHaveText('null');
}
async function travel(p: Page, id: string) {
  await p.goto('/#/world/' + encodeURIComponent(id));
  await p.getByRole('button', { name: 'この場所へ行く', exact: true }).click();
  await expect(p.locator('[role=application][data-ready=true]')).toBeVisible();
  await expect(p.locator('.world-path')).toContainText(places.find(place => place.id === id)!.title);
}
for (const mobile of [false, true]) test(`illustrated worlds retain live interaction when local light changes (${mobile ? 'touch' : 'desktop'})`, async ({ browser }) => {
  const context = await browser.newContext({locale:'ja-JP', viewport: mobile ? { width: 390, height: 844 } : { width: 1512, height: 982 }, isMobile: mobile, hasTouch: mobile, timezoneId: 'Asia/Tokyo' });
  const p = await context.newPage(), errors: string[] = [], missing: string[] = [];
  p.on('pageerror', e => errors.push(e.message));
  p.on('response', r => { if (r.url().includes('/art/world-') && !r.ok()) missing.push(r.url()); });
  try {
    await onboard(p);
    await expect(p.locator('.toast')).toHaveCount(0);
    await expect(p.getByRole('application')).toHaveAttribute('data-art', 'painted-courtyard');
    await p.getByLabel('箱庭の光').selectOption('afternoon');
    await expect(p.getByRole('application')).toHaveAttribute('data-light', 'afternoon');
    const canvas = await p.locator('canvas').elementHandle(), position = await p.getByTestId('player-position').textContent();
    await p.screenshot({ animations: 'disabled', path: `artifacts/illustrated-station-afternoon-${mobile ? 'mobile' : 'desktop'}.png` });
    await p.getByLabel('箱庭の光').selectOption('evening');
    await expect(p.getByRole('application')).toHaveAttribute('data-light', 'evening');
    expect(await p.evaluate(el => document.querySelector('canvas') === el, canvas)).toBe(true);
    expect(await p.getByTestId('player-position').textContent()).toBe(position);
    await p.screenshot({ animations: 'disabled', path: `artifacts/illustrated-station-evening-${mobile ? 'mobile' : 'desktop'}.png` });
    await p.getByRole('button',{name:'行き先をえらぶ',exact:true}).click();
    await expect(p.getByRole('dialog',{name:'行き先をえらぶ'})).toBeVisible();
    await p.screenshot({animations:'disabled',path:`artifacts/coherent-destinations-${mobile?'mobile':'desktop'}.png`});
    await p.getByRole('button',{name:'閉じる',exact:true}).click();
    await (mobile?p.locator('.mobile-nav').getByRole('button',{name:'あなた',exact:true}):p.getByRole('button',{name:'プロフィール設定'})).click();
    await expect(p.getByRole('heading',{name:'あなたらしく、歩こう。'})).toBeVisible();
    await p.screenshot({animations:'disabled',path:`artifacts/coherent-profile-${mobile?'mobile':'desktop'}.png`});
    await p.getByRole('button',{name:'閉じる',exact:true}).click();
    for (const id of ['world:discovery', 'world:music', 'world:video', 'world:art', 'world:game', 'world:game-rpg', 'world:game-rpg-original', 'world:anime', 'world:music-instrument', 'world:anime-making', 'world:meme', 'activity:study', 'activity:gym', 'activity:social']) {
      await travel(p, id);
      await expect(p.getByRole('application')).toHaveAttribute('data-art', 'painted-courtyard');
      await expect(p.getByRole('application')).toHaveAttribute('data-light', 'evening');
      if (['world:discovery', 'world:music', 'world:game', 'world:game-rpg'].includes(id)) {
        await p.getByLabel('箱庭の光').selectOption('afternoon');
        await expect(p.getByRole('application')).toHaveAttribute('data-light', 'afternoon');
        await p.screenshot({ animations: 'disabled', path: `artifacts/illustrated-${id.slice(6)}-${mobile ? 'mobile' : 'desktop'}.png` });
        await p.getByLabel('箱庭の光').selectOption('evening');
      }
    }
    await p.reload();
    await expect(p.getByLabel('箱庭の光')).toHaveValue('evening');
    if (mobile) for (const width of [320, 390]) {
      await p.setViewportSize({ width, height: 844 });
      expect(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
    await p.getByLabel('箱庭の光').selectOption('auto');
    expect(errors).toEqual([]); expect(missing).toEqual([]);
  } finally { await context.close(); }
});

test('a missing illustration still leaves the station and destinations usable', async ({ page }) => {
  await page.route('**/art/courtyard-*.webp', route => route.abort());
  await onboard(page);
  await expect(page.getByRole('application')).toHaveAttribute('data-art', 'fallback');
  await page.locator('.world-gates').getByRole('button', { name: 'ゲームの世界', exact: true }).click();
  await expect(page.locator('.map-top')).toContainText('ゲームの世界');
  await expect(page.locator('[role=application][data-ready=true]')).toBeVisible();
});
