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
const PHASES = (process.env.PHASES ?? '1,2,3,4,5,7,8').split(',').map(Number);
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
      const rain = await p.locator('.joy-confetti i').count();
      await p.screenshot({ path: `${OUT}/p1-checkoff-${dev}-${scheme}.png` });
      const line = await p.locator('.time-ask-reward').innerText();
      if (dev === 'desk' && scheme === 'light') {
        const rows = await itemsOf(s.id);
        const code = /· (\S+) is (\d+)% complete$/.exec(line);
        const course = (await coursesOf(s.id)).find((c) => c.data.code === code?.[1]);
        check(/^\+\d+ pts done · \S+ is \d+% complete$/.test(line), `check-off toast: "${line}"`);
        check(!!course && Number(code[2]) === pctOf(rows, course.id), `the class % matches Halo's own points (${code?.[2]}% vs ${course ? pctOf(rows, course.id) : '?'}%)`);
        check(burst === 1, 'a gold halo burst where it was tapped');
        // It falls from the top edge of the screen: a full-screen layer, each piece starting just above it.
        const from = await p.evaluate(() => { const c = document.querySelector('.joy-confetti'); const i = c?.querySelector('i'); return c && i ? { fixed: getComputedStyle(c).position === 'fixed', top: c.getBoundingClientRect().top, start: getComputedStyle(i).top } : null; });
        check(rain > 40 && !!from && from.fixed && from.top === 0 && from.start === '-16px', `an assignment checked off: gold confetti from the top of the screen (${rain} pieces, ${JSON.stringify(from)})`);
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
      await p.waitForSelector('.joy-card', { timeout: 20000 });
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
      // A level-up from the first one may be showing (it depends on the throwaway's XP); it closes on a tap, as for a student.
      if (await p.locator('.levelup').count()) { await p.locator('.levelup').click(); await p.waitForTimeout(400); }
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

  // ---------------------------------------------------------------- PHASE 3
  if (PHASES.includes(3)) {
    console.log('— Phase 3: streaks');
    const s = await kit.persona('max');
    const tzDay = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Phoenix' }).format(d);
    const day = (k) => tzDay(new Date(Date.now() + k * 86_400_000));
    // Everything finished long ago, then: today, yesterday, (the day before missed: the week's skip day), and the day before that.
    const rows = await itemsOf(s.id);
    const done = rows.filter((r) => r.data.status === 'done');
    for (const r of done) await putItem(r, { completedAt: '2026-01-05T19:00:00Z', halo: r.data.halo ? { ...r.data.halo, submittedAt: '2026-01-05T19:00:00Z' } : null });
    const fresh = await itemsOf(s.id);
    const picks = fresh.filter((r) => r.data.status === 'done').slice(0, 3);
    const days = [day(0), day(-1), day(-3)];
    for (let k = 0; k < 3; k++) await putItem(picks[k], { completedAt: `${days[k]}T19:00:00Z`, halo: picks[k].data.halo ? { ...picks[k].data.halo, submittedAt: `${days[k]}T19:00:00Z` } : null });
    await patchSettings(s.id, { joy: { ...((await settingsOf(s.id)).joy ?? {}), streakSeen: 0 } });
    for (const [dev, scheme] of COMBOS) {
      const { ctx, p } = await open(s, dev, scheme);
      if (dev === 'desk' && scheme === 'light') {
        await p.waitForSelector('.joy-toast', { timeout: 30000 });
        const t = await p.locator('.joy-toast').innerText();
        check(/^3-day streak going\.$/.test(t.trim()), `streak milestone toast: "${t.trim()}"`);
        await p.screenshot({ path: `${OUT}/p3-streak-toast-desk-light.png` });
      } else {
        await p.waitForSelector('.streak-chip', { timeout: 30000 });
        await p.waitForTimeout(1500);
      }
      const chip = await p.locator('.streak-chip').innerText();
      if (dev === 'desk' && scheme === 'light') check(chip.trim() === '3', `the top bar shows the streak: ${chip.trim()} (today, yesterday, a skip day, and the day before)`);
      await p.locator('.topbar').screenshot({ path: `${OUT}/p3-topbar-${dev}-${scheme}.png` });
      await p.evaluate(() => { window.location.hash = '#/you?s=progress'; });
      await p.waitForSelector('.progress-card', { timeout: 15000 });
      await p.waitForTimeout(800);
      if (dev === 'desk' && scheme === 'light') check(/3 days Skip day used this week|3 days 1 skip day left this week/.test((await p.locator('.streaks').innerText()).replace(/\s+/g, ' ')), `You shows the streak and the skip day: "${(await p.locator('.streaks').innerText()).replace(/\s+/g, ' ').slice(0, 90)}"`);
      await p.locator('.progress-card').screenshot({ path: `${OUT}/p3-you-${dev}-${scheme}.png` });
      await ctx.close();
    }
    {
      // Unchecking takes it back.
      await putItem(picks[0], { status: 'todo', completedAt: null, halo: null, score: null });
      const { ctx, p } = await open(s, 'desk', 'light');
      await p.waitForSelector('.now', { timeout: 30000 });
      await p.waitForTimeout(3000);
      check((await p.locator('.streak-chip').innerText().catch(() => '0')).trim() === '2', 'unchecking today takes a day back (3 → 2)');
      await ctx.close();
    }
  }

  // ---------------------------------------------------------------- PHASE 4
  if (PHASES.includes(4)) {
    console.log('— Phase 4: levels on the halo, badges, grade ups');
    const s = await kit.persona('max');
    // An Early bird: something turned in three days before it was due.
    const rows = await itemsOf(s.id);
    const target = rows.find((r) => r.data.status !== 'done' && r.data.type === 'homework');
    const due = new Date(Date.now() + 5 * 86_400_000);
    await putItem(target, { status: 'done', completedAt: new Date(due.getTime() - 3 * 86_400_000).toISOString(), dueAt: due.toISOString(), halo: { status: 'SUBMITTED', submittedAt: new Date(Date.now() - 3600_000).toISOString(), checkedAt: new Date().toISOString() } });
    // XP the way the app records it when something is finished (the seeded term has none): about level 4.
    for (const r of rows.filter((r) => r.data.status === 'done').slice(0, 12)) await putItem(r, { award: { base: r.data.points, multiplier: 1, earnedAt: r.data.completedAt ?? new Date().toISOString(), scoreFactor: null } });
    const courses = await coursesOf(s.id);
    const chm = courses[0];
    await patchSettings(s.id, { reminders: { ...((await settingsOf(s.id)).reminders ?? {}), pushEnabled: true }, joy: { ...((await settingsOf(s.id)).joy ?? {}), badgesSeen: [], pending: { turnedIn: 0, gradeUps: [{ courseId: chm.id, code: chm.data.code, percent: 91 }], at: new Date().toISOString() }, gradeUpRecent: [{ courseId: chm.id, code: chm.data.code, percent: 91, at: new Date().toISOString() }] } });
    for (const [dev, scheme] of COMBOS) {
      const { ctx, p } = await open(s, dev, scheme);
      if (dev === 'desk' && scheme === 'light') {
        // The queue: the grade up, then each badge.
        const seen = [];
        for (let k = 0; k < 16 && seen.length < 3; k++) {
          const t = await p.locator('.joy-toast').innerText().catch(() => null);
          if (t && !seen.includes(t.trim())) {
            seen.push(t.trim());
            await p.screenshot({ path: `${OUT}/p4-toast-${seen.length}-desk-light.png` });
          }
          await p.waitForTimeout(600);
        }
        console.log(`     toasts: ${seen.join(' | ')}`);
        check(seen.includes(`Your ${chm.data.code} grade went up to 91%.`), 'grade-up toast');
        check(seen.includes('Badge: Early bird.'), 'badge toast: "Badge: Early bird."');
        const step = await p.locator('.brand-mark').getAttribute('data-level-step');
        const sw = await p.locator('.brand-mark svg path').first().evaluate((e) => getComputedStyle(e).strokeWidth);
        check(Number(step) >= 2 && parseFloat(sw) > 2.4, `the halo in the top bar grows with the level (step ${step}, stroke ${sw})`);
        await p.waitForTimeout(3000);
        const { data: plan } = await db.from('notification_plan').select('kind, title, body, sent_at').eq('user_id', s.id).eq('kind', 'grade_up');
        check(plan?.length === 1 && plan[0].body === `Your ${chm.data.code} grade went up to 91%.`, `the push is queued: "${plan?.[0]?.body}"`);
      } else await p.waitForTimeout(4000);
      await p.locator('.topbar .brand').screenshot({ path: `${OUT}/p4-halo-${dev}-${scheme}.png` });
      await p.evaluate(() => { window.location.hash = '#/you?s=progress'; });
      await p.waitForSelector('.badges', { timeout: 15000 });
      await p.waitForTimeout(600);
      if (dev === 'desk' && scheme === 'light') {
        const tiles = (await p.locator('.badge-tile').allInnerTexts()).map((t) => t.replace(/\s+/g, ' ').trim());
        check(tiles.length === 4 && /Early bird Earned/.test(tiles[0]) && /No late work this week/.test(tiles[1]) && /Survived a heavy week/.test(tiles[2]) && /Clean sweep/.test(tiles[3]), `the four badges on You: ${tiles.join(' | ')}`);
      }
      await p.locator('.progress-card').screenshot({ path: `${OUT}/p4-badges-${dev}-${scheme}.png` });
      await ctx.close();
    }
  }

  // ---------------------------------------------------------------- PHASE 5
  if (PHASES.includes(5)) {
    console.log('— Phase 5: the Sunday wrap');
    const s = await kit.persona('max');
    // Last week (Mon Sep 28 – Sun Oct 4): four things turned in, 330 pts, more than any week before (a 100-point week).
    const rows = await itemsOf(s.id);
    const done = rows.filter((r) => r.data.status === 'done');
    for (const r of done) await putItem(r, { completedAt: '2026-09-02T19:00:00Z', halo: r.data.halo ? { ...r.data.halo, submittedAt: '2026-09-02T19:00:00Z' } : null, points: 10 });
    const week = [['2026-09-29', 100], ['2026-09-30', 80], ['2026-10-01', 100], ['2026-10-03', 50]];
    for (let k = 0; k < week.length; k++) await putItem(done[k], { points: week[k][1], completedAt: `${week[k][0]}T19:00:00Z`, halo: done[k].data.halo ? { ...done[k].data.halo, submittedAt: `${week[k][0]}T19:00:00Z` } : null });
    await patchSettings(s.id, { reminders: { ...((await settingsOf(s.id)).reminders ?? {}), pushEnabled: true }, joy: { ...((await settingsOf(s.id)).joy ?? {}), wrapSeen: null } });
    const expected = 'Last week: 4 things turned in, 330 pts. Best week yet.';
    for (const [dev, scheme] of COMBOS) {
      const ctx = await browser.newContext({ ...DEV[dev], colorScheme: scheme });
      await ctx.clock.setFixedTime(new Date('2026-10-05T16:00:00Z')); // Monday 9:00 AM Phoenix
      // The browser's clock is moved; the server's is not. The session is told it lasts past the moved clock so the
      // app does not sign out (the token itself is still checked by the server, at the real time).
      const ses = { ...s.session, expires_at: Math.floor(Date.parse('2026-10-05T16:00:00Z') / 1000) + 3600 };
      await ctx.addInitScript(({ ses, key }) => { if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(ses)); }, { ses, key: `sb-${ref}-auth-token` });
      await ctx.route('**/functions/v1/report', (r) => r.fulfill({ status: 200, body: '{}' }));
      const p = await ctx.newPage();
      await p.goto(`${BASE}#/now`, { waitUntil: 'load' });
      await p.waitForSelector('.wrap-card', { timeout: 30000 }).catch(async () => {
        await p.screenshot({ path: `${OUT}/p5-debug.png` });
        console.log('     page:', (await p.locator('body').innerText()).replace(/\s+/g, ' ').slice(0, 300));
        throw new Error('no wrap card');
      });
      await p.waitForTimeout(800);
      const line = await p.locator('.wrap-line').innerText();
      if (dev === 'desk' && scheme === 'light') check(line === expected, `Monday on Now: "${line}"`);
      await p.screenshot({ path: `${OUT}/p5-monday-${dev}-${scheme}.png` });
      if (dev === 'phone' && scheme === 'dark') {
        await p.click('.wrap-card button:has-text("Nice")');
        await p.waitForTimeout(1500);
        check((await p.locator('.wrap-card').count()) === 0 && (await settingsOf(s.id)).joy?.wrapSeen === '2026-10-04', 'Nice waves it off for the week');
      }
      await ctx.close();
    }
    {
      // Sunday: the push says the same, planned for six.
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } });
      await ctx.clock.setFixedTime(new Date('2026-10-04T17:00:00Z')); // Sunday 10:00 AM Phoenix
      const ses = { ...s.session, expires_at: Math.floor(Date.parse('2026-10-04T17:00:00Z') / 1000) + 3600 };
      await ctx.addInitScript(({ ses, key }) => { if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(ses)); }, { ses, key: `sb-${ref}-auth-token` });
      await ctx.route('**/functions/v1/report', (r) => r.fulfill({ status: 200, body: '{}' }));
      const p = await ctx.newPage();
      await p.goto(`${BASE}#/now`, { waitUntil: 'load' });
      await p.waitForSelector('.now', { timeout: 30000 });
      await p.waitForTimeout(6000);
      const { data: plan } = await db.from('notification_plan').select('kind, body, send_at').eq('user_id', s.id).eq('kind', 'sunday');
      check(plan?.[0]?.body === 'This week: 4 things turned in, 330 pts. Best week yet.' && plan[0].send_at.startsWith('2026-10-05T01:00'), `the Sunday push: "${plan?.[0]?.body}" at ${plan?.[0]?.send_at}`);
      await ctx.close();
    }
  }
  // ---------------------------------------------------------------- PHASE 7
  if (PHASES.includes(7)) {
    console.log('— Phase 7: graded well, topic cleared, days early');
    const s = await kit.persona('max');
    {
      const { ctx, p } = await open(s, 'desk', 'light');
      await settle(p);
      await ctx.close();
    }
    const courses = await coursesOf(s.id);
    for (const [dev, scheme] of COMBOS) {
      // A topic of two: one already turned in, one open and due three days out. Checking the open one off clears it.
      const rows = (await itemsOf(s.id)).filter((r) => r.data.source === 'halo' && r.data.points > 0);
      const open1 = rows.find((r) => r.data.status !== 'done' && !r.data.halo?.submittedAt && r.data.score === null && r.data.type === 'homework') ?? rows.find((r) => r.data.status !== 'done' && r.data.score === null);
      const mate = rows.find((r) => r.id !== open1.id && r.data.courseId === open1.data.courseId);
      const due = new Date(Date.now() + 3 * 86_400_000 + 3_600_000).toISOString();
      await putItem(open1, { haloUnitId: 'u-e2e', topic: 'Topic 4', status: 'todo', completedAt: null, dueAt: due, snoozedUntil: null });
      await putItem(mate, { haloUnitId: 'u-e2e', topic: 'Topic 4', status: 'done', completedAt: new Date().toISOString() });
      // Everything else in that course leaves the topic.
      for (const r of rows) if (r.id !== open1.id && r.id !== mate.id && r.data.haloUnitId === 'u-e2e') await putItem(r, { haloUnitId: null });
      await patchSettings(s.id, { joy: { ...((await settingsOf(s.id)).joy ?? {}), topicSeen: [], pending: null } });
      const code = courses.find((c) => c.id === open1.data.courseId).data.code;
      const { ctx, p } = await open(s, dev, scheme, '#/calendar');
      await p.waitForSelector('.item-row', { timeout: 30000 });
      await p.waitForTimeout(3500);
      const row = p.locator('.item-row', { hasText: open1.data.label }).first();
      await row.scrollIntoViewIfNeeded();
      await row.locator('button.check').click();
      await p.waitForSelector('.time-ask-reward', { timeout: 6000 });
      const line = await p.locator('.time-ask-reward').innerText();
      await p.waitForSelector(`.joy-toast:has-text("Topic 4 cleared.")`, { timeout: 8000 }).catch(() => undefined);
      const toast = await p.locator('.joy-toast').innerText().catch(() => null);
      await p.waitForTimeout(600);
      await p.screenshot({ path: `${OUT}/p7-early-topic-${dev}-${scheme}.png` });
      if (dev === 'desk' && scheme === 'light') {
        check(new RegExp(`^\\+${open1.data.points} pts done, (2|3) days early · ${code} is \\d+% complete$`).test(line), `days early on the check-off: "${line}"`);
        check(toast === `${code} · Topic 4 cleared.`, `topic cleared: "${toast}"`);
        // Undo takes the topic back.
        if (await p.locator('.levelup').count()) { await p.locator('.levelup').click(); await p.waitForTimeout(400); }
        await p.locator('.time-ask button:has-text("undo")').click();
        await p.waitForTimeout(2500);
        check(!((await settingsOf(s.id)).joy?.topicSeen ?? []).includes(`${open1.data.courseId}|u-e2e`), 'unchecking takes the topic back');
      }
      await ctx.close();
    }
    // Graded well: what a sync found waits in settings.joy.pending (as store.applyHaloSync writes it).
    for (const [dev, scheme] of COMBOS) {
      await patchSettings(s.id, { joy: { ...((await settingsOf(s.id)).joy ?? {}), pending: { turnedIn: 0, gradeUps: [], graded: [{ id: 'x1', label: 'Lab 3: Stoichiometry', score: 47, points: 50 }], at: new Date().toISOString() } } });
      const { ctx, p } = await open(s, dev, scheme);
      await p.waitForSelector('.joy-toast', { timeout: 30000 });
      const t = await p.locator('.joy-toast').innerText();
      await p.waitForTimeout(600);
      await p.screenshot({ path: `${OUT}/p7-graded-${dev}-${scheme}.png` });
      if (dev === 'desk' && scheme === 'light') {
        check(t === 'Graded: 47/50 on Lab 3: Stoichiometry.', `graded well: "${t}"`);
        let left = 'waiting';
        for (let i = 0; i < 12 && left !== null; i++) { await p.waitForTimeout(1000); left = (await settingsOf(s.id)).joy?.pending ?? null; }
        check(left === null, `shown once, then cleared (${JSON.stringify(left)})`);
      }
      await ctx.close();
    }
  }
  // ---------------------------------------------------------------- PHASE 8 (round two)
  if (PHASES.includes(8)) {
    console.log('— Phase 8: week cleared, faster than planned, best day, the term, a new letter');
    const s = await kit.persona('max');
    {
      const { ctx, p } = await open(s, 'desk', 'light');
      await settle(p);
      await ctx.close();
    }
    const j0 = (await settingsOf(s.id)).joy ?? {};
    check(typeof j0.countSeen === 'number' && j0.weekSeen === undefined, `first look records the term count quietly (countSeen ${j0.countSeen}), nothing celebrated`);
    const tz = 'America/Phoenix';
    const day = (iso) => new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date(iso));
    const today = day(new Date().toISOString());
    const wd = new Date(`${today}T12:00:00Z`).getUTCDay(); // 0 Sunday
    const ws = (await settingsOf(s.id)).weekStartsOn ?? 0;
    const start = new Date(Date.parse(`${today}T12:00:00Z`) - ((wd - ws + 7) % 7) * 86_400_000).toISOString().slice(0, 10);
    const end = new Date(Date.parse(`${start}T12:00:00Z`) + 6 * 86_400_000).toISOString().slice(0, 10);
    if (today >= end) console.log('  (today is the last day of the week: week cleared is a clear day instead; skipped)');
    else {
      // This week: everything done except one thing due on the week's last day, planned at an hour.
      let rows = await itemsOf(s.id);
      const inWeek = rows.filter((r) => r.data.dueAt && day(r.data.dueAt) >= start && day(r.data.dueAt) <= end);
      const last = rows.find((r) => r.data.source === 'halo' && r.data.points > 0 && r.data.status !== 'done' && r.data.score === null && !r.data.halo?.submittedAt);
      for (const r of inWeek) if (r.id !== last.id) await putItem(r, { status: 'done', completedAt: new Date(Date.now() - 3_600_000).toISOString() });
      await putItem(last, { dueAt: `${end}T23:00:00-07:00`, status: 'todo', completedAt: null, estimatedMinutes: 60, estimateOverridden: true, snoozedUntil: null });
      // A best day: today one short of beating every earlier day, and the check-off below makes it.
      rows = await itemsOf(s.id);
      const per = new Map();
      for (const r of rows) { const at = r.data.halo?.submittedAt ?? (r.data.status === 'done' ? r.data.completedAt : null); if (at) per.set(day(at), (per.get(day(at)) ?? 0) + 1); }
      const best = Math.max(0, ...[...per].filter(([d]) => d < today).map(([, n]) => n));
      const need = Math.max(2, best) - (per.get(today) ?? 0);
      const spare = rows.filter((r) => r.id !== last.id && r.data.status !== 'done' && !(r.data.dueAt && day(r.data.dueAt) >= start && day(r.data.dueAt) <= end)).slice(0, Math.max(0, need));
      for (const r of spare) await putItem(r, { status: 'done', completedAt: new Date(Date.now() - 1_800_000).toISOString() });
      await patchSettings(s.id, { joy: { ...((await settingsOf(s.id)).joy ?? {}), weekSeen: null, bestDaySeen: null, clearDay: today } });
      const { ctx, p } = await open(s, 'desk', 'light', '#/calendar');
      await p.waitForSelector('.item-row', { timeout: 30000 });
      await p.waitForTimeout(4000);
      const seen = new Set();
      // A finished class's card can come first (it waits for Nice, as it does for a student).
      const watch = setInterval(async () => { const t = await p.locator('.joy-toast').innerText().catch(() => ''); if (t) seen.add(t.replace(/\s+/g, ' ').trim()); if (await p.locator('.joy-card').count().catch(() => 0)) { seen.add(`card: ${await p.locator('.joy-card-title').innerText().catch(() => '')}`); await p.locator('.joy-card button:has-text("Nice")').click().catch(() => undefined); } }, 150);
      const row = p.locator('.item-row', { hasText: last.data.label }).first();
      await row.scrollIntoViewIfNeeded();
      await row.locator('button.check').click();
      await p.waitForSelector('.time-ask', { timeout: 6000 });
      await p.waitForTimeout(600);
      if (await p.locator('.levelup').count()) { await p.locator('.levelup').click(); await p.waitForTimeout(400); }
      if (await p.locator('.joy-card').count()) await p.locator('.joy-card button:has-text("Nice")').click().catch(() => undefined);
      await p.locator('.time-ask button:has-text("30m")').click();
      for (let i = 0; i < 60 && !(seen.has('Faster than planned: 30m, planned 1h.') && [...seen].some((t) => t.startsWith('Week cleared.'))); i++) await p.waitForTimeout(250);
      await p.waitForSelector('.joy-toast', { timeout: 15000 }).catch(() => undefined);
      await p.screenshot({ path: `${OUT}/p8-round-two-desk-light.png` });
      for (let i = 0; i < 40; i++) await p.waitForTimeout(250);
      clearInterval(watch);
      const list = [...seen];
      check(list.some((t) => /^Week cleared\. Nothing else due until (Sunday|Monday)\.$/.test(t)), `week cleared: ${JSON.stringify(list.filter((t) => t.startsWith('Week')))}`);
      check(list.includes('Faster than planned: 30m, planned 1h.'), 'faster than planned after the time tap');
      check(list.filter((t) => /^Best day yet: \d+ things done today\.$/.test(t)).length === 1, `best day, once: ${JSON.stringify(list.filter((t) => t.startsWith('Best')))} (earlier best ${best})`);
      check(((await settingsOf(s.id)).joy?.weekSeen ?? null) === start, 'the week is recorded once');
      await ctx.close();
      // Taking it back: the week is open again, so it can be celebrated again.
      await putItem((await itemsOf(s.id)).find((r) => r.id === last.id), { status: 'todo', completedAt: null });
      const r2 = await open(s, 'desk', 'light', '#/calendar');
      await r2.p.waitForSelector('.item-row', { timeout: 30000 });
      await r2.p.waitForTimeout(6000);
      check(((await settingsOf(s.id)).joy?.weekSeen ?? null) === null, 'undoing the last one opens the week again');
      await r2.ctx.close();
    }
    // The term mark (a sync brought the count past one), and a grade up into a new letter: light and dark, desk and phone.
    for (const [dev, scheme] of COMBOS) {
      const n = (await itemsOf(s.id)).filter((r) => r.data.source === 'halo' && (r.data.halo?.submittedAt || r.data.score !== null || ['SUBMITTED', 'PUBLISHED'].includes(r.data.halo?.status))).length;
      const mark = [10, 25, 50, 100, 150, 200].reverse().find((m) => n >= m) ?? 0;
      const bio = (await coursesOf(s.id)).find((c) => c.data.code === 'BIO-181');
      await patchSettings(s.id, { joy: { ...((await settingsOf(s.id)).joy ?? {}), countSeen: 0, pending: { turnedIn: 0, gradeUps: [{ courseId: bio.id, code: 'BIO-181', percent: 93, letter: 'A' }], at: new Date().toISOString() } } });
      const { ctx, p } = await open(s, dev, scheme);
      const seen = new Set();
      for (let i = 0; i < 80 && seen.size < 2; i++) { const t = await p.locator('.joy-toast').innerText().catch(() => ''); if (t) seen.add(t.replace(/\s+/g, ' ').trim()); if (seen.size === 1 && i % 8 === 0) await p.screenshot({ path: `${OUT}/p8-letter-${dev}-${scheme}.png` }); await p.waitForTimeout(200); }
      if (dev === 'desk' && scheme === 'light') {
        check(seen.has('Your BIO-181 grade went up to 93%, now an A.'), `grade up into a new letter: ${JSON.stringify([...seen])}`);
        check(mark === 0 || seen.has(`${mark} things turned in this term.`), `the term mark: "${mark} things turned in this term."`);
      }
      await ctx.close();
    }
  }
} finally {
  await browser.close();
  console.log(`removed ${await kit.cleanup()} throwaways`);
}
console.log(checks.every(Boolean) ? 'PASS' : 'FAIL');
