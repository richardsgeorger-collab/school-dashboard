// "I'm on Halo, what now?" (2026-09-28): before Halo opens, one screen draws Halo with 😇 Sync Halo in the bookmarks
// bar, circled in gold, a pointer tapping it, and says the one thing to do. Open Halo opens a new tab; this tab waits
// with the same drawing; the fixes still show after a minute (shortened here). Preview build, no account needed.
//   BASE=http://localhost:4173/school-dashboard/ node scripts/e2e-onboarding-halo.mjs
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright-core';
const BASE = process.env.BASE ?? 'http://localhost:4173/school-dashboard/';
const OUT = 'docs/screens/onboarding-halo';
mkdirSync(OUT, { recursive: true });
const checks = [];
const check = (ok, line) => { checks.push(ok); console.log(`${ok ? 'ok  ' : 'FAIL'} ${line}`); };
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const text = (p, sel) => p.$eval(sel, (e) => e.innerText.replace(/\s+/g, ' ').trim()).catch(() => '');
for (const scheme of ['light', 'dark']) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 }, deviceScaleFactor: 2, colorScheme: scheme, reducedMotion: 'no-preference' });
  await ctx.addInitScript(() => Object.defineProperty(navigator, 'platform', { get: () => 'MacIntel' }));
  await ctx.route('https://halo.gcu.edu/**', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: '<title>Halo</title><h1>Halo</h1>' }));
  const p = await ctx.newPage();
  await p.goto(`${BASE}#/now`, { waitUntil: 'load' });
  await p.evaluate(() => { localStorage.clear(); localStorage.setItem('school-dashboard:onboard-wait-ms', '2500'); });
  await p.reload({ waitUntil: 'load' });
  await p.waitForTimeout(900);
  await p.click('.onboard button:has-text("Start")');
  await p.waitForTimeout(600);
  await p.click('.onboard-step .btn.primary:has-text("I see my bookmarks bar")').catch(() => undefined);
  await p.waitForTimeout(500);
  if (scheme === 'light') check((await text(p, '.halo-drag')) === '😇 Sync Halo', `the drag button, and so the bookmark, is named "${await text(p, '.halo-drag')}"`);
  if (scheme === 'light') check(/😇 Sync Halo/.test(await text(p, '.demo-pill')), 'the drag picture shows the new name');
  await p.click('.onboard-step .btn.primary:has-text("It\'s in my bookmarks bar")');
  await p.waitForTimeout(1600); // mid-tap
  await p.screenshot({ path: `${OUT}/1-before-halo-${scheme}.png` });
  if (scheme === 'light') {
    check((await text(p, '.onboard-title')) === 'On Halo, click 😇 Sync Halo in your bookmarks bar.', `the one line: "${await text(p, '.onboard-title')}"`);
    check((await text(p, '.hb-target b')) === '😇 Sync Halo' && !!(await p.$('.hb-ring')) && !!(await p.$('.hb-pointer')), 'the drawing: Halo, the bookmarks bar, 😇 Sync Halo circled, a pointer');
    const anim = await p.$eval('.hb-pointer', (e) => getComputedStyle(e).animationName);
    check(anim === 'hb-point', `the pointer moves and taps (${anim})`);
    check((await text(p, '.onboard-step .btn.primary')) === 'Open Halo', 'the button says Open Halo');
  }
  const [tab] = await Promise.all([ctx.waitForEvent('page', { timeout: 5000 }).catch(() => null), p.click('.onboard-step .btn.primary:has-text("Open Halo")')]);
  if (scheme === 'light') check(!!tab && /halo\.gcu\.edu/.test(tab.url()), `Halo opens in a new tab (${tab?.url()})`);
  await p.bringToFront();
  await p.waitForTimeout(1600);
  await p.screenshot({ path: `${OUT}/2-waiting-${scheme}.png` });
  if (scheme === 'light') {
    check((await text(p, '.onboard-title')) === 'Waiting for your sync…' && /Go to your Halo tab and click 😇 Sync Halo\./.test(await text(p, '.onboard-wait')), `the Halo+ tab waits: "${await text(p, '.onboard-title')} ${await text(p, '.onboard-wait .onboard-text')}"`);
    check(!!(await p.$('.onboard-wait .hb-pointer')), 'the waiting screen repeats the drawing');
  }
  await p.waitForSelector('.fixes', { timeout: 6000 }).catch(() => undefined);
  await p.screenshot({ path: `${OUT}/3-waiting-tips-${scheme}.png`, fullPage: true });
  if (scheme === 'light') check(/😇 Sync Halo isn't in your bookmarks bar/.test(await text(p, '.fixes')), 'the one-minute fixes still show, with the new name');
  await ctx.close();
}
await browser.close();
console.log(checks.every(Boolean) ? 'PASS' : 'FAIL');
process.exit(checks.every(Boolean) ? 0 : 1);
