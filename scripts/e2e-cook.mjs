// The Cook meter (2026-09-28): a small bar on each class card and on the class page, gold until Cooked (red), and a
// tap shows one line on why. Sample data on the preview build; light and dark, desk and phone.
//   BASE=http://localhost:4173/school-dashboard/ node scripts/e2e-cook.mjs
import { mkdirSync } from 'node:fs';
import { chromium, devices } from 'playwright-core';
const BASE = process.env.BASE ?? 'http://localhost:4173/school-dashboard/';
const OUT = 'docs/screens/cook';
mkdirSync(OUT, { recursive: true });
const checks = [];
const check = (ok, line) => { checks.push(ok); console.log(`${ok ? 'ok  ' : 'FAIL'} ${line}`); };
const browser = await chromium.launch({ channel: 'chrome', headless: true });
for (const scheme of ['light', 'dark']) {
  for (const [name, device] of [['desk', { viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2 }], ['phone', { ...devices['iPhone 14'], deviceScaleFactor: 2 }]]) {
    const ctx = await browser.newContext({ ...device, colorScheme: scheme });
    const p = await ctx.newPage();
    await p.goto(`${BASE}#/classes?seed=1`, { waitUntil: 'load' });
    await p.waitForTimeout(1500);
    await p.goto(`${BASE}#/classes`, { waitUntil: 'load' });
    await p.waitForSelector('.class-card-wrap .cook', { timeout: 10000 }).catch(() => undefined);
    const meters = await p.$$eval('.class-card-wrap .cook', (els) => els.map((e) => ({ level: e.dataset.level, fill: e.querySelector('.cook-fill').style.width, color: getComputedStyle(e.querySelector('.cook-fill')).backgroundColor })));
    await p.click('.class-card-wrap .cook-btn >> nth=0');
    await p.waitForTimeout(300);
    await p.screenshot({ path: `${OUT}/classes-${name}-${scheme}.png`, fullPage: name === 'phone' });
    const why = await p.$eval('.cook-why', (e) => e.innerText).catch(() => '');
    if (scheme === 'light' && name === 'desk') {
      check(meters.length >= 3 && meters.every((m) => ['Chillin', 'Warm', 'Cooking', 'Cooked'].includes(m.level)), `every class card has a meter: ${meters.map((m) => `${m.level} ${m.fill}`).join(', ')}`);
      const cooked = meters.filter((m) => m.level === 'Cooked');
      const gold = meters.filter((m) => m.level !== 'Cooked');
      check(cooked.every((m) => m.color !== gold[0]?.color) && new Set(gold.map((m) => m.color)).size <= 1, 'gold for Chillin, Warm and Cooking; red only at Cooked');
      check(/\.$/.test(why) && why.length > 10, `a tap shows why: "${why}"`);
      check(/#\/classes$/.test(p.url()), 'tapping the meter does not open the class');
    }
    await p.click('.class-card-wrap .class-card >> nth=0');
    await p.waitForTimeout(900);
    await p.click('.lib-head .cook-btn').catch(() => undefined);
    await p.waitForTimeout(300);
    await p.screenshot({ path: `${OUT}/class-page-${name}-${scheme}.png` });
    if (scheme === 'light' && name === 'desk') check(!!(await p.$('.lib-head .cook .cook-why')), `the class page has it too: "${await p.$eval('.lib-head .cook-why', (e) => e.innerText).catch(() => '')}"`);
    await ctx.close();
  }
}
await browser.close();
console.log(checks.every(Boolean) ? 'PASS' : 'FAIL');
process.exit(checks.every(Boolean) ? 0 : 1);
