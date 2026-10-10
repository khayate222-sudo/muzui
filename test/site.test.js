import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer, safeContact } from '../server.js';
import { buildBrief, contactWithBrief } from '../public/app.js';
import { defaults, salonMarkup, exportSalon, bookingUrl } from '../public/salon.js';

test('consultation includes price and does not become an automatic order', () => {
  const brief = buildBrief({ salon: 'mio', social: 'https://example.com', message: '住所は非公開にしたい' });
  assert.match(brief, /5,000円/); assert.match(brief, /サロン名：mio/); assert.match(brief, /住所は非公開/); assert.match(brief, /注文を検討/);
  assert.throws(() => buildBrief({ salon: '  ' }));
  const link = new URL(contactWithBrief('mailto:info.creatordrop@gmail.com', brief));
  assert.equal(link.pathname, 'info.creatordrop@gmail.com');
  assert.equal(link.searchParams.get('body'), brief);
});
test('URLs reject unsafe protocols and credentials', () => {
  for (const url of ['javascript:alert(1)', 'data:text/html,hello', 'http://example.com', 'https://user:pass@example.com']) {
    assert.equal(safeContact(url), null); assert.equal(bookingUrl(url), null);
  }
  assert.equal(safeContact('mailto:info.creatordrop@gmail.com'), 'mailto:info.creatordrop@gmail.com');
  assert.equal(bookingUrl('https://lin.ee/example'), 'https://lin.ee/example');
});
test('personalized salon preserves input as text and exports a standalone page', () => {
  const input = { ...defaults, name: '<img src=x onerror=alert(1)>', intro: '</p><script>alert(1)</script>', booking: 'javascript:alert(1)' };
  const html = exportSalon(input, 'body{color:tan}');
  assert.match(html, /&lt;img/); assert.match(html, /&lt;script&gt;/);
  assert.doesNotMatch(html, /<script|<img src=x|href="javascript:/);
  assert.match(html, /予約先はまだ設定されていません/);
  assert.match(html, /<style>body\{color:tan\}<\/style>/);
  const valid = salonMarkup({ booking: 'https://example.com/?a=1&b=2' }, ['data:image/webp;base64,AAAA', 'data:image/svg+xml;base64,AAAA']);
  assert.match(valid, /href="https:\/\/example.com\/\?a=1&amp;b=2"/);
  assert.equal((valid.match(/<img /g) || []).length, 1);
});
test('site routes and explicit contact config respond correctly', async t => {
  const server = createServer({ CONTACT_URL: 'mailto:info.creatordrop@gmail.com' });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const origin = `http://127.0.0.1:${server.address().port}`;
  for (const route of ['/', '/demo', '/terms', '/app.js', '/demo.js', '/demo.css', '/style.css', '/salon.js']) {
    const response = await fetch(origin + route); assert.equal(response.status, 200, route);
    assert.ok((await response.text()).length > 100, route);
    assert.match(response.headers.get('content-security-policy'), /object-src 'none'/);
  }
  const config = await fetch(origin + '/config.json');
  assert.deepEqual(await config.json(), { contactUrl: 'mailto:info.creatordrop@gmail.com' });
  assert.equal((await fetch(origin + '/missing')).status, 404);
  assert.equal((await fetch(origin + '/site.config.json')).status, 404);
  assert.equal((await fetch(origin + '/', { method: 'POST' })).status, 405);
});
test('missing or unsafe contact is not advertised as an active endpoint', async t => {
  const server = createServer({ CONTACT_URL: 'javascript:alert(1)' });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const response = await fetch(`http://127.0.0.1:${server.address().port}/config.json`);
  assert.deepEqual(await response.json(), { contactUrl: null });
});
