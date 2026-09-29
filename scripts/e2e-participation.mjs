// Participation you won't forget (2026-09-29): Now's last line "Participation this week: N left" opens to each class's
// checklist (lines from announcements, plus Halo's rule where a class sets one); ticking counts down, the last tick
// marks the item done, and a done week says so. The item sheet has the same checklist. Sample term with this week's
// lines written in the way George's real ones read. Light and dark, desk and phone.
//   BASE=http://localhost:4173/school-dashboard/ node scripts/e2e-participation.mjs
import { mkdirSync } from 'node:fs';
import { chromium, devices } from 'playwright-core';
const BASE = process.env.BASE ?? 'http://localhost:4173/school-dashboard/';
const OUT = 'docs/screens/participation';
mkdirSync(OUT, { recursive: true });
const checks = [];
const check = (ok, line) => { checks.push(ok); console.log(`${ok ? 'ok  ' : 'FAIL'} ${line}`); };
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const text = (p, sel) => p.$eval(sel, (e) => e.innerText.replace(/\s+/g, ' ').trim()).catch(() => '');
for (const scheme of ['light', 'dark']) {
  for (const [name, device] of [['desk', { viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2 }], ['phone', { ...devices['iPhone 14'], deviceScaleFactor: 2 }]]) {
    const ctx = await browser.newContext({ ...device, colorScheme: scheme });
    const p = await ctx.newPage();
    await p.goto(`${BASE}#/now?seed=1`, { waitUntil: 'load' });
    await p.waitForTimeout(1200);
    await p.evaluate(() => {
      const d = JSON.parse(localStorage.getItem('school-dashboard:v1'));
      d.settings.onboarding = { startedAt: 'x', step: 'done', doneAt: 'x', skippedAt: null, tourDoneAt: 'x' };
      d.settings.sundayReview = { skips: 0, lastOffered: null, lastDone: null, off: true };
      const now = new Date().toISOString();
      const today = new Date().toISOString().slice(0, 10);
      const at = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10) + 'T23:59:00-07:00';
      const code = (id) => d.courses.find((c) => c.id === id)?.code;
      const src = { kind: 'announcement', id: null, title: 'Week announcement', quote: 'from the post', at: now };
      const lines = {
        'CHM-113': ['Acknowledge this week’s announcement after reading', 'Attend in-class activities Day 1 and Day 2'],
        'UNV-106': ['Acknowledge this week’s announcement'],
        'CHM-113L': ['Attend lab with notebook, PPE, and professional conduct'],
      };
      const seen = new Set();
      for (const i of d.items.filter((x) => x.type === 'participation').sort((a, b) => a.dueAt.localeCompare(b.dueAt))) {
        if (i.dueAt.slice(0, 10) < today || seen.has(i.courseId)) continue;
        seen.add(i.courseId);
        i.dueAt = at;
        i.status = 'todo';
        i.requirements = (lines[code(i.courseId)] ?? []).map((t, k) => ({ id: `rq-e2e-${i.id}-${k}`, text: t, dueAt: null, done: false, doneAt: null, gradedOn: true, source: src, addedAt: now }));
        i.updatedAt = now;
      }
      const unv = d.courses.find((c) => c.code === 'UNV-106');
      if (unv) { unv.participation = { description: 'Participating in classroom discussion…', days: 2, posts: 2 }; unv.updatedAt = now; }
      localStorage.setItem('school-dashboard:v1', JSON.stringify(d));
    });
    await p.reload({ waitUntil: 'load' });
    await p.waitForTimeout(1500);
    const line0 = await text(p, '.pw-head > span:first-child');
    await p.locator('.pw').scrollIntoViewIfNeeded().catch(() => undefined);
    await p.screenshot({ path: `${OUT}/1-now-line-${name}-${scheme}.png`, fullPage: name === 'phone' });
    await p.click('.pw-head');
    await p.waitForTimeout(400);
    await p.locator('.pw').scrollIntoViewIfNeeded().catch(() => undefined);
    await p.screenshot({ path: `${OUT}/2-now-open-${name}-${scheme}.png`, fullPage: name === 'phone' });
    if (scheme === 'light' && name === 'desk') {
      const n0 = Number(line0.match(/(\d+) left/)?.[1] ?? 0);
      check(/^Participation this week: \d+ left$/.test(line0) && n0 >= 5, `one compact line at the bottom of Now: "${line0}"`);
      const body = await text(p, '.pw-body');
      check(/Acknowledge this week’s announcement after reading/.test(body) && /Attend in-class activities Day 1 and Day 2/.test(body), 'it opens to each class’s checklist from the announcements');
      check(/2 forum posts on 2 different days/.test(body), 'a class with Halo’s rule gets that line too');
      await p.click('.pw-class:has-text("CHM-113 ") input[type=checkbox] >> nth=0').catch(async () => p.click('.pw-body input[type=checkbox] >> nth=0'));
      await p.waitForTimeout(400);
      const n1 = Number((await text(p, '.pw-head > span:first-child')).match(/(\d+) left/)?.[1] ?? 0);
      check(n1 === n0 - 1, `ticking a line counts down: ${n0} → ${n1}`);
      // Finish everything: tick every open line, then Mark done where a class lists nothing.
      for (let k = 0; k < 30; k += 1) {
        const box = await p.$('.pw-body input[type=checkbox]:not(:checked)');
        if (!box) break;
        await box.click();
        await p.waitForTimeout(250);
        await p.click('.levelup', { timeout: 800 }).catch(() => undefined);
      }
      for (let k = 0; k < 10; k += 1) {
        const b = await p.$('.pw-class[data-done="false"] button:has-text("Mark done")');
        if (!b) break;
        await b.click();
        await p.waitForTimeout(250);
        await p.click('.levelup', { timeout: 800 }).catch(() => undefined);
      }
      await p.waitForTimeout(500);
      const done = await text(p, '.pw-head > span:first-child');
      await p.screenshot({ path: `${OUT}/3-now-done-${name}-${scheme}.png` });
      check(done === 'Participation done this week.', `when everything is done: "${done}"`);
      const doneItems = await p.evaluate(() => JSON.parse(localStorage.getItem('school-dashboard:v1')).items.filter((i) => i.type === 'participation' && i.status === 'done' && (i.requirements ?? []).some((r) => r.id.startsWith('rq-e2e'))).length);
      check(doneItems >= 3, `the last tick marks the item itself done (${doneItems} items)`);
      check(!(await text(p, '.hero')).match(/Participation/), 'participation still stays out of the Now card');
    }
    await ctx.close();
  }
}
await browser.close();
console.log(checks.every(Boolean) ? 'PASS' : 'FAIL');
process.exit(checks.every(Boolean) ? 0 : 1);
