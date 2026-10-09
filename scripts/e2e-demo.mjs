// Demo mode (George, 2026-10-08), on the real backend with a throwaway admin. Admin → Load the demo student reloads
// into Maya Torres's Now: tonight's discussion with the three parts from its announcement, "since you last looked",
// participation, the grade-up toast; Classes with Calculus in the red; the Quiz 2 post in Inbox. Then the wow
// moments: the ring on the announcement parts, a check-off with confetti and the class percent, the class cards, the
// Cooked meter, and Ask answering "how many words" from her data. All the while the admin's account on the server
// holds nothing of hers, and leaving the demo brings the admin's own (empty) planner back. Screens to
// docs/screens/demo/.
//   KEYS_ENV=... [BASE=http://localhost:4174/school-dashboard/] node scripts/e2e-demo.mjs
import { mkdirSync, readFileSync } from 'node:fs';
import { chromium } from 'playwright-core';
import { personaKit } from './lib/personas.mjs';

const env = Object.fromEntries(readFileSync(process.env.KEYS_ENV, 'utf8').split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]));
const BASE = process.env.BASE ?? 'http://localhost:4174/school-dashboard/';
const OUT = 'docs/screens/demo';
mkdirSync(OUT, { recursive: true });
const ref = new URL(env.VITE_SUPABASE_URL).hostname.split('.')[0];
const kit = personaKit(env);
const db = kit.db;
const checks = [];
const check = (ok, line) => { checks.push(ok); console.log(`${ok ? 'ok  ' : 'FAIL'} ${line}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms, step = 500) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const v = await fn(); if (v) return v; await sleep(step); } return null; };
const text = async (p, sel) => (await p.locator(sel).first().innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
const rows = async (table, id) => (await db.from(table).select('id', { count: 'exact', head: true }).eq('user_id', id)).count ?? 0;

const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const admin = await kit.persona('admin');
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 }, colorScheme: 'light' });
  await ctx.addInitScript(({ ses, key }) => { if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(ses)); }, { ses: admin.session, key: `sb-${ref}-auth-token` });
  await ctx.route('**/functions/v1/report', (r) => r.fulfill({ status: 200, body: '{}' }));
  const p = await ctx.newPage();
  await p.goto(`${BASE}#/admin`, { waitUntil: 'load' });
  await p.waitForSelector('[aria-label="Demo mode"]', { timeout: 30000 });
  check(/Load the demo student/.test(await text(p, '[aria-label="Demo mode"]')), 'Admin has Demo mode');
  await p.click('[aria-label="Demo mode"] button:has-text("Load the demo student")');
  await p.waitForSelector('.now-head', { timeout: 30000 });
  // The grade-up from the last sync plays on this open, as it would for a real student: watch for it from the start.
  const seen = new Set();
  await until(async () => { const t = (await text(p, '.joy-toast')) || (await text(p, '.joy-card')); if (t) seen.add(t); return /grade went up/.test(t); }, 12000, 200);
  check([...seen].some((t) => /BIO-181 grade went up to 91%, now an A-/.test(t)), `the grade-up from the last sync: ${JSON.stringify([...seen])}`);
  await sleep(1500);
  check((await p.locator('.demo-chip').count()) === 1 && /Maya Torres/.test(await text(p, '.demo-chip')), 'reloads into her Now with the Demo chip');
  for (const sel of ['.joy-card button:has-text("Nice")', '.levelup']) if (await p.locator(sel).count()) await p.locator(sel).first().click().catch(() => undefined);
  await sleep(500);
  const hero = await text(p, '.hero');
  check(/Topic 3 DQ 1: Memory/.test(hero) && /3 parts from announcements/.test(hero) && /250 words/.test(hero), 'the hero: tonight\'s discussion with the 3 parts from its announcement');
  check(/Since you last looked: 1 new assignment, 1 due date moved, 1 new grade/.test(await text(p, '.since-looked-line')), `"${await text(p, '.since-looked-line')}"`);
  check(/Participation this week: 2 left/.test(await text(p, '.pw-head')), `"${await text(p, '.pw-head')}"`);
  check(/Synced from Halo today .* via extension/.test(await text(p, '.synced')), `"${await text(p, '.synced')}"`);
  await p.screenshot({ path: `${OUT}/1-now.png` });
  await p.goto(`${BASE}#/classes`, { waitUntil: 'load' });
  await sleep(2500);
  check((await p.locator('[data-tour="cook-MAT-250"] .cook-btn[data-level="red"]').count()) === 1 && (await p.locator('.cook-btn[data-level="red"]').count()) === 1, 'Classes: Calculus alone is red on the Cooked meter');
  await p.screenshot({ path: `${OUT}/2-classes.png` });
  await p.goto(`${BASE}#/inbox`, { waitUntil: 'load' });
  await sleep(2500);
  check(/Quiz 2 moved to Thursday/.test(await text(p, 'main')), 'Inbox: the post that moved Quiz 2');
  await p.screenshot({ path: `${OUT}/3-inbox.png` });

  // The wow moments.
  await p.click('.demo-chip-btn');
  await p.waitForSelector('.demo-tour', { timeout: 10000 });
  await sleep(1200);
  check(/1 of 5/.test(await text(p, '.demo-tour')) && (await p.locator('[data-tour="reqs"].demo-ring').count()) === 1, 'step 1: back on Now, the announcement parts ringed');
  await p.screenshot({ path: `${OUT}/4-tour-1.png` });
  await p.click('.demo-tour button:has-text("Next")');
  await sleep(800);
  check(/2 of 5/.test(await text(p, '.demo-tour')) && (await p.locator('[data-tour="done"].demo-ring').count()) === 1, 'step 2: Done ringed, waiting for the presenter');
  await p.click('[data-tour="done"]');
  const done = await until(async () => ((await p.locator('.joy-toast, .time-ask, .joy-card').count()) ? (await text(p, '.joy-toast')) + ' ' + (await text(p, '.time-ask')) + ' ' + (await text(p, '.joy-card')) : null), 8000);
  check(!!done && /PSY-102 is \d+% complete/.test(done), `the check-off: "${(done ?? '').trim().slice(0, 100)}"`);
  await sleep(300);
  await p.screenshot({ path: `${OUT}/5-checkoff.png` });
  const moved = await until(async () => /3 of 5/.test(await text(p, '.demo-tour')), 8000);
  check(!!moved && /#\/classes/.test(p.url()), 'the tour moves to Classes by itself after the check-off');
  await sleep(1200);
  check((await p.locator('[data-tour="class-PSY-102"].demo-ring').count()) === 1, 'step 3: the PSY-102 card ringed');
  await p.click('.demo-tour button:has-text("Next")');
  await sleep(800);
  check(/4 of 5/.test(await text(p, '.demo-tour')) && (await p.locator('[data-tour="cook-MAT-250"].demo-ring').count()) === 1, 'step 4: the red Cooked meter ringed');
  await p.screenshot({ path: `${OUT}/6-tour-cook.png` });
  await p.click('.demo-tour button:has-text("Next")');
  await sleep(1500);
  check(/5 of 5/.test(await text(p, '.demo-tour')) && /#\/ask/.test(p.url()) && /How many words does the Case Study Analysis need/.test(await text(p, '.chat-msg[data-role="user"]')), 'step 5: Ask, with the question sent');
  const answer = await until(async () => { if (await p.locator('.chat-dots').count()) return null; const a = p.locator('.chat-msg[data-role="assistant"]'); return (await a.count()) ? (await a.last().innerText()).replace(/\s+/g, ' ').trim() : null; }, 60000, 1000);
  check(!!answer && /1,?200/.test(answer), `Ask answers from her data: "${(answer ?? '').slice(0, 140)}"`);
  await p.screenshot({ path: `${OUT}/7-ask.png` });

  // Nothing of hers on the server.
  // The throwaway admin has a seeded planner of its own (39 items, 3 posts); none of hers (ids demo-…) may join it.
  const hers = async (table) => (await db.from(table).select('id', { count: 'exact', head: true }).eq('user_id', admin.id).like('id', 'demo-%')).count ?? 0;
  const counts = { items: await hers('items'), courses: await hers('courses'), announcements: await hers('announcements'), read_ledger: (await db.from('read_ledger').select('post_id', { count: 'exact', head: true }).eq('user_id', admin.id).like('post_id', 'demo-%')).count ?? 0, notification_plan: await rows('notification_plan', admin.id) };
  check(Object.values(counts).every((n) => n === 0), `the admin's account holds none of hers: ${JSON.stringify(counts)}`);
  // Leaving brings the admin's own planner back.
  await p.click('.demo-chip-x');
  await p.waitForSelector('[aria-label="Demo mode"]', { timeout: 30000 });
  await sleep(2000);
  check((await p.locator('.demo-chip').count()) === 0 && (await p.evaluate(() => localStorage.getItem('school-dashboard:demo'))) === null, 'Leave: the chip and the flag are gone');
  await p.goto(`${BASE}#/classes`, { waitUntil: 'load' });
  await sleep(2500);
  await p.goto(`${BASE}#/class?c=demo-course-MAT-250`, { waitUntil: 'load' });
  await sleep(1500);
  check(!/Project 1: Related Rates|Maya/.test(await text(p, 'main')) && (await p.evaluate(() => localStorage.getItem('school-dashboard:v1:demo'))) === null, "the admin's own planner is back, hers gone from this device");
  await ctx.close();
} finally {
  await browser.close();
  console.log(`removed ${await kit.cleanup()} throwaways`);
}
console.log(checks.every(Boolean) ? 'PASS' : 'FAIL');
