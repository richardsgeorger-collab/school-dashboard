// Everything the Chrome Web Store listing needs, into webstore-upload/ (2026-09-30):
//   - store-icon-128.png: the icon at 96×96 on a transparent 128×128 canvas (Google's guideline: 16 px padding a side)
//   - screenshot-N-*.png: exactly 1280×800, 24-bit PNG (no alpha): Now, Classes, Inbox, the extension popup, the review
//   - promo-tile-440x280.png: re-saved without transparency
// The app screens come from the sweep's signed-in six-class account at the store size (run first):
//   ONLY=store-light SCENES=now,classes,inbox,sync-review KEYS_ENV=... node scripts/e2e-sweep.mjs
// The popup is the real extension, loaded unpacked into Chromium, over the Now screen.
//   node scripts/webstore-assets.mjs
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright-core';

const OUT = resolve('webstore-upload');
const EXT = resolve('extension');
const SWEEP = resolve('docs/screens/sweep/store-light');
for (const f of ['now', 'classes', 'inbox', 'sync-review']) if (!existsSync(`${SWEEP}/${f}.png`)) throw new Error(`missing ${SWEEP}/${f}.png: run the store sweep first`);
const tmp = mkdtempSync(join(tmpdir(), 'webstore-'));
const b64 = (p) => readFileSync(p).toString('base64');

// 1. The popup, as it looks after a sync that landed.
const ctx = await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), 'ext-')), { channel: 'chromium', headless: true, args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`], deviceScaleFactor: 2 });
let [worker] = ctx.serviceWorkers();
if (!worker) worker = await ctx.waitForEvent('serviceworker');
const extId = worker.url().split('/')[2];
await worker.evaluate(async () => {
  const last = new Date(Date.now() - 12 * 60_000).toISOString();
  await chrome.storage.local.set({ tier: 'max', lastSyncAt: last, lastLanded: 'account', syncKey: 'k', lastError: null, running: false });
  await chrome.alarms.create('auto-sync', { when: Date.now() + 168 * 60_000, periodInMinutes: 180 });
});
const pop = await ctx.newPage();
await pop.setViewportSize({ width: 320, height: 240 });
await pop.goto(`chrome-extension://${extId}/popup.html`, { waitUntil: 'load' });
await pop.waitForTimeout(800);
// To the bottom of its content (the page itself has a minimum height).
const h = await pop.evaluate(() => Math.ceil(document.querySelector('.foot').getBoundingClientRect().bottom + parseFloat(getComputedStyle(document.body).paddingBottom || '0') + 14));
await pop.setViewportSize({ width: 320, height: h });
await pop.screenshot({ path: `${tmp}/popup.png` });
await ctx.close();

// 2. Composites, rendered at exactly 1280×800.
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
const popupShot = `<!doctype html><html><body style="margin:0;width:1280px;height:800px;overflow:hidden;position:relative;font-family:system-ui">
<img src="data:image/png;base64,${b64(`${SWEEP}/now.png`)}" style="position:absolute;inset:0;width:1280px;height:800px">
<div style="position:absolute;inset:0;background:rgba(11,13,16,.28)"></div>
<div style="position:absolute;top:14px;right:22px;width:448px;border-radius:14px;overflow:hidden;box-shadow:0 18px 50px rgba(0,0,0,.35),0 0 0 1px rgba(0,0,0,.08)">
<img src="data:image/png;base64,${b64(`${tmp}/popup.png`)}" style="display:block;width:448px"></div></body></html>`;
await page.setContent(popupShot);
await page.waitForTimeout(300);
await page.screenshot({ path: `${tmp}/popup-shot.png` });
// The icon: 96×96 artwork, 16 px transparent padding.
const svg = readFileSync(`${EXT}/icon.svg`, 'utf8');
const iconPage = await browser.newPage({ viewport: { width: 128, height: 128 }, deviceScaleFactor: 1 });
await iconPage.setContent(`<!doctype html><html><body style="margin:0;background:transparent"><div style="width:128px;height:128px;display:grid;place-items:center">${svg.replace('<svg ', '<svg width="96" height="96" ')}</div></body></html>`);
await iconPage.screenshot({ path: `${OUT}/store-icon-128.png`, omitBackground: true });
await browser.close();

// 3. 24-bit PNGs (no alpha channel), exact sizes checked.
const shots = [
  [`${SWEEP}/now.png`, 'screenshot-1-now.png'],
  [`${SWEEP}/classes.png`, 'screenshot-2-classes.png'],
  [`${SWEEP}/inbox.png`, 'screenshot-3-inbox.png'],
  [`${tmp}/popup-shot.png`, 'screenshot-4-extension-popup.png'],
  [`${SWEEP}/sync-review.png`, 'screenshot-5-sync-review.png'],
  [`${OUT}/promo-tile-440x280.png`, 'promo-tile-440x280.png'],
];
const py = `
import sys
from PIL import Image
pairs = ${JSON.stringify(shots.map(([src, name]) => [src, `${OUT}/${name}`]))}
for src, dst in pairs:
    im = Image.open(src)
    if im.mode in ('RGBA', 'LA', 'P'):
        bg = Image.new('RGB', im.size, (11, 13, 16) if 'promo' in dst else (246, 247, 249))
        im = im.convert('RGBA'); bg.paste(im, mask=im.split()[3]); im = bg
    im = im.convert('RGB')
    want = (440, 280) if 'promo' in dst else (1280, 800)
    assert im.size == want, (dst, im.size)
    im.save(dst, 'PNG', optimize=True)
    print(dst.split('/')[-1], im.size, Image.open(dst).mode)
ic = Image.open('${OUT}/store-icon-128.png'); print('store-icon-128.png', ic.size, ic.mode)
`;
writeFileSync(`${tmp}/convert.py`, py);
console.log(execFileSync('python3', [`${tmp}/convert.py`], { encoding: 'utf8' }));
