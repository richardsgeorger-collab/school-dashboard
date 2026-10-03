// Not now on the Now card (2026-09-29): one small muted link next to the buttons opens a small menu (Not today, Can't
// start yet with "Waiting on what?", Show me something else); the card slides to the next item with an Undo toast;
// skipped items keep a note on the agenda; on a phone a left swipe opens the same menu. Sample term, preview build.
//   BASE=http://localhost:4173/school-dashboard/ node scripts/e2e-notnow.mjs
import { mkdirSync } from 'node:fs';
import { chromium, devices } from 'playwright-core';
const BASE = process.env.BASE ?? 'http://localhost:4173/school-dashboard/';
const OUT = 'docs/screens/notnow';
mkdirSync(OUT, { recursive: true });
const checks = [];
const check = (ok, line) => { checks.push(ok); console.log(`${ok ? 'ok  ' : 'FAIL'} ${line}`); };
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const text = (p, sel) => p.$eval(sel, (e) => e.innerText.replace(/\s+/g, ' ').trim()).catch(() => '');
const heroTitle = (p) => text(p, '.hero-title');
for (const scheme of ['light', 'dark']) {
  for (const [name, device] of [['desk', { viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2 }], ['phone', { ...devices['iPhone 14'], deviceScaleFactor: 2 }]]) {
    const ctx = await browser.newContext({ ...device, colorScheme: scheme, reducedMotion: 'no-preference' });
    const p = await ctx.newPage();
    await p.goto(`${BASE}#/now?seed=1`, { waitUntil: 'load' });
    await p.waitForTimeout(1000);
    await p.evaluate(() => { const d = JSON.parse(localStorage.getItem('school-dashboard:v1')); d.settings.onboarding = { startedAt: 'x', step: 'done', doneAt: 'x', skippedAt: null, tourDoneAt: 'x' }; d.settings.sundayReview = { skips: 0, lastOffered: null, lastDone: null, off: true }; localStorage.setItem('school-dashboard:v1', JSON.stringify(d)); sessionStorage.clear(); });
    await p.reload({ waitUntil: 'load' });
    await p.waitForTimeout(1400);
    const t0 = await heroTitle(p);
    await p.locator('.hero').scrollIntoViewIfNeeded();
    await p.screenshot({ path: `${OUT}/1-link-${name}-${scheme}.png` });
    const link = await p.locator('.hero-notnow').first().evaluate((e) => ({ t: e.innerText.trim(), h: e.getBoundingClientRect().height, color: getComputedStyle(e).color, bg: getComputedStyle(e).backgroundColor }));
    if (name === 'desk' && scheme === 'light') check(link.t === 'Not now' && link.h < 36 && link.bg === 'rgba(0, 0, 0, 0)', `one small, muted "Not now" text link beside the buttons (${Math.round(link.h)}px tall, no fill)`);
    if (name === 'phone') {
      // A left swipe on the card opens the same menu.
      const box = await p.$eval('.hero', (e) => { const r = e.getBoundingClientRect(); return { x: r.x + r.width * 0.7, y: r.y + r.height * 0.4 }; });
      const touch = (x) => [{ identifier: 1, clientX: x, clientY: box.y }];
      await p.dispatchEvent('.hero', 'touchstart', { touches: touch(box.x), changedTouches: touch(box.x) });
      for (let k = 1; k <= 6; k += 1) await p.dispatchEvent('.hero', 'touchmove', { touches: touch(box.x - 18 * k), changedTouches: touch(box.x - 18 * k) });
      await p.dispatchEvent('.hero', 'touchend', { touches: [], changedTouches: touch(box.x - 108) });
      await p.waitForTimeout(300);
      if (scheme === 'light') check(!!(await p.$('.notnow-pop')), 'on a phone, swiping the card left opens the same menu');
    } else {
      await p.locator('.hero-notnow:visible').first().click();
      await p.waitForTimeout(250);
    }
    await p.screenshot({ path: `${OUT}/2-menu-${name}-${scheme}.png` });
    const menu = await text(p, '.notnow-pop');
    if (name === 'desk' && scheme === 'light') {
      check(/^Not today .* Can't start yet .* Show me something else/.test(menu), `the menu: "${menu}"`);
      const onTop = await p.evaluate(() => { const m = document.querySelector('.notnow-pop').getBoundingClientRect(); const e = document.elementFromPoint(m.x + m.width / 2, m.bottom - 8); return !!e?.closest('.notnow-pop'); });
      check(onTop, 'the menu opens above everything below it');
      // Show me something else: the next item, an Undo toast, and Undo brings it back.
      await p.click('.notnow-item:has-text("Show me something else")');
      await p.waitForTimeout(700);
      const t1 = await heroTitle(p);
      check(t1 !== t0 && /Skipped .* for now/.test(await text(p, '.done-toast')), `Show me something else: "${t0}" → "${t1}", with "${await text(p, '.done-toast-text')}"`);
      await p.click('.done-toast-undo');
      await p.waitForTimeout(500);
      check((await heroTitle(p)) === t0, 'Undo puts it back');
      // Not today: gone until tomorrow, with its note on the agenda.
      await p.locator('.hero-notnow:visible').first().click();
      await p.click('.notnow-item:has-text("Not today")');
      await p.waitForTimeout(700);
      check((await heroTitle(p)) !== t0 && /back tomorrow/.test(await text(p, '.done-toast')), `Not today: slides on, toast "${await text(p, '.done-toast-text')}"`);
      await p.click('.done-toast-undo');
      await p.waitForTimeout(500);
      // Can't start yet: one quick question, then the next item.
      await p.locator('.hero-notnow:visible').first().click();
      await p.click('.notnow-item:has-text("Can\'t start yet")');
      await p.waitForTimeout(250);
      await p.screenshot({ path: `${OUT}/3-waiting-on-what-${name}-${scheme}.png` });
      const q = await text(p, '.notnow-pop');
      check(/Waiting on what\?/.test(q) && /Lab or class hasn't happened/.test(q) && /Waiting on a partner/.test(q) && /Need materials/.test(q) && /Waiting on the professor/.test(q) && /Other/.test(q), `"Waiting on what?" with tap options: ${q.replace('Waiting on what? ', '')}`);
      await p.click(".notnow-reason:has-text(\"Lab or class hasn't happened\")");
      await p.waitForTimeout(700);
      const toast = await text(p, '.done-toast-text');
      check((await heroTitle(p)) !== t0 && /: back /.test(toast), `Can't start yet: the next item, "${toast}"`);
      await p.screenshot({ path: `${OUT}/4-after-${name}-${scheme}.png` });
      const blocked = await p.evaluate((label) => JSON.parse(localStorage.getItem('school-dashboard:v1')).items.find((i) => i.label === label), t0);
      const due = new Date(blocked.dueAt).getTime();
      const back = new Date(`${blocked.blocked.until}T12:00:00`).getTime();
      // Tomorrow where the student is (the planner's timezone), not in UTC: in a Phoenix evening UTC is already tomorrow.
      const tz = await p.evaluate(() => JSON.parse(localStorage.getItem('school-dashboard:v1')).settings.timezone);
      const tomorrow = new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date(Date.now() + 86400000));
      check(blocked.blocked?.reason === 'class' && (back <= due - 1.5 * 86400000 || (due - 2 * 86400000 < Date.now() && blocked.blocked.until === tomorrow)), `it comes back ${blocked.blocked.until}: two days before it is due, or tomorrow when that has passed (due ${blocked.dueAt.slice(0, 10)})`);
      await p.goto(`${BASE}#/calendar?v=agenda`, { waitUntil: 'load' });
      await p.waitForTimeout(900);
      const row = await p.$eval(`.item-row:has(.item-title:text-is("${t0}"))`, (e) => e.innerText.replace(/\s+/g, ' ')).catch(() => '');
      await p.screenshot({ path: `${OUT}/5-agenda-${name}-${scheme}.png` });
      check(/Can't start yet: waiting on/.test(row), `it stays on the agenda with a note: "${row.match(/Can't start yet: [^·]*/)?.[0]?.trim()}"`);
    }
    await ctx.close();
  }
}
await browser.close();
console.log(checks.every(Boolean) ? 'PASS' : 'FAIL');
process.exit(checks.every(Boolean) ? 0 : 1);
