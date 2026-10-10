export function buildBrief(values) {
  const salon = String(values.salon ?? '').trim();
  if (!salon) throw new Error('会社・店舗・施設名を入力してください。');
  const subject = {
    website: 'UNIQUE TRAVEL JAPANの1ページ制作プラン（支払総額5,000円）について相談したいです。',
    'website-growth': 'サイト制作（支払総額5,000円）と、集客内製化支援（別途見積もり）について相談したいです。',
    growth: 'SNS・予約サイト・Googleマップなどの集客内製化支援について、60分の無料ヒアリングを相談したいです。',
    spot: '集客内製化支援のスポット相談（50,000円〜／回）について相談したいです。税区分と実費を含め、お見積もりをお願いします。',
    advisory: '集客内製化支援の月次顧問（200,000円〜／月）について相談したいです。税区分・実費・契約期間を含め、お見積もりをお願いします。',
    project: '開業支援・AI導入のプロジェクト型プラン（個別見積もり）について相談したいです。',
  }[values.service] || 'UNIQUE TRAVEL JAPANの1ページ制作プラン（支払総額5,000円）について相談したいです。';
  return [subject, `会社・店舗・施設名：${salon}`, values.social?.trim() && `お店のURL：${values.social.trim()}`, `ご希望・ご質問：\n${values.message?.trim() || '対応内容と料金について相談したいです。'}`, '対応範囲・料金・納期・支払方法・キャンセル条件を確認してから、注文を検討したいです。'].filter(Boolean).join('\n\n');
}
export function contactWithBrief(contact, text) {
  const url = new URL(contact);
  if (url.protocol === 'mailto:') {
    url.search = new URLSearchParams({ subject: 'UNIQUE TRAVEL JAPANへのご相談', body: text }).toString();
  }
  return url.href;
}
if (typeof document !== 'undefined') {
  let contactUrl = null;
  const state = document.querySelector('#contact-state');
  try {
    const response = await fetch('/config.json');
    if (!response.ok) throw new Error('config unavailable');
    ({ contactUrl } = await response.json());
    state.textContent = contactUrl ? 'ご相談を受け付けています。下の相談文を、受付先にお送りください。' : '現在、相談窓口の準備中です。デモと相談文の作成はお試しいただけます。';
    if (contactUrl?.startsWith('mailto:')) {
      const address = document.querySelector('#contact-address');
      address.textContent = `相談メール：${new URL(contactUrl).pathname}（メールアプリがない場合は、相談文をコピーしてこの宛先にお送りください）`;
      address.hidden = false;
    }
  } catch { state.textContent = '受付状況を確認できませんでした。時間をおいて再読み込みしてください。'; }
  const form = document.querySelector('#brief-form');
  const text = document.querySelector('#brief-text');
  const requested = new URLSearchParams(location.search).get('service');
  const select = form.elements.namedItem('service');
  if (requested && Array.from(select.options).some(option => option.value === requested)) select.value = requested;
  const status = document.querySelector('#brief-status');
  form.addEventListener('submit', event => {
    event.preventDefault();
    try {
      text.value = buildBrief(Object.fromEntries(new FormData(form)));
      document.querySelector('#brief-result').hidden = false;
      const link = document.querySelector('#contact-link');
      if (contactUrl) {
        link.href = contactWithBrief(contactUrl, text.value);
        link.hidden = false;
        status.textContent = contactUrl.startsWith('mailto:') ? '相談先を開くとメールアプリが起動します。内容を確認し、ご自身で送信してください。' : '相談文をコピーして、開いた相談先に貼り付けて送信してください。';
      } else status.textContent = '相談文を作成しました。受付先は準備中のため、まだ送信できません。';
    } catch (error) { status.textContent = error.message; }
  });
  document.querySelector('#copy-brief').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(text.value); status.textContent = '相談文をコピーしました。まだ送信はされていません。'; }
    catch { text.focus(); text.select(); status.textContent = '相談文を選択しました。端末のコピー操作をご利用ください。'; }
  });
  form.querySelector('button[type="submit"]').disabled = false;
}
