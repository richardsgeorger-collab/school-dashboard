// The onboarding fixes from watching a first-time user (2026-09-28): the bookmarks-bar step with a drawn keyboard
// (Mac and Windows), the big forward button on every step, and skipping (Skip for now, then Finish setup on Now and
// You, which resumes where they left). Runs against the preview build (no accounts needed to reach these steps).
//   BASE=http://localhost:4173/school-dashboard/ node scripts/e2e-onboarding-help.mjs
import { mkdirSync } from 'node:fs';
import { chromium, devices } from 'playwright-core';
const BASE = process.env.BASE ?? 'http://localhost:4173/school-dashboard/';
const OUT = 'docs/screens/onboarding-help';
mkdirSync(OUT, { recursive: true });
const checks = [];
const check = (ok, line) => { checks.push(ok); console.log(`${ok ? 'ok  ' : 'FAIL'} ${line}`); };
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const text = (p, sel) => p.$eval(sel, (e) => e.innerText.replace(/\s+/g, ' ').trim()).catch(() => '');
const fresh = async (device, scheme, os) => {
  const ctx = await browser.newContext({ ...device, colorScheme: scheme, reducedMotion: 'no-preference' });
  if (os) await ctx.addInitScript((plat) => Object.defineProperty(navigator, 'platform', { get: () => plat }), os === 'mac' ? 'MacIntel' : 'Win32');
  const p = await ctx.newPage();
  await p.goto(`${BASE}#/now`, { waitUntil: 'load' });
  await p.evaluate(() => localStorage.clear());
  await p.reload({ waitUntil: 'load' });
  await p.waitForTimeout(900);
  return { ctx, p };
};
for (const scheme of ['light', 'dark']) {
  // The bookmarks-bar step, on a Mac and on Windows.
  for (const os of ['mac', 'windows']) {
    const { ctx, p } = await fresh({ viewport: { width: 1280, height: 860 }, deviceScaleFactor: 2 }, scheme, os);
    await p.click('.onboard button:has-text("Start")');
    await p.waitForTimeout(700);
    await p.waitForSelector('.kb', { timeout: 5000 }).catch(() => undefined);
    await p.waitForTimeout(900);
    await p.screenshot({ path: `${OUT}/bar-${os}-${scheme}.png`, fullPage: true });
    const keys = await p.$$eval('.kb-key[data-hot="true"]', (els) => els.map((e) => e.innerText.replace(/\s+/g, ' ').trim()));
    if (scheme === 'light') {
      check(os === 'mac' ? keys.join('|') === 'Shift|B|⌘ command' : keys.join('|') === 'Shift|B|Ctrl', `${os}: the three keys drawn in gold: ${keys.join(', ')}`);
      check(/Hold down the first two keys, then tap B\./.test(await text(p, '.onboard')), `${os}: one plain instruction`);
      check(/three dots in the top right of Chrome, then Bookmarks and lists, then Show bookmarks bar/.test(await text(p, '.onboard')) && !!(await p.$('.chrome-menu')), `${os}: the no-keyboard way, with a picture`);
      const btn = await p.$eval('.onboard-step .btn.primary', (e) => ({ t: e.innerText.trim(), w: e.getBoundingClientRect().width, pw: e.parentElement.getBoundingClientRect().width }));
      check(btn.t === 'I see my bookmarks bar' && btn.w >= btn.pw - 2, `${os}: "I see my bookmarks bar" is the big full-width button (${Math.round(btn.w)} of ${Math.round(btn.pw)}px)`);
      check(!!(await p.$('.onboard-head .onboard-skip')), `${os}: Skip for now in the top right`);
    }
    if (os === 'mac') {
      await p.click('.onboard-step .btn.primary');
      await p.waitForTimeout(500);
      await p.screenshot({ path: `${OUT}/drag-${scheme}.png` });
      if (scheme === 'light') check(/It's in my bookmarks bar/.test(await text(p, '.onboard-step .btn.primary.block')), 'the drag step has its own big forward button');
    }
    await ctx.close();
  }
  // Skipping, on a computer and a phone: Skip → Now with Finish setup → You too → Finish setup resumes.
  for (const [name, device] of [['desk', { viewport: { width: 1280, height: 860 }, deviceScaleFactor: 2 }], ['phone', { ...devices['iPhone 14'], deviceScaleFactor: 2 }]]) {
    const { ctx, p } = await fresh(device, scheme, name === 'desk' ? 'mac' : null);
    await p.click('.onboard button:has-text("Start")');
    await p.waitForTimeout(700);
    await p.screenshot({ path: `${OUT}/skip-1-step-${name}-${scheme}.png` });
    await p.click('.onboard-head .onboard-skip');
    await p.waitForTimeout(900);
    await p.screenshot({ path: `${OUT}/skip-2-now-${name}-${scheme}.png` });
    if (scheme === 'light') check(!(await p.$('.onboard')) && /#\/now/.test(p.url()) && /Finish setup/.test(await text(p, '.finish-setup')), `${name}: Skip lands on Now with a Finish setup card`);
    await p.goto(`${BASE}#/you`, { waitUntil: 'load' });
    await p.waitForTimeout(900);
    await p.screenshot({ path: `${OUT}/skip-3-you-${name}-${scheme}.png` });
    if (scheme === 'light') check(!!(await p.$('.finish-setup')), `${name}: Finish setup on You too`);
    await p.click('.finish-setup .btn.primary');
    await p.waitForTimeout(900);
    await p.screenshot({ path: `${OUT}/skip-4-resumed-${name}-${scheme}.png` });
    if (scheme === 'light') check(!!(await p.$('.onboard [aria-label="Show your bookmarks bar"], .onboard [aria-label="Copy the bookmark"]')), `${name}: Finish setup picks up exactly where they left (the bookmark step)`);
    await ctx.close();
  }
}
await browser.close();
console.log(checks.every(Boolean) ? 'PASS' : 'FAIL');
process.exit(checks.every(Boolean) ? 0 : 1);
