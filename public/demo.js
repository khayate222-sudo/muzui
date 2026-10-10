import { defaults, salonMarkup, exportSalon, bookingUrl } from './salon.js';
const form = document.querySelector('#salon-form');
const panel = document.querySelector('#editor-panel');
const toggle = document.querySelector('#edit-toggle');
const status = document.querySelector('#editor-status');
const preview = document.querySelector('#salon-preview');
let photos = [];
let busy = false;
for (const [key, value] of Object.entries(defaults)) form.elements.namedItem(key).value = value;
preview.innerHTML = salonMarkup(defaults);
function setPanel(open) { panel.hidden = !open; toggle.setAttribute('aria-expanded', String(open)); if (open) form.elements.namedItem('name').focus(); else toggle.focus(); }
toggle.addEventListener('click', () => setPanel(panel.hidden));
document.querySelector('#close-editor').addEventListener('click', () => setPanel(false));
document.addEventListener('keydown', event => { if (event.key === 'Escape' && !panel.hidden) setPanel(false); });
function getValues() {
  const values = Object.fromEntries(new FormData(form));
  if (!values.name.trim()) throw new Error('サロン名を入力してください。');
  if (values.booking && !bookingUrl(values.booking)) throw new Error('予約先には https:// で始まるURLを入力してください。');
  return values;
}
form.addEventListener('submit', event => {
  event.preventDefault();
  try { preview.innerHTML = salonMarkup(getValues(), photos); status.textContent = 'プレビューに反映しました。閉じるボタンでサイトを確認できます。'; }
  catch (error) { status.textContent = error.message; }
});
document.querySelector('#photos').addEventListener('change', async event => {
  const files = Array.from(event.target.files);
  busy = true;
  event.target.disabled = true;
  status.textContent = '写真を読み込んでいます。';
  try {
    if (files.length > 3) throw new Error('写真は3枚まで選択してください。');
    const next = [];
    for (const file of files) {
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024) throw new Error('写真はJPEG・PNG・WebP形式、1枚5MBまでです。');
      let bitmap;
      try { bitmap = await createImageBitmap(file); }
      catch { throw new Error('写真を読み込めませんでした。別のJPEG・PNG・WebP画像を選んでください。'); }
      try {
        const canvas = document.createElement('canvas');
        const ratio = Math.min(1, 1200 / Math.max(bitmap.width, bitmap.height));
        canvas.width = Math.max(1, Math.round(bitmap.width * ratio)); canvas.height = Math.max(1, Math.round(bitmap.height * ratio));
        canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        next.push(canvas.toDataURL('image/webp', .85));
      } finally { bitmap.close(); }
    }
    photos = next;
    status.textContent = `${photos.length}枚の写真を読み込みました。「プレビューに反映」で確認できます。`;
  } catch (error) { event.target.value = ''; status.textContent = error.message; }
  finally { busy = false; event.target.disabled = false; }
});
document.querySelector('#download').addEventListener('click', async () => {
  try {
    if (busy) throw new Error('写真の読み込みが終わるまでお待ちください。');
    if (!form.reportValidity()) return;
    const values = getValues();
    const response = await fetch('/demo.css');
    if (!response.ok) throw new Error('デザインの取得に失敗しました。再度お試しください。');
    const html = exportSalon(values, await response.text(), photos);
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'salon-preview.html'; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    status.textContent = '確認用HTMLを保存しました。サイトは公開されていません。';
  } catch (error) { status.textContent = error.message; }
});
form.querySelector('button[type="submit"]').disabled = false;
