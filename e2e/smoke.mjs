import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createServer } from '../server.js';
const server = createServer();
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = process.env.TEST_BASE_URL || `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
await mkdir('artifacts', { recursive: true });
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error' && !message.text().includes('favicon')) errors.push(message.text()); });
  await page.goto(base);
  await page.getByText('ご相談を受け付けています。', { exact: false }).waitFor();
  await page.screenshot({ path: 'artifacts/sales-desktop.png', fullPage: true });
  await page.locator('#salon-name').fill('テストネイル');
  await page.locator('#salon-message').fill('住所を非公開にしたいです。');
  await page.getByRole('button', { name: '相談文を作る' }).click();
  const href = await page.locator('#contact-link').getAttribute('href');
  const mail = new URL(href);
  assert.equal(mail.pathname, 'naoto.ando@unique-travel-jp.com');
  assert.match(mail.searchParams.get('body'), /テストネイル/);
  assert.match(mail.searchParams.get('body'), /5,000円/);
  await page.goto(base + '/growth?service=advisory#consult');
  await page.waitForFunction(() => document.querySelector('#salon-service').value === 'advisory');
  await page.locator('#salon-name').fill('テストホテル');
  await page.getByRole('button', { name: '相談文を作る' }).click();
  const growthMail = new URL(await page.locator('#contact-link').getAttribute('href'));
  assert.equal(growthMail.pathname, 'naoto.ando@unique-travel-jp.com');
  assert.match(growthMail.searchParams.get('body'), /200,000円〜／月/);
  assert.doesNotMatch(growthMail.searchParams.get('body'), /5,000円/);
  await page.locator('#salon-service').selectOption('growth');
  await page.getByRole('button', { name: '相談文を作る' }).click();
  assert.match(await page.locator('#brief-text').inputValue(), /60分の無料ヒアリング/);
  await page.screenshot({ path: 'artifacts/growth-desktop.png', fullPage: true });
  await page.goto(base + '/demo');
  await page.getByRole('button', { name: '自分のお店で試す' }).click();
  await page.locator('#name').fill('nail room mio');
  await page.locator('#booking').fill('https://example.com/reserve');
  await page.getByRole('button', { name: 'プレビューに反映' }).click();
  assert.equal(await page.locator('.salon-nav .salon-logo').textContent(), 'nail room mio');
  assert.equal(await page.locator('#reserve .salon-button').getAttribute('href'), 'https://example.com/reserve');
  const pngData = await page.evaluate(() => {
    const canvas = document.createElement('canvas'); canvas.width = 100; canvas.height = 100;
    const ctx = canvas.getContext('2d'); ctx.fillStyle = '#dac3b0'; ctx.fillRect(0, 0, 100, 100);
    return canvas.toDataURL('image/png').split(',')[1];
  });
  const tinyImage = Buffer.from(pngData, 'base64');
  await page.locator('#photos').setInputFiles({ name: 'sample.png', mimeType: 'image/png', buffer: tinyImage });
  await page.getByText('1枚の写真を読み込みました。', { exact: false }).waitFor();
  await page.getByRole('button', { name: 'プレビューに反映' }).click();
  assert.equal(await page.locator('.salon-gallery img').count(), 1);
  const downloadEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: 'この内容で確認用HTMLを保存' }).click();
  const download = await downloadEvent;
  const html = await readFile(await download.path(), 'utf8');
  assert.match(html, /nail room mio/); assert.match(html, /data:image\/webp;base64/); assert.doesNotMatch(html, /<script/);
  await writeFile('artifacts/sample-delivery.html', html);
  await page.getByRole('button', { name: '編集画面を閉じる' }).click();
  await page.screenshot({ path: 'artifacts/demo-desktop.png', fullPage: true });
  await page.goto(base + '/demo');
  await page.getByRole('button', { name: '自分のお店で試す' }).click();
  await page.locator('#name').fill('<script>window.__injected=true</script>');
  await page.getByRole('button', { name: 'プレビューに反映' }).click();
  assert.equal(await page.evaluate(() => window.__injected), undefined);
  await page.getByRole('button', { name: '編集画面を閉じる' }).click();
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    for (const route of ['/', '/demo', '/terms', '/growth']) {
      await page.goto(base + route);
      if (route === '/demo') await page.locator('.salon-nav').waitFor();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
      assert.equal(overflow, false, `overflow at ${width} ${route}`);
      if (width === 390 && route !== '/terms') await page.screenshot({ path: `artifacts/${route === '/' ? 'sales' : route.slice(1)}-mobile.png`, fullPage: true });
    }
  }
  assert.deepEqual(errors, []);
  await context.close();
  console.log('Browser checks passed: consultation mail, personalization, photo upload, standalone export, input escaping, mobile layout (390/320px).');
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
