// The Web Store promo tile for Halo+ ON HALO (George, 2026-10-28): 440×280, 24-bit PNG. A slice of Halo's own Student
// Home with Halo+ on it (Halo's purple bar, Halo+'s search and This week; a 2× capture of the saved Halo page copy with
// the real extension, the demo student Maya Torres), then "Halo, but better." with the Halo+ mark. No price talk. The
// test page's placeholder sponsor logo is under a patch of the bar's purple, as in the screenshots.
//   node scripts/webstore-tile-onhalo.mjs   → webstore-upload/promo-tile-440x280.png (the earlier tile → old-screenshots/)
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, renameSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from 'playwright-core';
import { gradesGateway } from './lib/haloPages.mjs';
import { openBench, sleep, until } from './lib/onHaloRun.mjs';

const OUT = resolve('webstore-upload/promo-tile-440x280.png');
const OLD = resolve('webstore-upload/old-screenshots/promo-tile-440x280-2026-10-24.png');
const RAW = resolve('webstore-upload/.raw-tile.png');
const W = 1280;
const CROP = { w: 550, h: 205 }; // CSS px of Student Home from its top left: the bar, search and This week

const b = await openBench({ label: 'store-tile' });
Object.assign(b.bench.state.gateway, gradesGateway(b.fx));
try {
  await b.seed({ lastAttemptAt: new Date().toISOString() });
  const p = await b.page('https://halo.gcu.edu/', { width: W, height: 800 });
  await until(async () => (await p.locator('[data-haloplus="week-strip"] .hp-sd').count()) > 0, 20000, 200);
  const cdp = await b.ctx.newCDPSession(p);
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: W, height: 800, deviceScaleFactor: 2, mobile: false });
  await sleep(1500);
  await p.mouse.move(3, 3);
  await p.evaluate(() => {
    const sp = document.querySelector('[data-haloplus="sponsor"]');
    const bar = document.querySelector('#header_main_container header');
    if (sp && bar) {
      const d = document.createElement('div');
      d.style.cssText = `position:absolute;inset:-6px 0;background:${getComputedStyle(bar).backgroundColor};z-index:2`;
      sp.style.position = 'relative';
      sp.append(d);
    }
    for (const h of document.querySelectorAll('[data-haloplus]')) {
      if (!h.shadowRoot) continue;
      const s2 = document.createElement('style');
      s2.textContent = '.pill,.tip{display:none!important}';
      h.shadowRoot.append(s2);
    }
  });
  await sleep(600);
  if (!(await p.evaluate(() => document.documentElement.hasAttribute('data-hp-home-compact')))) throw new Error('Student Home not compact');
  await p.screenshot({ path: RAW, clip: { x: 0, y: 0, width: CROP.w, height: CROP.h } });
} finally {
  await b.close();
}

const mark = '<svg viewBox="5 3 56 56" aria-hidden="true"><path d="M52.6 26.5A21.3 21.3 0 1 1 37.5 11.4" fill="none" stroke="#c98a17" stroke-width="7.5" stroke-linecap="round"/><path d="M47.1 9.3v15.2M39.5 16.9h15.2" fill="none" stroke="#1f2329" stroke-width="7.5" stroke-linecap="round"/></svg>';
const sliceH = Math.round((CROP.h * 440) / CROP.w);
const font = (f) => `data:font/woff2;base64,${readFileSync(resolve('extension/fonts', f)).toString('base64')}`;
const html = `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face{font-family:Jakarta;src:url('${font('PlusJakartaSans.woff2')}') format('woff2');font-weight:200 800}
html,body{margin:0;background:#333}
#tile{width:440px;height:280px;overflow:hidden;background:#fafafa;position:relative;font-family:Jakarta,sans-serif}
.slice{display:block;width:440px;height:${sliceH}px}
.fade{position:absolute;left:0;right:0;top:${sliceH - 28}px;height:28px;background:linear-gradient(rgba(250,250,250,0),#fafafa)}
.say{position:absolute;left:0;right:0;top:${sliceH}px;bottom:0;display:flex;align-items:center;gap:14px;padding:0 30px;border-top:1px solid #e6e3ee;background:#fff}
.say svg{width:40px;height:40px;flex:none;overflow:visible}
.say b{font-weight:800;font-size:33px;letter-spacing:-.03em;color:#1f2329;line-height:1}
</style></head><body><div id="tile"><img class="slice" src="data:image/png;base64,${readFileSync(RAW).toString('base64')}"><div class="fade"></div><div class="say">${mark}<b>Halo, but better.</b></div></div></body></html>`;
const br = await chromium.launch({ channel: 'chrome', headless: true });
const pg = await br.newPage({ viewport: { width: 440, height: 280 }, deviceScaleFactor: 1 });
await pg.setContent(html, { waitUntil: 'load' });
await pg.evaluate(() => document.fonts.ready);
await pg.waitForFunction(() => [...document.images].every((i) => i.complete));
if (existsSync(OUT) && !existsSync(OLD)) renameSync(OUT, OLD);
await pg.locator('#tile').screenshot({ path: OUT });
await br.close();
rmSync(RAW, { force: true });
execFileSync('python3', ['-c', `from PIL import Image\nim = Image.open('${OUT}').convert('RGB')\nassert im.size == (440, 280), im.size\nim.save('${OUT}')`]);
console.log('wrote', OUT, `(slice ${sliceH}px)`);
