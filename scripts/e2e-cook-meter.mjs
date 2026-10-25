// The Cooked meter on a class card (George, 2026-10-24: CHM-113 "says On pace but its Cooked meter is still nearly full
// and red"). His week, read only: Exam 1 Friday (~7h of study, 150 pts), Week 7 Participation due tomorrow, Week 8 Day 1
// Participation, and the missed Week 7 Day 1 post. Participation filled ~0.8h of it and was the "1 due in the next 48
// hours"; the red is the exam. On the real backend with a throwaway Max account seeded the same way (its own open
// CHM-113 work cleared first, so the meter is only this): the meter never counts participation, stays red for the
// exam and says so under the bar ("· Exam 1, Fri"), on the card and the class page; the card is not "Behind".
//   KEYS_ENV=... [BASE=http://localhost:4174/school-dashboard/] [BEFORE=1] node scripts/e2e-cook-meter.mjs
// BEFORE=1 prints what the build shows and takes the screenshot (for the build before the fix).
import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync } from 'node:fs';
import { chromium } from 'playwright-core';
import { personaKit } from './lib/personas.mjs';

const env = Object.fromEntries(readFileSync(process.env.KEYS_ENV, 'utf8').split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]));
const BASE = process.env.BASE ?? 'http://localhost:4174/school-dashboard/';
const BEFORE = process.env.BEFORE === '1';
const OUT = 'docs/screens/cook-meter';
mkdirSync(OUT, { recursive: true });
const ref = new URL(env.VITE_SUPABASE_URL).hostname.split('.')[0];
const kit = personaKit(env);
const db = kit.db;
const checks = [];
const check = (ok, line) => { checks.push(ok); console.log(`${ok ? 'ok  ' : 'FAIL'} ${line}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// Phoenix wall time, n days from today, as Halo sends it.
const ymd = (n) => new Date(Date.now() - 7 * 3_600_000 + n * 864e5).toISOString().slice(0, 10);
const at = (n, hm) => `${ymd(n)}T${hm}:00-07:00`;
const examDay = new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: 'America/Phoenix' }).format(new Date(`${ymd(6)}T12:00:00-07:00`));

const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const s = await kit.persona('max');
  // The throwaway's first class, renamed CHM-113 (its own row) so the card reads like his.
  const chm = Object.values(s.courseIds)[0];
  const { data: row } = await db.from('courses').select('data').eq('user_id', s.id).eq('id', chm).single();
  await db.from('courses').update({ data: { ...row.data, code: 'CHM-113', name: 'General Chemistry I', updatedAt: new Date().toISOString() }, updated_at: new Date().toISOString() }).eq('user_id', s.id).eq('id', chm);
  const { data: mine } = await db.from('items').select('id, data').eq('user_id', s.id);
  const open = mine.filter((r) => r.data.courseId === chm && r.data.status !== 'done').map((r) => r.id);
  if (open.length) await db.from('items').delete().eq('user_id', s.id).in('id', open);
  const iso = new Date().toISOString();
  const item = (title, label, type, haloType, points, dueAt, minutes, extra = {}) => {
    const id = randomUUID();
    return { id, user_id: s.id, updated_at: iso, data: { id, courseId: chm, title, label, labelOverridden: false, type, haloType, points, opensAt: null, dueAt, estimatedMinutes: minutes, estimateOverridden: false, startByOverride: null, status: 'todo', completedAt: null, score: null, notes: '', topic: null, flags: { inClass: type === 'exam', group: false, lopesWrite: false, timed: false, practice: false }, source: 'halo', haloId: `aud-cook-${id.slice(0, 8)}`, award: null, updatedAt: iso, ...extra } };
  };
  await db.from('items').insert([
    item('Exam 1', 'Chem Exam 1', 'exam', 'ASSIGNMENT', 150, at(6, '23:59'), 420, { haloInPerson: true, halo: { status: 'UPCOMING', submittedAt: null, checkedAt: iso } }),
    item('Week 7 Participation', 'Chem Participation W7', 'participation', 'PARTICIPATION', 10, at(1, '23:59'), 20, { requirements: [{ id: 'r1', text: 'Attend class and take part', scope: 'requirement' }], halo: { status: 'ACTIVE', submittedAt: null, checkedAt: iso } }),
    item('Week 8, Day 1 Participation', 'Chem Participation W8 Day 1', 'discussion', 'DISCUSSION_QUESTION', 0, at(4, '23:59'), 25, { halo: { status: 'UPCOMING', submittedAt: null, checkedAt: iso } }),
    item('Week 7, Day 1 Participation', 'Chem Participation W7 Day 1', 'discussion', 'DISCUSSION_QUESTION', 0, at(-3, '23:59'), 25, { halo: { status: 'LATE', submittedAt: null, checkedAt: iso } }),
  ]);

  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, colorScheme: 'light', reducedMotion: 'reduce' });
  await ctx.addInitScript(({ ses, key }) => { if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(ses)); }, { ses: s.session, key: `sb-${ref}-auth-token` });
  await ctx.route('**/functions/v1/**', (r) => r.fulfill({ status: 200, body: '{}' }));
  const p = await ctx.newPage();
  await p.goto(`${BASE}#/classes`, { waitUntil: 'load' });
  await p.waitForSelector('.class-card', { timeout: 30000 });
  await sleep(3500);
  for (const sel of ['.joy-card button:has-text("Nice")', '.levelup']) if (await p.locator(sel).count()) await p.locator(sel).first().click().catch(() => undefined);
  await sleep(500);
  const wrap = p.locator('.class-card-wrap', { hasText: 'CHM-113' }).first();
  const card = (await wrap.locator('.class-card').innerText()).replace(/\s+/g, ' ');
  const meter = wrap.locator('.cook-btn');
  const level = await meter.getAttribute('data-level');
  const aria = await meter.getAttribute('aria-label');
  const label = (await meter.innerText()).replace(/\s+/g, ' ').trim();
  console.log(`card: ${card.slice(0, 200)}\nmeter: ${level} | ${label} | ${aria}`);
  await wrap.scrollIntoViewIfNeeded();
  await wrap.screenshot({ path: `${OUT}/${BEFORE ? 'before' : 'after'}-card.png` });
  await meter.click();
  await sleep(300);
  await wrap.screenshot({ path: `${OUT}/${BEFORE ? 'before' : 'after'}-card-why.png` });
  if (!BEFORE) {
    check(!/Behind|overdue/i.test(card), `the card is not behind ("${card.slice(0, 140)}")`);
    check(level === 'red', `the meter is red for the exam (${level})`);
    check(label === `Cooked meter · Exam 1, ${examDay}`, `under the bar it says what fills it: "${label}"`);
    check(aria === `Cooked meter, red: Study for Exam 1 (${examDay}): ~7h this week.`, `its reason is the exam alone: "${aria}"`);
    check(!/participation|48 hours/i.test(aria), 'participation is not in it, and nothing is "due in the next 48 hours"');
    const box = await wrap.locator('.cook-label').boundingBox();
    const cardBox = await wrap.boundingBox();
    check(box && cardBox && box.x >= cardBox.x && box.x + box.width <= cardBox.x + cardBox.width, 'the line fits inside the card');
    // Phone width: still on one line inside the card.
    await p.setViewportSize({ width: 390, height: 844 });
    await sleep(600);
    const pb = await wrap.locator('.cook-label').boundingBox();
    const pc = await wrap.boundingBox();
    check(pb && pc && pb.x >= pc.x && pb.x + pb.width <= pc.x + pc.width && pb.height < 16, `phone: inside the card, one line (${Math.round(pb?.width ?? 0)}x${Math.round(pb?.height ?? 0)})`);
    await wrap.screenshot({ path: `${OUT}/after-card-phone.png` });
    await p.setViewportSize({ width: 1280, height: 900 });
    // The class page's meter says the same.
    await p.goto(`${BASE}#/class?c=${chm}`, { waitUntil: 'load' });
    await sleep(3000);
    const page = (await p.locator('.cook[data-size="page"] .cook-btn').first().innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
    check(page === `Cooked meter · the next 7 days · Exam 1, ${examDay}`, `the class page: "${page}"`);
  }
  await ctx.close();
} catch (e) {
  checks.push(false);
  console.log('ERROR', e.stack ?? e.message);
} finally {
  await browser.close();
  console.log(`removed ${await kit.cleanup()} throwaways`);
}
if (!BEFORE) console.log(checks.length && checks.every(Boolean) ? 'PASS' : 'FAIL');
process.exit(BEFORE || (checks.length && checks.every(Boolean)) ? 0 : 1);
