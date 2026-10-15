import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
const mutate = (p: Page, path: string, data: object, method = 'POST') => p.request.fetch('/api' + path, { method, headers: { 'X-Walk-Client': '1' }, data });
async function onboard(p: Page, name: string, share = false) {
  await p.goto('/');
  await p.getByLabel('ニックネーム').fill(name);
  if (share) await p.locator('input[name=share]').check();
  await p.getByRole('button', { name: 'WALKをはじめる' }).click();
  await expect(p.locator('[role=application][data-ready=true]')).toBeVisible();
  await expect(p.locator('.connection')).toContainText('人が散歩中');
}
async function upload(p: Page, title: string) {
  const file = await p.request.post('/api/uploads', { headers: { 'X-Walk-Client': '1' }, multipart: { file: { name: 'room.webm', mimeType: 'video/webm', buffer: await readFile(new URL('../fixtures/walk-together.webm', import.meta.url)) } } });
  expect(file.ok()).toBe(true);
  const response = await mutate(p, '/posts', { title, body: '窓辺で見る検証用の自作動画', genre: 'discovery', attachmentId: (await file.json()).id });
  expect(response.ok()).toBe(true);
  return { ...(await response.json() as { id: string }), title };
}
async function enterRoom(p: Page, title: string) {
  await p.locator('.quick-discovery').getByRole('button', { name: /ルームを探す/ }).click();
  await p.locator('.room-card').filter({ hasText: title }).getByRole('button', { name: '訪問する' }).click();
  await expect(p.locator('.map-top')).toContainText(title);
}

for (const mobile of [false, true]) test(`personal room keeps real playback and private access while switching cameras (${mobile ? 'touch' : 'desktop'})`, async ({ browser }) => {
  const ca = await browser.newContext(mobile ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } : {}), cb = await browser.newContext();
  const a = await ca.newPage(), b = await cb.newPage(), errors: string[] = [];
  for (const page of [a, b]) page.on('pageerror', e => errors.push(e.message));
  try {
    await onboard(a, '窓辺の持ち主');
    await onboard(b, '外で見る友達', true);
    const first = await upload(a, '窓辺の短い映像 · ' + (mobile ? 'スマホ検証' : 'PC検証')), second = await upload(a, '窓辺の続きの映像 · ' + (mobile ? 'スマホ検証' : 'PC検証'));
    const response = await mutate(a, '/rooms', { title: 'わたしの窓辺 · ' + (mobile ? 'スマホ' : 'PC'), description: '', isPublic: false, theme: 'studio', items: [{ postId: first.id, x: 900, y: 700 }, { postId: second.id, x: 1200, y: 700 }], decorations: [] });
    expect(response.ok()).toBe(true);
    const room = await response.json();
    expect((await b.request.get('/api/rooms/' + room.id)).status()).toBe(404);
    await a.reload();
    await enterRoom(a, room.title);
    await a.getByRole('button', { name: '窓辺で見る', exact: true }).click();
    await expect(a.getByTestId('room-interior')).toBeVisible();
    await expect(a.locator('.native-video')).toHaveCount(0);
    await expect(a.locator('.watch-audience')).toBeEmpty();
    await a.getByRole('region', { name: 'この部屋の投稿' }).getByRole('button', { name: new RegExp(first.title) }).click();
    await expect(a.locator('.post-detail h2')).toHaveText(first.title);
    await expect(a.locator('.viewing-box')).toContainText('1人がこの投稿を開いています');
    await expect(a.getByTestId('room-interior')).toBeVisible();
    await b.getByRole('button', { name: '投稿を探す', exact: true }).click();
    await b.getByLabel('投稿を絞り込む').fill(first.title);
    await b.getByRole('button', { name: first.title, exact: true }).click();
    await expect(a.locator('.viewing-box')).toContainText('2人がこの投稿を開いています');
    await expect(a.locator('.viewer-avatars')).toContainText('外で見る友達');
    await expect(b.locator('.viewer-avatars')).not.toContainText('窓辺の持ち主');
    await expect(a.getByTestId('together-controls')).not.toContainText('同期視聴 ·');
    expect((await b.request.get('/api/rooms/' + room.id)).status()).toBe(404);
    const video = a.locator('.native-video');
    await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.readyState)).toBeGreaterThanOrEqual(2);
    const original = await video.elementHandle();
    await video.evaluate(async (v: HTMLVideoElement) => { v.muted = true; v.loop = true; await v.play(); });
    await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.currentTime)).toBeGreaterThan(.1);
    const same = async () => expect(await a.evaluate(el => document.querySelector('.native-video') === el, original)).toBe(true);
    await a.getByRole('button', { name: '大きく見る', exact: true }).click();
    await same();
    expect(await video.evaluate((v: HTMLVideoElement) => v.paused)).toBe(false);
    await a.getByRole('button', { name: '部屋と見る', exact: true }).click();
    await same();
    await expect(a.getByTestId('room-interior')).toBeVisible();
    await a.getByRole('button', { name: '箱庭へ戻る', exact: true }).click();
    await same();
    await expect(a.locator('.watch-side')).toBeVisible();
    await expect(a.locator('.app-shell')).not.toHaveAttribute('inert');
    await a.getByRole('button', { name: '窓辺で見る', exact: true }).last().click();
    await same();
    await video.evaluate((v: HTMLVideoElement) => { v.pause(); v.currentTime = 3; });
    await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.currentTime)).toBeCloseTo(3, 1);
    await a.getByRole('button', { name: '大画面で見る', exact: true }).click();
    await same();
    expect(await video.evaluate((v: HTMLVideoElement) => v.currentTime)).toBeCloseTo(3, 1);
    await a.getByRole('button', { name: '部屋と見る', exact: true }).click();
    await same();
    expect(await a.locator('.watch-content').evaluate(el => el.scrollTop)).toBe(0);
    await expect(a.locator('.room-scenery')).toHaveCSS('background-image', /room-evening/);
    if (mobile) {
      for (const width of [320, 390]) {
        await a.setViewportSize({ width, height: 844 });
        expect(await a.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        const rect = await video.boundingBox();
        expect(rect!.width).toBeGreaterThan(260);
        expect(rect!.x).toBeGreaterThanOrEqual(0);
        expect(rect!.x + rect!.width).toBeLessThanOrEqual(width);
      }
      await a.emulateMedia({ reducedMotion: 'reduce' });
    }
    await a.screenshot({ path: `artifacts/personal-room-${mobile ? 'mobile' : 'desktop'}.png`, animations: 'disabled' });
    await a.getByRole('button', { name: '次の投稿・動画へ', exact: true }).click();
    await expect(a.locator('.post-detail h2')).toHaveText(second.title);
    await expect(a.getByTestId('room-interior')).toBeVisible();
    await expect(b.locator('.viewing-box')).toContainText('1人がこの投稿を開いています');
    await a.getByRole('button', { name: '閉じる', exact: true }).click();
    await expect(a.getByTestId('room-interior')).toHaveCount(0);
    await expect(a.locator('.native-video')).toHaveCount(0);
    await expect(a.locator('.app-shell')).not.toHaveAttribute('inert');
    await a.getByRole('button', { name: '窓辺で見る', exact: true }).click();
    await a.keyboard.press('Escape');
    await expect(a.getByTestId('room-interior')).toHaveCount(0);
    expect(errors).toEqual([]);
  } finally { await ca.close(); await cb.close(); }
});

test('an empty room explains placement; an official embed survives room and fullscreen layouts', async ({ page }) => {
  await onboard(page, '窓のある空室');
  const response = await mutate(page, '/rooms', { title: 'まだ空の部屋', description: '', isPublic: false, theme: 'studio', items: [], decorations: [] });
  const room = await response.json();
  await page.reload();
  await page.locator('.quick-discovery').getByRole('button', { name: /ルームを探す/ }).click();
  await page.locator('.room-card').filter({ hasText: room.title }).getByRole('button', { name: '窓辺で見る', exact: true }).click();
  await expect(page.getByTestId('room-interior')).toBeVisible();
  await expect(page.locator('.watch-room')).not.toHaveAttribute('inert');
  await expect(page.getByText('保存した投稿や、自分の動画をルームに配置すると、ここで選べます。')).toBeVisible();
  await expect(page.locator('video,iframe')).toHaveCount(0);
  await page.getByRole('button', { name: '投稿の配置を編集' }).click();
  await expect(page.getByRole('dialog', { name: 'みんなのルーム' })).toBeVisible();
  await page.getByRole('dialog', { name: 'みんなのルーム' }).getByRole('button', { name: '閉じる', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'A LITTLE DISCOVERY' })).not.toHaveAttribute('inert');
  await page.getByRole('button', { name: '閉じる', exact: true }).click();
  const imported = await mutate(page, '/imports', { url: 'https://www.youtube.com/watch?v=M7lc1UVf-VE', title: '窓辺の公式埋め込み', authorName: '公式プレーヤー検証', genre: 'video', body: '' });
  expect(imported.ok()).toBe(true);
  const post = await imported.json();
  const updated = await mutate(page, '/rooms/' + room.id, { ...room, items: [{ postId: post.id, x: 900, y: 700 }] }, 'PUT');
  expect(updated.ok()).toBe(true);
  await page.route('https://www.youtube-nocookie.com/embed/**', route => route.fulfill({ contentType: 'text/html', body: '<html><body>Official player boundary test</body></html>' }));
  await page.getByRole('button', { name: '窓辺で見る', exact: true }).click();
  await page.getByRole('region', { name: 'この部屋の投稿' }).getByRole('button', { name: /窓辺の公式埋め込み/ }).click();
  const iframe = page.locator('.youtube-player'), original = await iframe.elementHandle();
  await expect(iframe).toHaveAttribute('src', /youtube-nocookie.com\/embed\/M7lc1UVf-VE/);
  await page.getByRole('button', { name: '大画面で見る', exact: true }).click();
  expect(await page.evaluate(el => document.querySelector('.youtube-player') === el, original)).toBe(true);
  await page.getByRole('button', { name: '部屋と見る', exact: true }).click();
  expect(await page.evaluate(el => document.querySelector('.youtube-player') === el, original)).toBe(true);
});
