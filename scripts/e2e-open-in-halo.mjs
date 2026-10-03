// Open in Halo, made obvious (2026-09-29): on the Now card it is a button in the main row right after Start. Since the
// 2026-10-02 clarity pass the row is Start, ✓ Done, Open in Halo, and Get help, Ask a question, Details and Not now
// are a quiet line under it; Then rows, agenda rows and the item sheet carry a small
// "↗ Halo"; on a phone the row keeps Start and Open in Halo and the rest moves into Details. Also: a line that only
// restates the assignment ("Author Chemistry Connections Essay using guides" on that essay) is not shown, and
// ticking one line keeps the others. Sample term (with Halo ids added), light and dark, desk and phone.
//   BASE=http://localhost:4173/school-dashboard/ node scripts/e2e-open-in-halo.mjs
import { mkdirSync } from 'node:fs';
import { chromium, devices } from 'playwright-core';
const BASE = process.env.BASE ?? 'http://localhost:4173/school-dashboard/';
const OUT = 'docs/screens/open-in-halo';
mkdirSync(OUT, { recursive: true });
const checks = [];
const check = (ok, line) => { checks.push(ok); console.log(`${ok ? 'ok  ' : 'FAIL'} ${line}`); };
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const text = (p, sel) => p.$eval(sel, (e) => e.innerText.replace(/\s+/g, ' ').trim()).catch(() => '');
const visibleRow = (p) => p.$$eval('.hero-actions > *', (els) => els.filter((e) => e.offsetParent !== null && getComputedStyle(e).display !== 'none').map((e) => (e.querySelector('.hero-notnow') ? 'Not now' : e.getAttribute('aria-label') === 'Mark done' ? '✓' : e.innerText.trim())));
for (const scheme of ['light', 'dark']) {
  for (const [name, device] of [['desk', { viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2 }], ['phone', { ...devices['iPhone 14'], deviceScaleFactor: 2 }]]) {
    const ctx = await browser.newContext({ ...device, colorScheme: scheme });
    const p = await ctx.newPage();
    await p.goto(`${BASE}#/now?seed=1`, { waitUntil: 'load' });
    await p.waitForTimeout(1000);
    const heroId = await p.evaluate(() => {
      const d = JSON.parse(localStorage.getItem('school-dashboard:v1'));
      d.settings.onboarding = { startedAt: 'x', step: 'done', doneAt: 'x', skippedAt: null, tourDoneAt: 'x' };
      d.settings.sundayReview = { skips: 0, lastOffered: null, lastDone: null, off: true };
      for (const c of d.courses) c.haloSlugId = `${c.code}-SLUG`;
      d.items.forEach((i, k) => { i.haloId = `hid-${k}`; i.haloUnitId = `unit-${k % 5}`; i.haloType = i.type === 'quiz' ? 'QUIZ' : 'ASSIGNMENT'; });
      localStorage.setItem('school-dashboard:v1', JSON.stringify(d));
      return null;
    });
    void heroId;
    await p.reload({ waitUntil: 'load' });
    await p.waitForTimeout(1300);
    // Give the hero a restating line and a real one.
    await p.evaluate(() => {
      const d = JSON.parse(localStorage.getItem('school-dashboard:v1'));
      const title = document.querySelector('.hero-title')?.innerText.trim();
      const it = d.items.find((i) => i.label === title);
      const now = new Date().toISOString();
      const src = { kind: 'announcement', id: 'p1', title: 'Week 5', quote: 'q', at: now };
      it.requirements = [
        { id: 'rq-restate', text: `Author ${it.title} using guides`, dueAt: null, done: false, doneAt: null, gradedOn: true, source: src, addedAt: now },
        { id: 'rq-real', text: 'Cite two peer-reviewed sources', dueAt: null, done: false, doneAt: null, gradedOn: true, source: src, addedAt: now },
        { id: 'rq-done', text: 'Pick a topic from the list', dueAt: null, done: true, doneAt: now, gradedOn: true, source: src, addedAt: now },
      ];
      it.updatedAt = now;
      localStorage.setItem('school-dashboard:v1', JSON.stringify(d));
    });
    await p.reload({ waitUntil: 'load' });
    await p.waitForTimeout(1300);
    await p.locator('.hero').scrollIntoViewIfNeeded();
    await p.screenshot({ path: `${OUT}/1-hero-${name}-${scheme}.png` });
    const row = await visibleRow(p);
    const halo = await p.$eval('.hero-halo', (e) => ({ href: e.getAttribute('href'), cls: e.className, h: e.getBoundingClientRect().height }));
    const help = await p.$eval('.hero-actions .hero-study', (e) => e.getBoundingClientRect().height).catch(() => 0);
    if (scheme === 'light') {
      if (name === 'desk') {
        check(row.join(' | ') === 'Start | ✓ | Open in Halo ↗' || row.join(' | ') === 'Start | ✓ | Open in Halo ↗ | Practice', `the row: ${row.join(' | ')}`);
        const more = await text(p, '.hero-more');
        check(/^(Get help Ask a question )?Details Not now$/.test(more), `the quiet line under it: "${more}"`);
        const start = await p.$eval('.hero-actions .btn.primary', (e) => e.getBoundingClientRect().height);
        check(/^https:\/\/halo\.gcu\.edu\/(quiz|courses)\//.test(halo.href) && halo.h >= 40 && start >= halo.h, `Open in Halo goes to the assignment (${halo.href}), a full-size button beside Start (${Math.round(halo.h)}px)`);
        void help;
        const also = await text(p, '.hero .reqs-compact');
        check(!/Author .* using guides/.test(also) && /Cite two peer-reviewed sources/.test(also), `Also required drops the restatement: "${also}"`);
        await p.click('.hero .reqs-compact input[type=checkbox]');
        await p.waitForTimeout(400);
        const kept = await p.evaluate((t) => JSON.parse(localStorage.getItem('school-dashboard:v1')).items.find((i) => i.label === t).requirements.map((r) => `${r.id}:${r.done}`), await text(p, '.hero-title'));
        check(kept.length === 3 && kept.includes('rq-real:true') && kept.includes('rq-done:true'), `ticking one line keeps the others: ${kept.join(', ')}`);
      } else {
        check(row.join(' | ') === 'Start | Open in Halo ↗ | Details', `phone row: ${row.join(' | ')}`);
      }
    }
    await p.locator('.hero :is(.hero-link, .btn.quiet):visible', { hasText: 'Details' }).first().click();
    await p.waitForTimeout(400);
    await p.screenshot({ path: `${OUT}/2-hero-details-${name}-${scheme}.png`, fullPage: name === 'phone' });
    if (scheme === 'light' && name === 'phone') {
      const moved = await p.$$eval('.hero-phone-row > *', (els) => els.map((e) => e.innerText.trim()));
      check(/Done/.test(moved.join(' ')) && /Get help|Practice/.test(moved.join(' ')) && /Not now/.test(moved.join(' ')), `on a phone the rest is in Details: ${moved.join(' | ')}`);
      await p.click('.hero-phone-row .hero-notnow');
      await p.waitForTimeout(250);
      check(await p.$eval('.hero-phone-row .notnow-pop', (e) => e.offsetParent !== null).catch(() => false), 'and Not now still opens its menu from there');
      await p.keyboard.press('Escape');
    }
    if (scheme === 'light' && name === 'desk') {
      const then = await p.$$eval('.then li', (els) => els.map((e) => !!e.querySelector('.halo-jump')));
      check(then.length > 0 && then.every(Boolean), `every Then row has ↗ Halo (${then.length})`);
      await p.goto(`${BASE}#/calendar?v=agenda`, { waitUntil: 'load' });
      await p.waitForTimeout(900);
      const rows = await p.$$eval('.item-row', (els) => els.slice(0, 10).map((e) => !!e.querySelector('.halo-jump')));
      await p.screenshot({ path: `${OUT}/3-agenda-${scheme}.png` });
      check(rows.length > 0 && rows.every(Boolean), `agenda rows have ↗ Halo (${rows.length} checked)`);
      await p.click('.item-row .item-main >> nth=0');
      await p.waitForTimeout(600);
      await p.screenshot({ path: `${OUT}/4-sheet-${scheme}.png` });
      check(!!(await p.$('.modal .item-facts .halo-jump')), 'the item sheet has ↗ Halo at the top');
    }
    await ctx.close();
  }
}
await browser.close();
console.log(checks.every(Boolean) ? 'PASS' : 'FAIL');
process.exit(checks.every(Boolean) ? 0 : 1);
