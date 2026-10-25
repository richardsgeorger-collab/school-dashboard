// The Web Store promo tile (George, 2026-10-24): 440×280, 24-bit PNG, from webstore-upload/tile.html, in the landing
// page's words ("Every GCU due date." / "Even the ones hidden in announcements."). No price, no "free".
//   node scripts/webstore-tile.mjs   → webstore-upload/promo-tile-440x280.png
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';

const out = resolve('webstore-upload/promo-tile-440x280.png');
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const p = await browser.newPage({ viewport: { width: 440, height: 280 }, deviceScaleFactor: 1 });
await p.goto(pathToFileURL(resolve('webstore-upload/tile.html')).href, { waitUntil: 'load' });
await p.evaluate(() => document.fonts.ready);
await p.locator('#tile').screenshot({ path: out });
await browser.close();
execFileSync('python3', ['-c', `from PIL import Image\nim = Image.open('${out}').convert('RGB')\nassert im.size == (440, 280), im.size\nim.save('${out}')`]);
console.log('wrote', out);
