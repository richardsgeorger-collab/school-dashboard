// Tells the search engines behind IndexNow (Bing, Yandex, DuckDuckGo, Naver, Seznam) that the site's pages changed,
// right after a deploy. No account: the key is proven by the file served at the site root. Google does not take
// IndexNow; it finds the sitemap on its own.   node scripts/indexnow.mjs
const host = 'richardsgeorger-collab.github.io';
const base = `https://${host}/school-dashboard/`;
const key = '2a8e7ee70ccf5046a1a40ff8ba4d0d56';
const urlList = [base, `${base}privacy.html`, `${base}terms.html`];
const served = await fetch(`${base}${key}.txt`).then((r) => (r.ok ? r.text() : '')).catch(() => '');
if (served.trim() !== key) {
  console.log(`key file not served yet at ${base}${key}.txt; nothing submitted`);
  process.exit(0);
}
const r = await fetch('https://api.indexnow.org/indexnow', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json; charset=utf-8' },
  body: JSON.stringify({ host, key, keyLocation: `${base}${key}.txt`, urlList }),
});
console.log(`IndexNow ${r.status} ${r.statusText} for ${urlList.length} urls`);
process.exit(r.status === 200 || r.status === 202 ? 0 : 1);
