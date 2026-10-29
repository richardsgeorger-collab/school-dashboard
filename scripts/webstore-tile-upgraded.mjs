// The promo tile, "GCU's Halo, upgraded." (George, 2026-10-29): the tile live on the store kept exactly (dark, the
// "Halo+" wordmark top left, a big two-line headline, a short subline, the gold "Free" pill, the big gold Halo+ ring on
// the right at its size), only the words changed; four sublines (A to D). Each is a real 440×280 24-bit PNG; the sheet
// shows all four at full and half size and each mocked in the store's search results right under Better Halo's tile.
// Fit is measured, never guessed: the subline must fit in two lines left of the ring and above the pill.
//   COMPETITOR_TILES=<dir with bh-tile.png> node scripts/webstore-tile-upgraded.mjs
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from 'playwright-core';

const OUT = resolve('docs/webstore/tile-upgraded');
mkdirSync(OUT, { recursive: true });
const font = (f) => `data:font/woff2;base64,${readFileSync(resolve(`extension/fonts/${f}`)).toString('base64')}`;
const FONTS = `@font-face{font-family:Jakarta;src:url(${font('PlusJakartaSans.woff2')}) format('woff2');font-weight:200 800}@font-face{font-family:Inter;src:url(${font('Inter.woff2')}) format('woff2');font-weight:100 900}`;
export const TILES = [
  { id: 'A', sub: 'Due dates, grades and one calendar, right on Halo.' },
  { id: 'B', sub: 'What’s next on every class, right on Halo.' },
  { id: 'C', sub: 'Search, calendar and what’s next, right on Halo.' },
  // George's D, "What's next on every class, your grades and one calendar, right on Halo.", needs three lines (it runs
  // into the Free pill); the one cut that fits two drops "on every class".
  { id: 'D', sub: 'What’s next, your grades and one calendar, right on Halo.' },
];
const RING = '<svg class="ring" viewBox="0 0 64 64"><path d="M52.6 26.5A21.3 21.3 0 1 1 37.5 11.4" fill="none" stroke="#f2b84b" stroke-width="6" stroke-linecap="round"/><path d="M47.1 9.3v15.2M39.5 16.9h15.2" stroke="#f2f4f7" stroke-width="6.5" stroke-linecap="round"/></svg>';
// The live tile's layout, measured from it (440×280): wordmark at 34,31; headline 36 px at y 78; subline 15.5 px; pill at
// y 212; the ring 140 px, centred at x 352, y 118.
const tile = (sub) => `<!doctype html><html><head><meta charset="utf-8"><style>${FONTS}
html,body{margin:0;background:#fff}*{box-sizing:border-box}
#t{width:440px;height:280px;overflow:hidden;background:#0b0d10;color:#f2f4f7;position:relative;-webkit-font-smoothing:antialiased}
.glow{position:absolute;right:-60px;top:-80px;width:340px;height:340px;border-radius:50%;background:radial-gradient(circle,rgba(242,184,75,.17),rgba(242,184,75,0) 65%)}
.ring{position:absolute;left:282px;top:48px;width:140px;height:140px}
.name{position:absolute;left:33px;top:30px;margin:0;font:800 26px/1 Jakarta;letter-spacing:-.02em}
.name span{color:#f2b84b}
.head{position:absolute;left:32px;top:76px;margin:0;font:800 35px/1.06 Jakarta;letter-spacing:-.035em;width:250px}
.sub{position:absolute;left:33px;top:156px;margin:0;font:600 15.5px/1.32 Inter;color:#d3d8df;width:248px}
.pill{position:absolute;left:33px;top:212px;height:31px;padding:0 17px;border-radius:16px;background:#f2b84b;color:#14171c;font:800 15px/31px Jakarta}
</style></head><body><div id="t"><div class="glow"></div>${RING}<p class="name">Halo<span>+</span></p><p class="head">GCU’s Halo,<br>upgraded.</p><p class="sub">${sub}</p><span class="pill">Free</span></div></body></html>`;

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const p = await (await browser.newContext({ viewport: { width: 1600, height: 1200 }, deviceScaleFactor: 1 })).newPage();
const rgb = (f) => execFileSync('python3', ['-c', `from PIL import Image\nim=Image.open('${f}').convert('RGB')\nassert im.size==(440,280)\nim.save('${f}')`]);
const fits = {};
for (const t of TILES) {
  await p.setContent(tile(t.sub), { waitUntil: 'load' });
  await p.evaluate(() => document.fonts.ready);
  const m = await p.evaluate(() => {
    const r = (s) => document.querySelector(s).getBoundingClientRect();
    const sub = r('.sub');
    const lh = parseFloat(getComputedStyle(document.querySelector('.sub')).lineHeight);
    return { lines: Math.round(sub.height / lh), subBottom: sub.bottom, subRight: sub.right, pillTop: r('.pill').top, ringLeft: r('.ring').left, headLines: Math.round(r('.head').height / (35 * 1.06)) };
  });
  fits[t.id] = { ...m, ok: m.lines <= 2 && m.subBottom <= m.pillTop - 8 && m.subRight <= m.ringLeft && m.headLines === 2 };
  console.log(t.id, JSON.stringify(fits[t.id]));
  await p.locator('#t').screenshot({ path: `${OUT}/${t.id}.png` });
  rgb(`${OUT}/${t.id}.png`);
  execFileSync('python3', ['-c', `from PIL import Image\nImage.open('${OUT}/${t.id}.png').resize((220,140), Image.LANCZOS).save('${OUT}/${t.id}-half.png')`]);
}

// The sheet: the four at full and half size, then each in the store's results right under Better Halo's tile.
const b64 = (f) => `data:image/png;base64,${readFileSync(f).toString('base64')}`;
const COMP = process.env.COMPETITOR_TILES;
const bh = COMP ? b64(`${COMP}/bh-tile.png`) : null;
const TITLE = 'Halo+ for GCU: Search, Calendar & Due Dates on Halo LMS';
const SUMMARY = 'Search every GCU Halo class with Ctrl+K, see what’s next and your grade on every class, and open rubrics in place. Free on Halo LMS.';
const row = (img, title, site, summary, check) => `<div class="r"><img class="tl" src="${img}" width="275" height="175"><div class="tx"><div class="tt">${title}</div><div class="st">${site}${check ? ' <b class="ck">✓</b>' : ''}</div><div class="sr">5.0 ★</div><div class="sm">${summary}</div></div></div>`;
const html = `<!doctype html><html><head><meta charset="utf-8"><style>${FONTS}
body{margin:0;background:#eef0f3;font:14px/1.4 Inter;color:#14171c}#t{padding:32px;width:1900px}
h1{font:800 26px/1 Jakarta;margin:0 0 6px}h2{font:800 19px/1 Jakarta;margin:34px 0 14px}.note{color:#5b6270;margin:0 0 18px}
.g{display:grid;grid-template-columns:repeat(4,440px);gap:26px}.c{display:flex;flex-direction:column;gap:8px}.c b{font:700 15px Inter}
.c img{display:block;border-radius:8px;box-shadow:0 1px 3px rgba(0,0,0,.18)}.c small{color:#5b6270}
.res{display:grid;grid-template-columns:repeat(2,900px);gap:22px}.mock{background:#fff;border-radius:12px;padding:16px 22px;box-shadow:0 1px 3px rgba(0,0,0,.12)}
.mock .q{font:500 14px Inter;color:#5f6368;margin:0 0 4px}.r{display:flex;gap:20px;padding:12px 0;border-bottom:1px solid #eceef1}.r:last-child{border:0}
.tl{border-radius:8px;border:1px solid #e3e6ea}.tx{padding-top:4px;min-width:0}.tt{font:500 16px/1.3 Inter;color:#202124;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;width:560px}
.st{font:13px/1.6 Inter;color:#5f6368}.ck{color:#1a73e8}.sr{font:500 13px/1.6 Inter;color:#202124}.sm{font:14px/1.45 Inter;color:#3c4043;margin-top:4px;max-width:560px}
</style></head><body><div id="t">
<h1>“GCU’s Halo, upgraded.” · four sublines</h1><p class="note">The live tile’s design, only the words changed. 440×280, 24-bit PNG. D is George’s pick.</p>
<div class="g">${TILES.map((t) => `<div class="c"><b>${t.id}${t.id === 'D' ? ' (pick)' : ''}</b><small>${t.sub}</small><img src="${b64(`${OUT}/${t.id}.png`)}" width="440" height="280"><img src="${b64(`${OUT}/${t.id}-half.png`)}" width="220" height="140"><small>half size</small></div>`).join('')}</div>
${bh ? `<h2>In the store’s search results, right under Better Halo (a mock)</h2><div class="res">${TILES.map((t) => `<div class="mock"><p class="q">${t.id}</p>${row(bh, 'Better Halo', 'betterhalo.app', 'Enhance Halo LMS with customizable themes, auto dark mode, assignment tracking, font customization, and confetti celebrations.', true)}${row(b64(`${OUT}/${t.id}.png`), TITLE, 'haloplus.app', SUMMARY, false)}</div>`).join('')}</div>` : ''}
</div></body></html>`;
await p.setContent(html, { waitUntil: 'load' });
await p.evaluate(() => document.fonts.ready);
await p.locator('#t').screenshot({ path: resolve('docs/webstore/tile-upgraded.png') });
await browser.close();
console.log(JSON.stringify(Object.fromEntries(Object.entries(fits).map(([k, v]) => [k, v.ok]))));
