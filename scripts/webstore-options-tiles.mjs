// Promo tile options for the Chrome Web Store (George's overnight brief, 2026-10-29): at least five concepts, each a real
// 440×280 24-bit PNG (no alpha) designed as a tile, never a cropped test screenshot; each shown at full size and at half
// size beside the tile live now and the pending one; and each mocked in the store's search results next to Better
// Halo's tile (the results card shows the tile at 275×175). The mocks with other extensions' tiles are for George only:
// they go to local-only/ (git-ignored, the repo is public).
//   [COMPETITOR_TILES=<dir with bh-tile.png, hgc-tile.png>] node scripts/webstore-options-tiles.mjs
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from 'playwright-core';

const DIR = resolve('docs/webstore/options-2026-10-29');
const TILES = `${DIR}/tiles`;
const LOCAL = `${DIR}/local-only`;
for (const d of [TILES, LOCAL]) mkdirSync(d, { recursive: true });
const FONTS = `@font-face{font-family:Jakarta;src:url(data:font/woff2;base64,${readFileSync(resolve('extension/fonts/PlusJakartaSans.woff2')).toString('base64')}) format('woff2');font-weight:200 800}
@font-face{font-family:Inter;src:url(data:font/woff2;base64,${readFileSync(resolve('extension/fonts/Inter.woff2')).toString('base64')}) format('woff2');font-weight:100 900}`;
const b64 = (p) => `data:image/png;base64,${readFileSync(p).toString('base64')}`;
/** Halo+'s mark: the gold ring that opens at the top right, and the plus. */
const mark = (ring, plus, size) => `<svg width="${size}" height="${size}" viewBox="0 0 64 64" aria-hidden="true"><path d="M52.6 26.5A21.3 21.3 0 1 1 37.5 11.4" fill="none" stroke="${ring}" stroke-width="6" stroke-linecap="round"/><path d="M47.1 9.3v15.2M39.5 16.9h15.2" stroke="${plus}" stroke-width="6.5" stroke-linecap="round"/></svg>`;
const GOLD = '#f2b84b';
const INK = '#14171c';
const PURPLE = '#522398';

export const CONCEPTS = [
  {
    id: 'A-gold',
    name: 'Gold',
    why: 'Halo+’s own gold, edge to edge. Every other Halo tile is dark or purple, so this is the one a student sees first in the results. The name, who it is for, and the three things it does.',
    css: `#t{background:${GOLD};color:${INK}}
.mk{position:absolute;right:30px;top:42px}
.w{position:absolute;left:34px;top:46px;font:800 92px/1 Jakarta;letter-spacing:-.045em}
.f{position:absolute;left:38px;top:148px;font:700 24px/1 Jakarta;letter-spacing:-.01em;opacity:.82}
.l{position:absolute;left:38px;bottom:32px;font:700 19px/1 Inter;letter-spacing:.005em}
.l i{font-style:normal;opacity:.45;margin:0 8px}`,
    html: `<div class="mk">${mark(INK, INK, 118)}</div><div class="w">Halo+</div><div class="f">for GCU’s Halo</div><div class="l">Search<i>·</i>Calendar<i>·</i>What’s next</div>`,
  },
  {
    id: 'B-halo-bar',
    name: 'White, under Halo’s bar',
    why: 'Looks like Halo itself (its purple bar across the top), then Halo+ in ink on white with the gold mark: “this goes on Halo”. Light, so it also stands out from the dark tiles.',
    css: `#t{background:#fff;color:${INK}}
.bar{position:absolute;left:0;right:0;top:0;height:46px;background:${PURPLE};display:flex;align-items:center;padding:0 22px;gap:14px}
.bar b{font:800 17px/1 Inter;letter-spacing:.12em;color:#fff}
.bar span{width:74px;height:20px;border-radius:4px;background:rgba(255,255,255,.18)}
.mk{position:absolute;left:30px;top:86px}
.w{position:absolute;left:132px;top:92px;font:800 74px/1 Jakarta;letter-spacing:-.045em}
.l{position:absolute;left:34px;bottom:34px;font:600 22px/1.2 Jakarta;letter-spacing:-.01em;color:#4b5261}
.l b{color:${INK}}`,
    html: `<div class="bar"><b>HALO</b><span></span><span></span></div><div class="mk">${mark(GOLD, INK, 88)}</div><div class="w">Halo+</div><div class="l"><b>Your week,</b> right on Halo.</div>`,
  },
  {
    id: 'C-purple',
    name: 'Halo purple',
    why: 'Halo’s own purple with the gold mark: the most “GCU” of the set. Close to Halo Global Calendar’s purple, so it has to win on the mark and the line.',
    css: `#t{background:linear-gradient(135deg,#5a2aa3,#43207c);color:#fff}
.mk{position:absolute;left:30px;top:50%;transform:translateY(-50%)}
.w{position:absolute;left:176px;top:70px;font:800 76px/1 Jakarta;letter-spacing:-.045em}
.l{position:absolute;left:180px;top:160px;font:600 22px/1.25 Inter;color:#e7dcfb;width:240px}`,
    html: `<div class="mk">${mark(GOLD, '#fff', 128)}</div><div class="w">Halo+</div><div class="l">What’s next,<br>on every class.</div>`,
  },
  {
    id: 'D-search',
    name: 'The search bar',
    why: 'One thing only Halo+ does, drawn big enough to read at the small size: a search bar with ⌘K. Dark like Halo’s night look, with the name above it.',
    css: `#t{background:${INK};color:#f2f4f7}
.top{position:absolute;left:0;right:0;top:46px;display:flex;justify-content:center;align-items:center;gap:12px;font:800 44px/1 Jakarta;letter-spacing:-.04em}
.top small{font:700 20px/1 Jakarta;color:${GOLD};letter-spacing:0;margin-top:12px}
.bar{position:absolute;left:34px;right:34px;top:132px;height:76px;border-radius:38px;background:#fff;display:flex;align-items:center;padding:0 16px 0 22px;gap:14px;color:${INK};box-shadow:0 10px 30px rgba(0,0,0,.35)}
.bar .q{flex:1;font:600 23px/1 Inter;color:#5b6270;white-space:nowrap}
.bar kbd{font:700 19px/1 Inter;border:2px solid #d5d9e0;border-radius:9px;padding:9px 11px;color:${INK}}
.l{position:absolute;left:0;right:0;bottom:26px;text-align:center;font:500 15px/1 Inter;color:#9aa3b0}`,
    html: `<div class="top">Halo+<small>for GCU</small></div><div class="bar">${mark(GOLD, INK, 38)}<span class="q">Search every class</span><kbd>⌘K</kbd></div><div class="l">On any Halo page</div>`,
  },
  {
    id: 'E-mark',
    name: 'The mark, big',
    why: 'Wordmark-first, the pattern the biggest student extensions use: the gold ring-plus large, the name, “for GCU”. Nothing to read but the name; the title and summary beside it do the rest.',
    css: `#t{background:radial-gradient(circle at 26% 50%,#2a2416 0,#0f1115 62%);color:#f2f4f7}
.mk{position:absolute;left:34px;top:50%;transform:translateY(-50%)}
.w{position:absolute;left:200px;top:88px;font:800 76px/1 Jakarta;letter-spacing:-.045em}
.w span{color:${GOLD}}
.f{position:absolute;left:204px;top:176px;font:700 24px/1 Jakarta;color:${GOLD}}`,
    html: `<div class="mk">${mark(GOLD, '#f2f4f7', 140)}</div><div class="w">Halo<span>+</span></div><div class="f">for GCU</div>`,
  },
  {
    id: 'F-gold-search',
    name: 'Gold, with the search bar',
    why: 'A and D together: the gold that stands out, and the one thing only Halo+ does. The bar is the promise, so there is no slogan to read.',
    css: `#t{background:${GOLD};color:${INK}}
.top{position:absolute;left:34px;top:40px;display:flex;align-items:center;gap:14px}
.top b{font:800 64px/1 Jakarta;letter-spacing:-.045em}
.top small{font:700 22px/1 Jakarta;opacity:.8;margin-top:16px}
.bar{position:absolute;left:34px;right:34px;top:142px;height:74px;border-radius:37px;background:#fff;display:flex;align-items:center;padding:0 16px 0 22px;gap:14px;box-shadow:0 8px 22px rgba(80,55,0,.28)}
.bar .q{flex:1;font:600 23px/1 Inter;color:#5b6270;white-space:nowrap}
.bar kbd{font:700 19px/1 Inter;border:2px solid #d5d9e0;border-radius:9px;padding:9px 11px}
.l{position:absolute;left:36px;bottom:22px;font:600 15px/1 Inter;opacity:.75}`,
    html: `<div class="top">${mark(INK, INK, 62)}<b>Halo+</b><small>for GCU</small></div><div class="bar">${mark(GOLD, INK, 34)}<span class="q">Search every class</span><kbd>⌘K</kbd></div><div class="l">Right on Halo</div>`,
  },
];

const page = (inner, css, w = 440, h = 280) => `<!doctype html><html><head><meta charset="utf-8"><style>${FONTS}
html,body{margin:0;background:#fff}*{box-sizing:border-box}
#t{width:${w}px;height:${h}px;position:relative;overflow:hidden;-webkit-font-smoothing:antialiased}
${css}</style></head><body><div id="t">${inner}</div></body></html>`;
const rgb = (p) => execFileSync('python3', ['-c', `from PIL import Image\nim=Image.open('${p}').convert('RGB')\nim.save('${p}')\nprint(im.size, im.mode)`]).toString().trim();
const half = (src, out) => execFileSync('python3', ['-c', `from PIL import Image\nim=Image.open('${src}').convert('RGB')\nim.resize((220,140), Image.LANCZOS).save('${out}')`]);

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const ctx = await browser.newContext({ viewport: { width: 1400, height: 1000 }, deviceScaleFactor: 1 });
const p = await ctx.newPage();
const shot = async (html, path, sel = '#t') => {
  await p.setContent(html, { waitUntil: 'load' });
  await p.evaluate(() => document.fonts.ready);
  await p.waitForTimeout(150);
  await p.locator(sel).screenshot({ path });
};

// The two tiles before these: the one live on the store now (webstore-upload/tile.html) and the pending one.
const LIVE = `${TILES}/0-live-now.png`;
const PENDING = `${TILES}/0-pending.png`;
await p.goto(`file://${resolve('webstore-upload/tile.html')}`, { waitUntil: 'load' });
await p.evaluate(() => document.fonts.ready);
await p.locator('#tile').screenshot({ path: LIVE });
rgb(LIVE);
execFileSync('cp', [resolve('webstore-upload/promo-tile-440x280.png'), PENDING]);

for (const c of CONCEPTS) {
  const full = `${TILES}/${c.id}.png`;
  await shot(page(c.html, c.css), full);
  console.log(`${c.id}: ${rgb(full)}`);
  half(full, `${TILES}/${c.id}-half.png`);
}

// Each concept beside the two before it, full and half size.
const label = (t, s = '') => `<div class="lb">${t}${s ? `<small>${s}</small>` : ''}</div>`;
const SHEET = `body{background:#eef0f3;font:14px/1.4 Inter}.sheet{padding:28px;display:flex;gap:26px;align-items:flex-start;width:max-content}
.c{display:flex;flex-direction:column;gap:8px}.c img{display:block;border-radius:8px;box-shadow:0 1px 3px rgba(0,0,0,.15)}
.lb{font:700 14px/1.3 Inter;color:#14171c}.lb small{display:block;font-weight:500;color:#5b6270}
h1{font:800 24px/1 Jakarta;margin:0 0 4px}.why{max-width:1300px;color:#4b5261;margin:0 0 18px}`;
for (const c of CONCEPTS) {
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>${FONTS}${SHEET}</style></head><body><div class="sheet" id="t"><div class="c" style="width:1460px"><h1>${c.id} · ${c.name}</h1><p class="why">${c.why}</p><div style="display:flex;gap:26px;align-items:flex-start">
<div class="c">${label('New', '440×280')}<img src="${b64(`${TILES}/${c.id}.png`)}" width="440" height="280"></div>
<div class="c">${label('New, half size', '220×140 (the results card shows it at 275×175)')}<img src="${b64(`${TILES}/${c.id}-half.png`)}" width="220" height="140"></div>
<div class="c">${label('Live now', 'the 0.11.1 listing')}<img src="${b64(LIVE)}" width="440" height="280"></div>
<div class="c">${label('Pending', '“Halo, but better.”')}<img src="${b64(PENDING)}" width="440" height="280"></div></div></div></div></body></html>`;
  await shot(html, `${TILES}/compare-${c.id}.png`);
}

// All six at a glance, full and half.
{
  const cells = CONCEPTS.map((c) => `<div class="c">${label(`${c.id} · ${c.name}`)}<img src="${b64(`${TILES}/${c.id}.png`)}" width="440" height="280"><img src="${b64(`${TILES}/${c.id}-half.png`)}" width="220" height="140"></div>`).join('');
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>${FONTS}${SHEET}.g{display:grid;grid-template-columns:repeat(3,440px);gap:30px 26px}</style></head><body><div class="sheet" id="t"><div class="c"><h1>Promo tile options · 2026-10-29</h1><p class="why">Each at 440×280 and at half size. Live now and pending tiles: see compare-*.png.</p><div class="g">${cells}</div></div></div></body></html>`;
  await shot(html, `${DIR}/overview-tiles.png`);
}

// In the store's search results ("GCU"), next to Better Halo: George only (other extensions' tiles), git-ignored.
const COMP = process.env.COMPETITOR_TILES;
if (COMP && existsSync(`${COMP}/bh-tile.png`)) {
  const TITLE = process.env.MOCK_TITLE ?? 'Halo+ for GCU: Search, Calendar & Due Dates on Halo LMS';
  const SUMMARY = process.env.MOCK_SUMMARY ?? 'Faster GCU Halo LMS, right on the page: search every class (⌘K), one calendar, what’s next on every class, rubrics. Free.';
  const row = (tile, title, site, summary, check = false) => `<div class="r"><img class="tl" src="${tile}" width="275" height="175"><div class="tx"><div class="tt">${title}</div><div class="st">${site}${check ? ' <span class="ck">✓</span>' : ''}</div><div class="sr">5.0 <span>★</span></div><div class="sm">${summary}</div></div></div>`;
  const CSS = `body{background:#fff;font:14px/1.4 Inter}.res{width:900px;padding:24px 28px}.q{font:500 15px Inter;color:#5f6368;margin:0 0 14px}
.r{display:flex;gap:20px;padding:14px 0;border-bottom:1px solid #eceef1}.tl{border-radius:8px;border:1px solid #e3e6ea;object-fit:cover}
.tx{min-width:0;padding-top:4px}.tt{font:500 16px/1.3 Inter;color:#202124;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;width:560px}
.st{font:400 13px/1.6 Inter;color:#5f6368}.ck{color:#1a73e8;font-weight:700}.sr{font:500 13px/1.6 Inter;color:#202124}.sr span{color:#202124}
.sm{font:400 14px/1.45 Inter;color:#3c4043;margin-top:4px;max-width:560px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.ic{width:275px;height:175px;border-radius:8px;border:1px solid #e3e6ea;display:grid;place-items:center;background:#fff}.ic b{width:64px;height:64px;border-radius:14px;background:#9aa0a6;color:#fff;display:grid;place-items:center;font:700 22px Inter}`;
  const bhRow = row(b64(`${COMP}/bh-tile.png`), 'Better Halo', 'betterhalo.app', 'Enhance Halo LMS with customizable themes, auto dark mode, assignment tracking, font customization, and confetti celebrations.', true);
  const other = `<div class="r"><div class="ic"><b>BH</b></div><div class="tx"><div class="tt">BetterHalo</div><div class="st">github.com</div><div class="sr">&nbsp;</div><div class="sm">A better way to use Halo LMS.</div></div></div>`;
  for (const c of CONCEPTS) {
    const html = `<!doctype html><html><head><meta charset="utf-8"><style>${FONTS}${CSS}</style></head><body><div class="res" id="t"><p class="q">Chrome Web Store · search “GCU” (a mock, ${c.id})</p>${row(b64(`${TILES}/${c.id}.png`), TITLE, 'haloplus.app', SUMMARY)}${bhRow}${other}</div></body></html>`;
    await shot(html, `${LOCAL}/search-${c.id}.png`);
  }
  // And the half-size view all together, as a student scrolling sees them: each concept above Better Halo's.
  const hgc = existsSync(`${COMP}/hgc-tile.png`) ? b64(`${COMP}/hgc-tile.png`) : null;
  const strip = CONCEPTS.map((c) => `<div class="c">${label(c.id)}<img src="${b64(`${TILES}/${c.id}.png`)}" width="275" height="175"></div>`).join('');
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>${FONTS}${SHEET}.g{display:grid;grid-template-columns:repeat(4,275px);gap:22px}.g img{border-radius:8px}</style></head><body><div class="sheet" id="t"><div class="c"><h1>At the results card’s size (275×175), beside the others</h1><div class="g">${strip}<div class="c">${label('Better Halo')}<img src="${b64(`${COMP}/bh-tile.png`)}" width="275" height="175"></div>${hgc ? `<div class="c">${label('Halo Global Calendar')}<img src="${hgc}" width="275" height="175"></div>` : ''}</div></div></div></body></html>`;
  await shot(html, `${LOCAL}/all-at-results-size.png`);
}
await browser.close();
console.log('tiles done');
