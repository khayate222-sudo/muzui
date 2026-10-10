export const defaults = {
  name: 'lune nail', tagline: 'わたしに戻る、\n指先からの小さな時間。',
  intro: '気負わずに、心地よく。\n日常にそっとなじむ色と、あなたらしいデザインを。\nひとりひとりに寄り添う、小さなネイルサロンです。',
  menu1: 'ワンカラー', price1: '5,500円', menu2: 'シンプルアート', price2: '6,500円', menu3: 'デザインネイル', price3: '7,500円',
  hours: '10:00〜18:00 / 水曜定休', access: '○○駅から徒歩5分\n詳しい場所は、ご予約時にお知らせします。', booking: '',
};
export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}
export function bookingUrl(value) {
  if (!value) return null;
  try { const url = new URL(value); return url.protocol === 'https:' && url.hostname && !url.username && !url.password ? url.href : null; }
  catch { return null; }
}
export function salonMarkup(input = {}, photos = []) {
  const v = { ...defaults, ...input };
  const e = key => escapeHtml(v[key]);
  const booking = bookingUrl(v.booking);
  const photoMarkup = photos.filter(photo => /^data:image\/webp;base64,[A-Za-z0-9+/=]+$/.test(photo)).slice(0, 3).map((photo, i) => `<figure><img src="${photo}" alt="サロンの提供写真 ${i + 1}"></figure>`).join('');
  return `<header class="salon-nav"><a href="#salon-top" class="salon-logo">${e('name')}</a><nav aria-label="サロン案内"><a href="#menu">MENU</a><a href="#access">ACCESS</a><a href="#reserve">RESERVE</a></nav></header>
  <main id="salon-top"><section class="salon-hero"><div class="salon-hero-copy"><p class="salon-eyebrow">PRIVATE NAIL SALON</p><h1>${e('tagline')}</h1><p class="salon-intro">${e('intro')}</p><a class="salon-button" href="#reserve">ご予約について <span>↗</span></a></div><div class="salon-art" role="img" aria-label="くすみカラーのネイルを描いたイラスト"><span>small moments,<br>beautiful hands.</span><i class="nail-art a1"></i><i class="nail-art a2"></i><i class="nail-art a3"></i><i class="nail-art a4"></i><p>the quiet beauty<br>of everyday.</p></div></section>
  <section class="salon-section salon-about"><p class="salon-eyebrow">A LITTLE TIME FOR YOURSELF</p><h2>日々のなかに、<br>自分を大切にする時間を。</h2><p>指先を見るたび、少しうれしくなる。<br>そんなネイルを、一緒に見つけていきましょう。</p></section>
  ${photoMarkup ? `<section class="salon-section"><p class="salon-eyebrow">GALLERY</p><h2>サロンの風景とデザイン</h2><div class="salon-gallery">${photoMarkup}</div></section>` : ''}
  <section class="salon-section" id="menu"><div class="salon-section-heading"><p class="salon-eyebrow">MENU & PRICE</p><h2>メニュー</h2></div><div class="salon-menus">${[1, 2, 3].map(i => `<article><span>0${i}</span><h3>${e('menu'+i)}</h3><p>${e('price'+i)}</p></article>`).join('')}</div><p class="salon-note">施術内容や追加料金については、ご予約前にお問い合わせください。</p></section>
  <section class="salon-section salon-access" id="access"><div><p class="salon-eyebrow">ACCESS & OPENING HOURS</p><h2>サロンのご案内</h2></div><dl><dt>サロン名</dt><dd>${e('name')}</dd><dt>営業時間・定休日</dt><dd>${e('hours')}</dd><dt>アクセス</dt><dd>${e('access')}</dd></dl></section>
  <section class="salon-reserve" id="reserve"><p class="salon-eyebrow">RESERVATION</p><h2>次のネイルの時間を、<br>楽しみに。</h2><p>ご希望のメニューと日時を添えて、お問い合わせください。</p>${booking ? `<a class="salon-button" href="${escapeHtml(booking)}" target="_blank" rel="noopener noreferrer">予約・お問い合わせ <span>↗</span></a><p class="salon-note">外部の予約・お問い合わせ先が開きます。</p>` : '<p class="salon-unset">予約先はまだ設定されていません。</p>'}</section></main>
  <footer class="salon-footer"><span class="salon-logo">${e('name')}</span><span>PRIVATE NAIL SALON</span></footer>`;
}
export function exportSalon(input, css, photos = []) {
  return `<!doctype html>\n<html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(input.name || defaults.name)}</title><style>${css.replace(/<\/style/gi, '<\\/style')}</style></head><body>${salonMarkup(input, photos)}</body></html>`;
}
