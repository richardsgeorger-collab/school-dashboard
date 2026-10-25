// Day-by-day participation on Now (George, 2026-10-08: "Chem Participation W5 Day 1" was a Late hero card and "Day 2"
// sat in Then). In CHM-113 Halo publishes each day's participation as a 0-point DISCUSSION_QUESTION with a dropbox, so
// it synced as a discussion and only Halo's PARTICIPATION type was kept off Now. On the real backend with a throwaway
// Max account seeded the same way: a late Day 1, a Day 2 due tomorrow morning, and a real discussion whose
// instructions only mention participation. Participation is never the hero or in Then; it lives in "Participation
// this week" (2026-10-24: "1 missed", grey: participation is never overdue or urgent anywhere), can be ticked there,
// and still shows on Calendar and the class page, never as Late; on Classes its card has no "Behind", no "overdue"
// and its Next is never the missed day.
//   KEYS_ENV=... [BASE=http://localhost:4174/school-dashboard/] [BEFORE=1] node scripts/e2e-participation-now.mjs
// BEFORE=1 only takes the screenshot (for the build before the fix).
import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync } from 'node:fs';
import { chromium } from 'playwright-core';
import { personaKit } from './lib/personas.mjs';

const env = Object.fromEntries(readFileSync(process.env.KEYS_ENV, 'utf8').split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]));
const BASE = process.env.BASE ?? 'http://localhost:4174/school-dashboard/';
const BEFORE = process.env.BEFORE === '1';
const OUT = 'docs/screens/participation-now';
mkdirSync(OUT, { recursive: true });
const ref = new URL(env.VITE_SUPABASE_URL).hostname.split('.')[0];
const kit = personaKit(env);
const db = kit.db;
const checks = [];
const check = (ok, line) => { checks.push(ok); console.log(`${ok ? 'ok  ' : 'FAIL'} ${line}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const text = async (p, sel) => (await p.locator(sel).first().innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
// Phoenix wall time, n days from today, as Halo sends it.
const at = (n, hm) => {
  const d = new Date(Date.now() - 7 * 3_600_000 + n * 864e5).toISOString().slice(0, 10);
  return `${d}T${hm}:00-07:00`;
};

const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const s = await kit.persona('max');
  const chm = s.courseIds['CHM-113'] ?? Object.values(s.courseIds)[0];
  const iso = new Date().toISOString();
  const day = (title, label, dueAt, extra = {}) => {
    const id = randomUUID();
    return { id, user_id: s.id, updated_at: iso, data: { id, courseId: chm, title, label, labelOverridden: false, type: 'discussion', haloType: 'DISCUSSION_QUESTION', points: 0, opensAt: null, dueAt, estimatedMinutes: 30, estimateOverridden: false, startByOverride: null, status: 'todo', completedAt: null, score: null, notes: '', topic: null, flags: { inClass: false, group: false, lopesWrite: false, timed: false, practice: false }, source: 'halo', haloId: `aud-part-${id.slice(0, 8)}`, award: null, updatedAt: iso, ...extra } };
  };
  const rows = [
    day('Week 5, Day 1 Participation', 'Chem Participation W5 Day 1', at(-1, '23:59'), { halo: { status: 'OVERDUE', submittedAt: null, checkedAt: iso } }),
    day('Week 5 Day 2 participation', 'Chem Participation W5 Day 2', at(1, '09:00')),
    // A real assignment that only mentions participation in its instructions: still work.
    day('Summary of Current Course Content Knowledge', 'Summary of Course Knowledge', at(1, '08:00'), { points: 20, haloType: 'DISCUSSION_QUESTION', notes: 'Your reply counts toward participation this week.' }),
  ];
  await db.from('items').insert(rows);
  const [d1, d2, real] = rows.map((r) => r.data);

  const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 }, colorScheme: 'light' });
  await ctx.addInitScript(({ ses, key }) => { if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(ses)); }, { ses: s.session, key: `sb-${ref}-auth-token` });
  await ctx.route('**/functions/v1/**', (r) => r.fulfill({ status: 200, body: '{}' }));
  const p = await ctx.newPage();
  await p.goto(`${BASE}#/now`, { waitUntil: 'load' });
  await p.waitForSelector('.now-head', { timeout: 30000 });
  await sleep(4000);
  for (const sel of ['.joy-card button:has-text("Nice")', '.levelup']) if (await p.locator(sel).count()) await p.locator(sel).first().click().catch(() => undefined);
  await sleep(600);
  await p.screenshot({ path: `${OUT}/${BEFORE ? 'before' : 'after'}-now-desk.png` });
  const hero = await text(p, '.hero, .now-hero, [aria-label="Next up"]');
  const then = await text(p, '.then');
  console.log(`hero: ${hero.slice(0, 80)}\nthen: ${then.slice(0, 200)}`);
  if (BEFORE) {
    console.log(/Participation/i.test(`${hero} ${then}`) ? 'BEFORE: participation is on Now (the bug)' : 'BEFORE: participation not on Now');
  } else {
    check(!/Participation/i.test(hero), `the hero is real work: "${hero.slice(0, 60)}"`);
    check(!/Participation/i.test(then), 'Then has no participation');
    check(/Summary of Course Knowledge/.test(`${hero} ${then}`), 'a real assignment that only mentions participation in its instructions stays on Now');
    const head = await text(p, '.pw-head');
    const late = p.locator('.pw-head .pw-late');
    const color = await late.evaluate((e) => getComputedStyle(e).color).catch(() => '');
    const [r, g, b] = (color.match(/\d+/g) ?? ['0', '0', '0']).map(Number);
    check(/Participation this week: .*left/.test(head) && (await text(p, '.pw-head .pw-late')) === '1 missed' && Math.max(r, g, b) - Math.min(r, g, b) < 40, `the participation line: "${head}" ("1 missed", grey: ${color})`);
    await p.click('.pw-head');
    await sleep(500);
    const body = await text(p, '.pw-body');
    check(/Chem Participation W5 Day 1/.test(body) && /missed/.test(body) && /Chem Participation W5 Day 2/.test(body), `open: both days listed, Day 1 marked missed ("${body.slice(0, 160)}")`);
    await p.screenshot({ path: 'docs/screens/participation-now/after-line-open-desk.png' });
    // Tick Day 2 from the line, then untick it.
    await p.locator('.pw-day', { hasText: 'W5 Day 2' }).locator('input[type="checkbox"]').check();
    await sleep(2500);
    const ticked = (await db.from('items').select('data').eq('id', d2.id).single()).data.data.status;
    check(ticked === 'done', `ticked from the line: Day 2 is done (${ticked})`);
    await p.locator('.pw-day', { hasText: 'W5 Day 2' }).locator('input[type="checkbox"]').uncheck();
    await sleep(2500);
    check((await db.from('items').select('data').eq('id', d2.id).single()).data.data.status === 'todo', 'and unticked: open again');
    // Calendar and the class page still show them.
    await p.goto(`${BASE}#/calendar`, { waitUntil: 'load' });
    await sleep(3000);
    const cal = await text(p, 'main');
    check(/Participation W5 Day 2|Day 2 participation/i.test(cal), 'Calendar still shows Day 2');
    const lateGroup = await text(p, '.day-group-head[data-tone="late"]');
    check(!/Late/.test(lateGroup) || !(await text(p, '.agenda')).match(/Late[\s\S]*Participation W5 Day 1/), `Calendar: the missed day is never under Late ("${lateGroup}")`);
    // Classes: the card for its class says nothing is late (George's CHM-113: "Next: … Day 1 · 3 days late", "Behind: 1 overdue").
    await p.goto(`${BASE}#/classes`, { waitUntil: 'load' });
    await sleep(2500);
    const card = await text(p, `.class-card:has-text("CHM-113")`);
    check(!/overdue|late|Behind/i.test(card) && !/Next: Chem Participation W5 Day 1/.test(card), `Classes: the CHM-113 card has no overdue, no late Next ("${card.slice(0, 160)}")`);
    await p.goto(`${BASE}#/class?c=${chm}`, { waitUntil: 'load' });
    await sleep(3000);
    const cls = await text(p, 'main');
    check(/Participation W5 Day 1/.test(cls) && /Participation W5 Day 2/.test(cls), 'the class page still shows both days');
    const day1Row = await text(p, '.item-row:has-text("Participation W5 Day 1"), li:has-text("Participation W5 Day 1")');
    check(!/\bLate\b|overdue/i.test(day1Row), `the class page: Day 1 is not marked Late ("${day1Row.slice(0, 120)}")`);
    void real;
    void d1;
  }
  await ctx.close();
} finally {
  await browser.close();
  console.log(`removed ${await kit.cleanup()} throwaways`);
}
if (!BEFORE) console.log(checks.every(Boolean) ? 'PASS' : 'FAIL');
