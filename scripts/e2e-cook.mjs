// The Cooked meter (2026-09-29; one meaning since 2026-10-04: hours of unfinished work due in the next 7 days): a thin
// bar on each class card and the class page, "Cooked meter" under it, no level words, green, yellow or red; the reason
// on hover and on a tap ("4 items, ~5h this week, 1 overdue"); checking something off moves it at once. Sample data on the preview build; light and dark, desk and phone.
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
    const meters = await p.$$eval('.class-card-wrap .cook', (els) => els.map((e) => ({ label: e.querySelector('.cook-btn').innerText.trim(), level: e.querySelector('.cook-btn').dataset.level, title: e.querySelector('.cook-btn').title, fill: parseFloat(e.querySelector('.cook-fill').style.width), rgb: getComputedStyle(e.querySelector('.cook-fill')).backgroundColor.match(/\d+/g).map(Number) })));
    await p.click('.class-card-wrap .cook-btn >> nth=0');
    await p.waitForTimeout(300);
    await p.screenshot({ path: `${OUT}/classes-${name}-${scheme}.png`, fullPage: name === 'phone' });
    const why = await p.$eval('.cook-why', (e) => e.innerText).catch(() => '');
    if (scheme === 'light' && name === 'desk') {
      check(meters.length >= 3 && meters.every((m) => m.label === 'Cooked meter'), `every class card has the bar with "Cooked meter" under it and no level words (${meters.map((m) => `${m.fill}%`).join(', ')})`);
      const hue = (m) => (m.rgb[1] > m.rgb[0] ? 'green' : m.rgb[1] > m.rgb[0] * 0.5 ? 'yellow' : 'red');
      check(meters.every((m) => ['green', 'yellow', 'red'].includes(m.level) && hue(m) === m.level), `each bar is green, yellow or red by its level: ${meters.map((m) => `${m.level} ${m.fill}%`).join(', ')}`);
      const WHY = /^(\d+ items?, ~[\d.]+[hm] this week(, \d+ overdue)?(, \d+ due in the next 48 hours)?|Nothing due in the next 7 days)\.$/;
      check(WHY.test(why) && meters.every((m) => WHY.test(m.title)), `a tap (and hover) shows why: "${why}"`);
      check(/#\/classes$/.test(p.url()), 'tapping the meter does not open the class');
    }
    await p.click('.class-card-wrap .class-card >> nth=0');
    await p.waitForTimeout(900);
    await p.click('.lib-head .cook-btn').catch(() => undefined);
    await p.waitForTimeout(300);
    await p.screenshot({ path: `${OUT}/class-page-${name}-${scheme}.png` });
    if (scheme === 'light' && name === 'desk') {
      const before = await p.$eval('.lib-head .cook-why', (e) => e.innerText).catch(() => '');
      check(!!before, `the class page has it too: "${before}"`);
      // Checking one off moves it at once.
      // (Something due later than this week does not move it; the first one inside the week does.)
      let after = before;
      for (let k = 0; k < 6 && after === before; k++) {
        const box = p.locator('.item-row button.check[aria-checked="false"]').first();
        if (!(await box.count())) break;
        await box.click();
        await p.waitForTimeout(400);
        if (await p.locator('.time-ask button:has-text("skip")').count()) await p.click('.time-ask button:has-text("skip")');
        after = await p.$eval('.lib-head .cook-btn', (e) => e.title);
      }
      check(after !== before, `a check-off updates it at once: "${before}" → "${after}"`);
    }
    await ctx.close();
  }
}
await browser.close();
console.log(checks.every(Boolean) ? 'PASS' : 'FAIL');
process.exit(checks.every(Boolean) ? 0 : 1);
