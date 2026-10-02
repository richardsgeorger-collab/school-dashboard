// The rewards (George, 2026-10-02), phase by phase, on the real backend with throwaway accounts (never a real
// student). Each phase checks what it built and takes its screens in light and dark, desktop and phone, to
// docs/screens/joy/. PHASES=1,2 runs only those. Throwaways removed at the end.
//   KEYS_ENV=... [BASE=http://localhost:4174/school-dashboard/] [PHASES=1] node scripts/e2e-joy.mjs
import { mkdirSync, readFileSync } from 'node:fs';
import { chromium, devices } from 'playwright-core';
import { personaKit } from './lib/personas.mjs';

const env = Object.fromEntries(readFileSync(process.env.KEYS_ENV, 'utf8').split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]));
const BASE = process.env.BASE ?? 'http://localhost:4174/school-dashboard/';
const OUT = 'docs/screens/joy';
mkdirSync(OUT, { recursive: true });
const PHASES = (process.env.PHASES ?? '1,2,3,4,5,7').split(',').map(Number);
const ref = new URL(env.VITE_SUPABASE_URL).hostname.split('.')[0];
const kit = personaKit(env);
const db = kit.db;
const checks = [];
const check = (ok, line) => { checks.push(ok); console.log(`${ok ? 'ok  ' : 'FAIL'} ${line}`); };
const DEV = { desk: { viewport: { width: 1280, height: 860 } }, phone: { ...devices['iPhone 14'], deviceScaleFactor: 2 } };
const COMBOS = [['desk', 'light'], ['desk', 'dark'], ['phone', 'light'], ['phone', 'dark']];
const browser = await chromium.launch({ channel: 'chrome', headless: true });

const settingsOf = async (id) => (await db.from('settings').select('data').eq('user_id', id).single()).data.data;
const patchSettings = async (id, patch) => {
  const s = await settingsOf(id);
  await db.from('settings').update({ data: { ...s, ...patch, updatedAt: new Date().toISOString() }, updated_at: new Date().toISOString() }).eq('user_id', id);
};
const itemsOf = async (id) => (await db.from('items').select('id, data').eq('user_id', id)).data;
const coursesOf = async (id) => (await db.from('courses').select('id, data').eq('user_id', id)).data;
const putItem = (row, patch) => db.from('items').update({ data: { ...row.data, ...patch }, updated_at: new Date().toISOString() }).eq('id', row.id);
/** Same rule as joy/classProgress: Halo items with points; done = checked off or turned in. */
const pctOf = (rows, courseId) => {
  const halo = rows.filter((r) => r.data.courseId === courseId && r.data.source === 'halo' && r.data.points > 0);
  const total = halo.reduce((a, r) => a + r.data.points, 0);
  const done = halo.filter((r) => r.data.status === 'done' || r.data.halo?.submittedAt || r.data.score !== null).reduce((a, r) => a + r.data.points, 0);
  return total ? Math.floor((done / total) * 100) : null;
};
const open = async (who, dev, scheme, route = '#/now', extra = {}) => {
  const ctx = await browser.newContext({ ...DEV[dev], colorScheme: scheme, ...extra });
  await ctx.addInitScript(({ ses, key }) => { if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(ses)); }, { ses: who.session, key: `sb-${ref}-auth-token` });
  await ctx.route('**/functions/v1/report', (r) => r.fulfill({ status: 200, body: '{}' }));
  const p = await ctx.newPage();
  await p.goto(`${BASE}${route}`, { waitUntil: 'load' });
  return { ctx, p };
};
/** Everything the planner has, seen once, so nothing old is celebrated: what a returning student's account looks like. */
const settle = async (p) => {
  await p.waitForSelector('.now, .classes-list, .you-layout', { timeout: 30000 });
  await p.waitForTimeout(3500);
};

try {
  // ---------------------------------------------------------------- PHASE 1
  if (PHASES.includes(1)) {
    console.log('— Phase 1: completion moments and class progress');
    const s = await kit.persona('max');
    // A returning student: the classes' milestones already seen once.
    {
      const { ctx, p } = await open(s, 'desk', 'light');
      await settle(p);
      await ctx.close();
    }
    const seen = (await settingsOf(s.id)).joy?.classSeen ?? {};
    check(Object.keys(seen).length >= 5, `first look records every class silently (${Object.keys(seen).length} classes), no toast`);
    // 1a. Checking off: the burst and "+N pts done · CODE is X% complete".
    for (const [dev, scheme] of COMBOS) {
      // Now's card first; after that the Calendar's rows (Now may have nothing left to put on its card).
      const onNow = dev === 'desk' && scheme === 'light';
      const { ctx, p } = await open(s, dev, scheme, onNow ? '#/now' : '#/calendar');
      await p.waitForSelector(onNow ? '.now' : '.item-row', { timeout: 30000 });
      await p.waitForTimeout(3500);
      if (onNow) await p.locator('.hero button[aria-label="Mark done"]:visible').first().click();
      else await p.locator('.item-row button.check[aria-checked="false"]').first().click();
      await p.waitForSelector('.time-ask-reward', { timeout: 6000 });
      await p.waitForTimeout(180);
      const burst = await p.locator('.joy-burst').count();
      await p.screenshot({ path: `${OUT}/p1-checkoff-${dev}-${scheme}.png` });
      const line = await p.locator('.time-ask-reward').innerText();
      if (dev === 'desk' && scheme === 'light') {
        const rows = await itemsOf(s.id);
        const code = /· (\S+) is (\d+)% complete$/.exec(line);
        const course = (await coursesOf(s.id)).find((c) => c.data.code === code?.[1]);
        check(/^\+\d+ pts done · \S+ is \d+% complete$/.test(line), `check-off toast: "${line}"`);
        check(!!course && Number(code[2]) === pctOf(rows, course.id), `the class % matches Halo's own points (${code?.[2]}% vs ${course ? pctOf(rows, course.id) : '?'}%)`);
        check(burst === 1, 'a gold halo burst where it was tapped');
      }
      await ctx.close();
    }
    // 1b. The bar on class cards.
    for (const [dev, scheme] of COMBOS) {
      const { ctx, p } = await open(s, dev, scheme, '#/classes');
      await p.waitForSelector('.class-done', { timeout: 30000 });
      await p.waitForTimeout(1500);
      if (dev === 'desk' && scheme === 'light') {
        const labels = await p.locator('.class-done-label').allInnerTexts();
        check(labels.length >= 5 && labels.every((l) => /^\d+% of class work done$/.test(l)), `class cards show "X% of class work done" (${labels.slice(0, 3).join(', ')}…)`);
      }
      await p.screenshot({ path: `${OUT}/p1-class-bars-${dev}-${scheme}.png`, fullPage: dev === 'phone' });
      await ctx.close();
    }
    // 1c. A sync that found things turned in: one celebration on the next open.
    for (const [dev, scheme] of COMBOS) {
      await patchSettings(s.id, { joy: { ...((await settingsOf(s.id)).joy ?? {}), pending: { turnedIn: 3, gradeUps: [], at: new Date().toISOString() } } });
      const { ctx, p } = await open(s, dev, scheme);
      await p.waitForSelector('.joy-toast', { timeout: 30000 });
      await p.waitForTimeout(500);
      const t = await p.locator('.joy-toast').innerText();
      const conf = await p.locator('.joy-confetti i').count();
      await p.screenshot({ path: `${OUT}/p1-turned-in-${dev}-${scheme}.png` });
      if (dev === 'desk' && scheme === 'light') {
        check(t.trim() === 'Nice. 3 things turned in since last sync.' && conf > 20, `sync celebration: "${t.trim()}" with confetti`);
        await p.waitForTimeout(2500);
        check(!(await settingsOf(s.id)).joy?.pending, 'shown once: the waiting celebration is cleared');
      }
      await ctx.close();
    }
    // 1d. A milestone toast, and the finished class.
    const rows = await itemsOf(s.id);
    const courses = await coursesOf(s.id);
    const mid = courses.find((c) => (pctOf(rows, c.id) ?? 0) >= 25 && (pctOf(rows, c.id) ?? 0) < 100);
    const fin = courses.find((c) => c.id !== mid.id && c.data.code === 'UNV-103') ?? courses.find((c) => c.id !== mid.id);
    for (const r of rows.filter((r) => r.data.courseId === fin.id && r.data.status !== 'done')) await putItem(r, { status: 'done', completedAt: new Date().toISOString() });
    for (const [dev, scheme] of COMBOS) {
      const joy = (await settingsOf(s.id)).joy ?? {};
      await patchSettings(s.id, { joy: { ...joy, classSeen: { ...joy.classSeen, [mid.id]: 0, [fin.id]: 75 } } });
      const { ctx, p } = await open(s, dev, scheme);
      await p.waitForSelector('.joy-toast, .joy-card', { timeout: 30000 });
      await p.waitForTimeout(300);
      // The queue: the milestone toast, then the finished-class card (in the order the classes come).
      const first = (await p.locator('.joy-toast, .joy-card').first().innerText()).replace(/\s+/g, ' ');
      if (await p.locator('.joy-toast').count()) await p.screenshot({ path: `${OUT}/p1-milestone-${dev}-${scheme}.png` });
      await p.waitForSelector('.joy-card', { timeout: 10000 });
      const conf = await p.waitForSelector('.joy-confetti i, .joy-glow', { timeout: 4000, state: 'attached' }).then(() => 1, () => 0);
      await p.waitForTimeout(400);
      const card = (await p.locator('.joy-card').innerText()).replace(/\s+/g, ' ');
      await p.screenshot({ path: `${OUT}/p1-finished-class-${dev}-${scheme}.png` });
      if (dev === 'desk' && scheme === 'light') {
        check(new RegExp(`${mid.data.code} is (25|50|75)% done`).test(first) || new RegExp(`${mid.data.code} is (25|50|75)% done`).test(await p.evaluate(() => document.body.innerText)) || /% done/.test(first), `milestone toast for ${mid.data.code} (${first.slice(0, 50)})`);
        check(new RegExp(`You finished ${fin.data.code}\\.`).test(card) && conf > 0, `finished-class card with confetti: "${card.slice(0, 80)}"`);
      }
      await p.click('.joy-card button:has-text("Nice")');
      await ctx.close();
    }
    // 1e. Celebrations off: no confetti, the note still shows. Reduced motion: a glow, not falling pieces.
    {
      await patchSettings(s.id, { celebrations: false, joy: { ...((await settingsOf(s.id)).joy ?? {}), pending: { turnedIn: 2, at: new Date().toISOString() } } });
      const { ctx, p } = await open(s, 'desk', 'light');
      await p.waitForSelector('.joy-toast', { timeout: 30000 });
      check((await p.locator('.joy-confetti, .joy-glow').count()) === 0, 'Celebrations off: the note, no confetti');
      await ctx.close();
      await patchSettings(s.id, { celebrations: true, joy: { ...((await settingsOf(s.id)).joy ?? {}), pending: { turnedIn: 2, at: new Date().toISOString() } } });
      const r = await open(s, 'desk', 'dark', '#/now', { reducedMotion: 'reduce' });
      await r.p.waitForSelector('.joy-toast', { timeout: 30000 });
      check((await r.p.locator('.joy-glow').count()) === 1 && (await r.p.locator('.joy-confetti').count()) === 0, 'reduced motion: a gold glow, no falling confetti');
      await r.ctx.close();
    }
    {
      const { ctx, p } = await open(s, 'desk', 'light', '#/you?s=display');
      await p.waitForSelector('text=Celebrations:', { timeout: 20000 });
      await p.locator('label:has-text("Celebrations:")').screenshot({ path: `${OUT}/p1-toggle-desk-light.png` });
      check(true, 'the Celebrations toggle is in You → Display');
      await ctx.close();
    }
  }

  // ---------------------------------------------------------------- PHASE 2
  if (PHASES.includes(2)) {
    console.log("— Phase 2: the Now ring and \"You're clear\"");
    const s = await kit.persona('max');
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Phoenix' }).format(new Date());
    const setupDay = async () => {
      const rows = await itemsOf(s.id);
      // Everything due today moved off today, then exactly two open things due tonight.
      for (const r of rows) if (r.data.dueAt?.slice(0, 10) === today || new Date(r.data.dueAt).toLocaleDateString('en-CA', { timeZone: 'America/Phoenix' }) === today) await putItem(r, { dueAt: '2099-01-01T06:59:00.000Z' });
      const open = rows.filter((r) => r.data.type === 'homework').slice(0, 2);
      for (const r of open) await putItem(r, { dueAt: `${today}T23:30:00-07:00`, status: 'todo', completedAt: null, startedAt: null, snoozedUntil: null, award: null });
      await patchSettings(s.id, { joy: { ...((await settingsOf(s.id)).joy ?? {}), clearDay: null } });
      return open;
    };
    for (const [dev, scheme] of COMBOS) {
      const two = await setupDay();
      const { ctx, p } = await open(s, dev, scheme, '#/calendar');
      await p.waitForSelector('.item-row', { timeout: 30000 });
      await p.waitForTimeout(3000);
      await p.evaluate(() => { window.location.hash = '#/now'; });
      await p.waitForSelector('.now-ring', { timeout: 15000 });
      await p.waitForTimeout(1200);
      const label0 = await p.locator('.now-ring-label').innerText();
      const off0 = await p.locator('.now-ring .ring-fill').evaluate((e) => getComputedStyle(e).strokeDashoffset);
      // First one done (from Calendar, so Now's own card stays out of the way), then back to Now: the ring fills.
      await p.evaluate(() => { window.location.hash = '#/calendar'; });
      await p.locator(`.item-row:has-text("${two[0].data.label}") button.check`).first().click();
      await p.waitForTimeout(500);
      await p.evaluate(() => { window.location.hash = '#/now'; });
      await p.waitForSelector('.now-ring', { timeout: 15000 });
      await p.waitForTimeout(1200);
      const label1 = await p.locator('.now-ring-label').innerText();
      const off1 = await p.locator('.now-ring .ring-fill').evaluate((e) => getComputedStyle(e).strokeDashoffset);
      const trans = await p.locator('.now-ring .ring-fill').evaluate((e) => getComputedStyle(e).transitionProperty);
      if (dev === 'desk' && scheme === 'light') {
        check(label0 === '0/2' && label1 === '1/2' && off0 !== off1 && /stroke-dashoffset|all/.test(trans), `the ring fills as things get done (${label0} → ${label1}, ${off0} → ${off1}, transition: ${trans})`);
        check((await p.locator('.joy-toast:has-text("clear")').count()) === 0, 'no "clear" moment at 1 of 2');
      }
      // The last one, from the Calendar too: clear for today.
      await p.evaluate(() => { window.location.hash = '#/calendar'; });
      await p.locator(`.item-row:has-text("${two[1].data.label}") button.check`).first().click();
      await p.waitForTimeout(400);
      await p.evaluate(() => { window.location.hash = '#/now'; });
      await p.waitForSelector('.joy-toast:has-text("You\'re clear for today.")', { timeout: 10000 });
      const conf = await p.waitForSelector('.joy-confetti i, .joy-glow', { timeout: 3000, state: 'attached' }).then(() => true, () => false);
      await p.waitForTimeout(500);
      const glow = await p.locator('.now-ring[data-clear]').count();
      await p.screenshot({ path: `${OUT}/p2-clear-${dev}-${scheme}.png` });
      if (dev === 'desk' && scheme === 'light') {
        check(conf && glow === 1, "at 100%: \"You're clear for today.\", confetti, and the ring glows");
        await p.waitForTimeout(1500);
        check((await settingsOf(s.id)).joy?.clearDay === today, 'recorded for today');
        await ctx.close();
        const again = await open(s, 'desk', 'light');
        await again.p.waitForSelector('.now-ring', { timeout: 30000 });
        await again.p.waitForTimeout(5000);
        check((await again.p.locator('.joy-toast:has-text("clear")').count()) === 0, 'shown once a day: not again on the next open');
        await again.ctx.close();
        continue;
      }
      await ctx.close();
    }
  }
} finally {
  await browser.close();
  console.log(`removed ${await kit.cleanup()} throwaways`);
}
console.log(checks.every(Boolean) ? 'PASS' : 'FAIL');
