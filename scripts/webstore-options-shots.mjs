// The five store screenshots in two caption styles (George's overnight brief, 2026-10-29): exactly 1280×800, 24-bit PNG
// (no alpha), each a big bold caption of a few words beside or over one feature cropped from Halo's page (what the
// research found the leading student extensions do; research-2026-10-29.md). From the 2× captures that
// webstore-options-capture.mjs makes (Chrome, the saved Halo page copies, the demo student Maya Torres).
//   node scripts/webstore-options-shots.mjs   → docs/webstore/options-2026-10-29/screenshots/{A-side,B-gold}/
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from 'playwright-core';

const RAW = resolve('.scratch/store-raw');
const OUT = resolve('docs/webstore/options-2026-10-29/screenshots');
const FONTS = `@font-face{font-family:Jakarta;src:url(data:font/woff2;base64,${readFileSync(resolve('extension/fonts/PlusJakartaSans.woff2')).toString('base64')}) format('woff2');font-weight:200 800}
@font-face{font-family:Inter;src:url(data:font/woff2;base64,${readFileSync(resolve('extension/fonts/Inter.woff2')).toString('base64')}) format('woff2');font-weight:100 900}`;
const MARK = (ring, plus, size) => `<svg width="${size}" height="${size}" viewBox="0 0 64 64"><path d="M52.6 26.5A21.3 21.3 0 1 1 37.5 11.4" fill="none" stroke="${ring}" stroke-width="6" stroke-linecap="round"/><path d="M47.1 9.3v15.2M39.5 16.9h15.2" stroke="${plus}" stroke-width="6.5" stroke-linecap="round"/></svg>`;
// Each scene: the capture, the part of it to show (CSS pixels of the captured page), the caption and its line under.
export const SCENES = [
  { file: '1-search', raw: 'search', crop: { x: 320, y: 96, w: 640, h: 512 }, head: 'Search every class.', sub: 'Ctrl+K or ⌘K, on any Halo page.' },
  { file: '2-whats-next', raw: 'cards', crop: { x: 24, y: 560, w: 976, h: 330 }, head: 'What’s next, on every class.', sub: 'Your grade and the next things due, right on Halo’s class cards.' },
  { file: '3-checked-off', raw: 'checkoff', crop: { x: 660, y: 0, w: 620, h: 360 }, head: 'Checked off the moment you submit.', sub: 'Points, your week’s progress, and a little confetti.' },
  { file: '4-rubric', raw: 'rubric', crop: { x: 30, y: 70, w: 820, h: 590 }, head: 'The rubric, right under the assignment.', sub: 'No new tab. Every level one click away.' },
  { file: '5-calendar', raw: 'calendar', crop: { x: 104, y: 222, w: 812, h: 368 }, head: 'Every class, one calendar.', sub: 'All your classes on Halo’s calendar, each in its own color.' },
];
const dims = (f) => execFileSync('python3', ['-c', `from PIL import Image\nprint(*Image.open('${f}').size)`]).toString().trim().split(' ').map(Number);
const STYLES = {
  // A: a dark side panel with the caption, the feature on a light stage beside it.
  'A-side': (s, img, nat) => {
    const box = { w: 770, h: 680 };
    const k = Math.min(box.w / s.crop.w, box.h / s.crop.h);
    const w = Math.round(s.crop.w * k);
    const h = Math.round(s.crop.h * k);
    return `<div class="a"><div class="side"><div class="brand">${MARK('#f2b84b', '#f2f4f7', 34)}<b>Halo+</b><span>for GCU</span></div><h1>${s.head}</h1><p>${s.sub}</p></div>
<div class="stage"><div class="shot" style="width:${w}px;height:${h}px;background-image:url(${img});background-size:${nat.w * k}px ${nat.h * k}px;background-position:${-s.crop.x * k}px ${-s.crop.y * k}px"></div></div></div>`;
  },
  // B: Halo+'s gold, the caption across the top, the feature rising from the bottom edge.
  'B-gold': (s0, img, nat) => {
    const s = s0.cropB ? { ...s0, crop: s0.cropB } : s0;
    const w = Math.min(1120, Math.round(s.crop.w * Math.min(1.35, 1120 / s.crop.w)));
    const k = w / s.crop.w;
    const h = Math.round(s.crop.h * k);
    return `<div class="b"><div class="top"><h1>${s.head}</h1><p>${s.sub}</p></div><div class="shot" style="width:${w}px;height:${h}px;background-image:url(${img});background-size:${nat.w * k}px ${nat.h * k}px;background-position:${-s.crop.x * k}px ${-s.crop.y * k}px"></div></div>`;
  },
};
const CSS = `${FONTS}*{box-sizing:border-box;margin:0}body{width:1280px;height:800px;overflow:hidden;-webkit-font-smoothing:antialiased}
.a{display:flex;width:1280px;height:800px}
.side{width:440px;flex:none;background:#14171c;color:#f2f4f7;padding:56px 44px;display:flex;flex-direction:column;justify-content:center;gap:22px;position:relative}
.side .brand{position:absolute;left:44px;top:44px;display:flex;align-items:center;gap:10px;font:800 26px/1 Jakarta;letter-spacing:-.03em}
.side .brand span{font:700 15px/1 Jakarta;color:#f2b84b;letter-spacing:0;margin-top:6px}
.side h1{font:800 58px/1.04 Jakarta;letter-spacing:-.035em}
.side p{font:500 21px/1.4 Inter;color:#b9c1cb}
.stage{flex:1;background:linear-gradient(160deg,#f1f2f5,#e2e5ea);display:grid;place-items:center}
.shot{border-radius:14px;background-repeat:no-repeat;box-shadow:0 1px 3px rgba(16,20,28,.12),0 24px 60px -18px rgba(16,20,28,.38)}
.b{width:1280px;height:800px;background:#f2b84b;position:relative;overflow:hidden;display:flex;flex-direction:column;align-items:center}
.b .top{padding:52px 60px 0;text-align:center;color:#14171c}
.b h1{font:800 64px/1.05 Jakarta;letter-spacing:-.035em}
.b p{font:600 22px/1.35 Inter;opacity:.78;margin-top:14px}
.b .shot{margin-top:40px;border-radius:14px 14px 0 0}
.b .brand{position:absolute;left:30px;top:26px;display:flex;align-items:center;gap:8px;font:800 20px/1 Jakarta;letter-spacing:-.03em;color:#14171c}`;

const br = await chromium.launch({ headless: true });
const page = await (await br.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 })).newPage();
for (const [style, make] of Object.entries(STYLES)) {
  mkdirSync(`${OUT}/${style}`, { recursive: true });
  for (const s of SCENES) {
    const f = `${RAW}/${s.raw}.png`;
    const [pw, ph] = dims(f);
    const img = `data:image/png;base64,${readFileSync(f).toString('base64')}`;
    await page.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>${CSS}</style></head><body>${make(s, img, { w: pw / 2, h: ph / 2 })}</body></html>`, { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(200);
    const out = `${OUT}/${style}/${s.file}.png`;
    await page.screenshot({ path: out });
    execFileSync('python3', ['-c', `from PIL import Image\nim=Image.open('${out}').convert('RGB')\nassert im.size==(1280,800), im.size\nim.save('${out}')`]);
  }
  console.log(style, 'done');
}
// Both styles side by side, all five, for picking.
const thumbs = (style) => SCENES.map((s) => `<img src="data:image/png;base64,${readFileSync(`${OUT}/${style}/${s.file}.png`).toString('base64')}" width="400" height="250">`).join('');
await page.setViewportSize({ width: 2150, height: 760 });
await page.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>${FONTS}body{margin:0;background:#eef0f3;font:14px Inter;padding:28px}h2{font:800 22px Jakarta;margin:0 0 12px}.row{display:flex;gap:14px;margin-bottom:28px}.row img{border-radius:6px;box-shadow:0 1px 3px rgba(0,0,0,.2)}</style></head><body id="t"><h2>Style A · dark side panel</h2><div class="row">${thumbs('A-side')}</div><h2>Style B · gold, caption on top</h2><div class="row">${thumbs('B-gold')}</div></body></html>`);
await page.evaluate(() => document.fonts.ready);
await page.screenshot({ path: resolve('docs/webstore/options-2026-10-29/overview-screenshots.png'), fullPage: true });
await br.close();
