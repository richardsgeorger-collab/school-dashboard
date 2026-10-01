// GCU blocks Google sign-in for school accounts (George, 2026-09-30): the sign-up and log-in pages say so under
// Continue with Google, and again by the email field once a GCU address is typed. Screenshots dark/light, desk/phone.
//   [BASE=http://localhost:4174/school-dashboard/] node scripts/e2e-gcu-note.mjs
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright-core';

const BASE = process.env.BASE ?? 'http://localhost:4174/school-dashboard/';
const OUT = 'docs/screens/gcu-google';
mkdirSync(OUT, { recursive: true });
const checks = [];
const check = (ok, line) => { checks.push(ok); console.log(`${ok ? 'ok  ' : 'FAIL'} ${line}`); };
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const devices = { desk: { viewport: { width: 1280, height: 860 } }, phone: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } };
try {
  for (const [dev, opts] of Object.entries(devices)) for (const scheme of ['dark', 'light']) {
    const ctx = await browser.newContext({ ...opts, colorScheme: scheme });
    await ctx.route('**/functions/v1/report', (r) => r.fulfill({ status: 200, body: '{}' }));
    const page = await ctx.newPage();
    for (const route of ['signup', 'login']) {
      await page.goto(`${BASE}#/${route}`, { waitUntil: 'load' });
      const google = page.getByRole('button', { name: 'Continue with Google' });
      await google.waitFor({ timeout: 15000 });
      const note = page.locator('.signin-gcu').first();
      const text = await note.textContent();
      const bold = await note.locator('b').textContent();
      const below = (await note.boundingBox()).y > (await google.boundingBox()).y;
      check(text.includes('GCU blocks it') && bold === "You can't sign up with Google." && below, `${dev} ${scheme} ${route}: note under Continue with Google, bold fact`);
      const size = await note.evaluate((e) => parseFloat(getComputedStyle(e).fontSize));
      check(size >= 13, `${dev} ${scheme} ${route}: note is readable (${size}px)`);
      if (route === 'signup') await page.screenshot({ path: `${OUT}/signup-${dev}-${scheme}.png`, fullPage: dev === 'phone' });
      await page.fill('input[name="email"]', 'jsmith12@my.gcu.edu');
      await page.waitForTimeout(600);
      check((await page.locator('.signin-gcu').count()) === 2 && (await page.locator('#signin-gcu-field').isVisible()), `${dev} ${scheme} ${route}: typing a @my.gcu.edu address shows the note by the field`);
      if (route === 'signup') await page.screenshot({ path: `${OUT}/signup-typed-${dev}-${scheme}.png` });
      await page.fill('input[name="email"]', 'someone@gcu.edu');
      check((await page.locator('#signin-gcu-field').count()) === 1, `${dev} ${scheme} ${route}: @gcu.edu too`);
      await page.fill('input[name="email"]', 'someone@gmail.com');
      check((await page.locator('#signin-gcu-field').count()) === 0 && (await google.isEnabled()), `${dev} ${scheme} ${route}: Gmail gets no field note, Google still works`);
    }
    await ctx.close();
  }
} finally {
  await browser.close();
}
console.log(checks.every(Boolean) ? 'PASS' : 'FAIL');
