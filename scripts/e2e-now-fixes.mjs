// Now card fixes from George's screenshot (2026-09-29): menus and popovers open above everything; the top bar is
// solid when the page scrolls under it; heads-up lines are one line (about 15 words) with the rest behind a tap;
// nothing shows twice in Details; a one-option menu is a text link. Screens of the card with Details open, light
// and dark. Sample term on the preview build.
//   BASE=http://localhost:4173/school-dashboard/ node scripts/e2e-now-fixes.mjs
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright-core';
const BASE = process.env.BASE ?? 'http://localhost:4173/school-dashboard/';
const OUT = 'docs/screens/now-fixes';
mkdirSync(OUT, { recursive: true });
const checks = [];
const check = (ok, line) => { checks.push(ok); console.log(`${ok ? 'ok  ' : 'FAIL'} ${line}`); };
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const text = (p, sel) => p.$eval(sel, (e) => e.innerText.replace(/\s+/g, ' ').trim()).catch(() => '');
for (const scheme of ['light', 'dark']) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2, colorScheme: scheme });
  const p = await ctx.newPage();
  await p.goto(`${BASE}#/now?seed=1`, { waitUntil: 'load' });
  await p.waitForTimeout(1000);
  await p.evaluate(() => {
    const d = JSON.parse(localStorage.getItem('school-dashboard:v1'));
    d.settings.onboarding = { startedAt: 'x', step: 'done', doneAt: 'x', skippedAt: null, tourDoneAt: 'x' };
    d.settings.sundayReview = { skips: 0, lastOffered: null, lastDone: null, off: true };
    // A requirement like George's CHM-113L Lab Safety Waiver: long line, quoted post title, due tomorrow.
    const now = new Date().toISOString();
    const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10) + 'T23:59:00-07:00';
    const lab = d.items.find((i) => i.status !== 'done' && d.courses.find((c) => c.id === i.courseId)?.code === 'CHM-113L' && i.dueAt > now);
    lab.requirements = [{ id: 'rq-e2e-waiver', text: 'Print, sign, and bring the lab safety waiver to the first lab session', dueAt: tomorrow, done: false, doneAt: null, gradedOn: true, scope: 'instance', source: { kind: 'announcement', id: 'post-waiver', title: 'Welcome to CHM-113L! Important information about lab safety, goggles, and the waiver', quote: 'Print, sign and bring the waiver.', at: now }, addedAt: now }];
    lab.updatedAt = now;
    localStorage.setItem('school-dashboard:v1', JSON.stringify(d));
  });
  await p.reload({ waitUntil: 'load' });
  await p.waitForTimeout(1500);
  // Heads up: every line one line.
  const lines = await p.$$eval('.headsup-line', (els) => els.map((e) => { const t = e.querySelector('.headsup-tap') ?? e.querySelector('.headsup-text'); const clone = t.cloneNode(true); clone.querySelectorAll('button:not(.headsup-tap), a').forEach((x) => x.remove()); return { words: clone.innerText.trim().split(/\s+/).length, h: e.getBoundingClientRect().height, text: clone.innerText.trim() }; }));
  if (scheme === 'light') {
    check(lines.length > 0 && lines.every((l) => l.words <= 16), `every heads-up line is about 15 words at most: ${lines.map((l) => l.words).join(', ')}`);
    const waiver = lines.find((l) => /waiver/i.test(l.text));
    check(!!waiver && !/"/.test(waiver.text), `the waiver line is short, no quoted post title: "${waiver?.text}"`);
    await p.click('.headsup-tap:has-text("waiver")').catch(() => undefined);
    await p.waitForTimeout(300);
    check(/Your instructor posted it in/.test(await text(p, '.headsup-detail')), 'the rest is one tap away');
  }
  await p.screenshot({ path: `${OUT}/1-heads-up-${scheme}.png` });
  // Details open.
  await p.click('.hero .btn.quiet:has-text("Details")');
  await p.waitForTimeout(400);
  await p.locator('.hero').scrollIntoViewIfNeeded();
  await p.screenshot({ path: `${OUT}/2-hero-details-${scheme}.png`, fullPage: true });
  if (scheme === 'light') {
    check(!(await p.$('.hero details.menu')), 'no one-option More menu in Details');
    const copy = await p.$('.hero .hero-copy');
    check(!!copy && (await copy.evaluate((e) => getComputedStyle(e).backgroundColor)) === 'rgba(0, 0, 0, 0)', 'Copy a short prompt is a small text link');
    // Not now's menu over the Then cards, as the More menu should have been.
    await p.locator('.hero-notnow:visible').first().click();
    const onTop = await p.evaluate(() => { const m = document.querySelector('.notnow-pop').getBoundingClientRect(); return [0.2, 0.5, 0.9].every((f) => document.elementFromPoint(m.x + m.width * f, m.y + m.height * f)?.closest('.notnow-pop')); });
    check(onTop, 'a menu on the card opens above the cards below it');
    await p.keyboard.press('Escape');
  }
  // The top bar: solid, and nothing shows through while scrolling.
  await p.evaluate(() => window.scrollTo(0, 260));
  await p.waitForTimeout(300);
  await p.screenshot({ path: `${OUT}/3-scrolled-nav-${scheme}.png` });
  const bar = await p.$eval('.topbar', (e) => { const s = getComputedStyle(e); return { bg: s.backgroundColor, blur: s.backdropFilter }; });
  if (scheme === 'light') check(!/rgba\([^)]*, 0?\.\d+\)/.test(bar.bg) && (bar.blur === 'none' || !bar.blur), `the top bar is solid (${bar.bg})`);
  // The Inbox menu, above its neighbours too.
  await p.goto(`${BASE}#/inbox`, { waitUntil: 'load' });
  await p.waitForTimeout(900);
  const menu = await p.$('details.menu > summary');
  if (menu) {
    await menu.click();
    await p.waitForTimeout(250);
    const top = await p.evaluate(() => { const m = document.querySelector('details.menu[open] .menu-list'); if (!m) return false; const r = m.getBoundingClientRect(); return !!document.elementFromPoint(r.x + r.width / 2, r.bottom - 6)?.closest('.menu-list'); });
    await p.screenshot({ path: `${OUT}/4-inbox-menu-${scheme}.png` });
    if (scheme === 'light') check(top, 'the Inbox ⋯ menu opens above everything');
  }
  await ctx.close();
}
await browser.close();
console.log(checks.every(Boolean) ? 'PASS' : 'FAIL');
process.exit(checks.every(Boolean) ? 0 : 1);
