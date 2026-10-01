// A brand-new GCU student's first five minutes, through the real screens (2026-09-30): the landing page, the Start
// button, signing up with an email and password, the fifteen seconds, the gift, connecting Halo, the first sync, the
// payoff, the morning-note question, the tour, the Max welcome, and Now. Desktop, phone and iPad, light and dark. Every
// step is screenshotted to docs/screens/first-five/<device>-<scheme>/ and timed; the account is deleted after.
//   KEYS_ENV=... BASE=http://localhost:4174/school-dashboard/ [ONLY=desk-light] node scripts/e2e-first-five.mjs
import { mkdirSync, readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { chromium, devices } from 'playwright-core';
import { currentBuild } from './lib/build.mjs';
import { fillSignIn } from './lib/signin.mjs';
const env = Object.fromEntries(readFileSync(process.env.KEYS_ENV, 'utf8').split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]));
const BASE = process.env.BASE ?? 'http://localhost:4174/school-dashboard/';
const BUILD = await currentBuild(BASE);
const ONLY = process.env.ONLY?.split(',');
const admin = createClient(env.VITE_SUPABASE_URL, env.SERVICE_ROLE, { auth: { persistSession: false } });
const made = [];
const log = [];
const day = (n) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10) + 'T06:59:00.000Z';
const A = (id, title, n, points, type = 'ASSIGNMENT') => ({ id, title, dueDate: day(n), points, type, status: null, score: null, description: '' });
const cls = (id, code, section, name, modality, as, ann = []) => ({ id, slugId: `${code}-${section}-20260908`, classCode: `${code}-${section}`, courseCode: code, name, instructors: ['Dr. Example'], startDate: '2026-09-08', endDate: '2026-12-20', stage: 'CURRENT', modality, credits: 3, finalGrade: null, assessments: as, announcements: ann, resources: [], discussions: [], messages: [] });
const payload = () => ({ kind: 'halo-export', version: 1, build: BUILD, exportedAt: new Date().toISOString(), source: 'bookmarklet', alerts: [], problems: [], pulls: ['assessments', 'grades', 'announcements'], classes: [
  cls('f-chm', 'CHM-113', 'WF700A', 'General Chemistry I-Lecture', 'ONGROUND', [A('f1', 'Topic 1 Homework', 2, 20), A('f2', 'Quiz 1', 5, 50, 'QUIZ')], [{ id: 'fp1', forumId: 'ff1', title: 'Week 1', content: '<p>Bring goggles to lab Thursday and submit the safety waiver before lab.</p>', publishedAt: new Date(Date.now() - 86_400_000).toISOString(), modifiedAt: null, author: 'Dr. Example', mustAcknowledge: false, acknowledged: false, resources: [] }]),
  cls('f-chml', 'CHM-113L', 'M600A', 'General Chemistry I-Lab', 'ONGROUND', [A('f3', 'Chemical Safety and Equipment', 3, 50)]),
  cls('f-eng', 'ENG-105', 'ONL4', 'English Composition I', 'ONLINE', [A('f4', 'Topic 1 DQ 1', 1, 10, 'DISCUSSION_QUESTION'), A('f5', 'Topic 1 Participation', 6, 5, 'PARTICIPATION')]),
  cls('f-unv', 'UNV-106', 'TOENGN05', 'University On-Campus Success', 'TRADONLINE', [A('f6', 'Academic Integrity Quiz', 4, 10, 'QUIZ')]),
] });
const IPAD_SAFARI = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15';
const DEVICES = {
  desk: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 },
  phone: { ...devices['iPhone 14'], deviceScaleFactor: 2 },
  ipad: { ...devices['iPad Pro 11'], userAgent: IPAD_SAFARI, viewport: { width: 834, height: 1194 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true },
};
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const run = async (device, scheme) => {
  const OUT = `docs/screens/first-five/${device}-${scheme}`;
  mkdirSync(OUT, { recursive: true });
  const ctx = await browser.newContext({ ...DEVICES[device], colorScheme: scheme, reducedMotion: 'reduce' });
  if (device === 'ipad') await ctx.addInitScript(() => { Object.defineProperty(navigator, 'maxTouchPoints', { get: () => 5 }); Object.defineProperty(navigator, 'platform', { get: () => 'MacIntel' }); });
  await ctx.addInitScript(() => { window.open = () => null; localStorage.setItem('school-dashboard:onboard-wait-ms', '2500'); });
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message.slice(0, 160)));
  p.on('console', (m) => m.type() === 'error' && !/favicon|ERR_|net::/.test(m.text()) && errors.push(m.text().slice(0, 160)));
  let n = 0;
  const t0 = Date.now();
  const shot = async (label, full = false) => { n++; await p.waitForTimeout(500); await p.screenshot({ path: `${OUT}/${String(n).padStart(2, '0')}-${label}.png`, fullPage: full }); log.push(`${device}-${scheme} ${label} @${Math.round((Date.now() - t0) / 1000)}s`); };
  const tap = (sel, ms = 900) => p.click(sel, { timeout: 5000 }).then(() => p.waitForTimeout(ms)).then(() => true).catch(() => false);
  await p.goto(BASE, { waitUntil: 'load' });
  await p.waitForTimeout(1500);
  await shot('landing-top');
  await shot('landing-full', true);
  if (!(await tap('.landing a.btn.primary[href="#/start"]', 1500))) await p.goto(`${BASE}#/start`);
  await p.waitForTimeout(1200);
  await shot('after-start');
  await tap('.onboard button:has-text("Start")', 1000);
  await shot('account-step');
  // Sign up with a password: the form a new student meets.
  await tap('button:has-text("Create an account"), button:has-text("Sign up"), button:has-text("create one")', 600);
  const email = `e2e-five-${device}-${scheme}-${Date.now()}@example.invalid`;
  await fillSignIn(p, email, 'Halo-plus-2026!').catch(() => undefined);
  await shot('signup-filled');
  await tap('form button[type=submit]', 3500);
  const { data: list } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const u = list.users.find((x) => x.email === email);
  if (u) made.push(u.id);
  await shot('after-signup');
  await p.waitForSelector('.story', { timeout: 10000 }).catch(() => undefined);
  await shot('story');
  await tap('.story-skip', 1500);
  await shot('gift');
  await tap('.gift .offer-go', 1500);
  await shot('connect-1');
  if (device === 'desk') {
    await tap('.bar-already');
    await shot('connect-drag');
    await tap('button:has-text("It\'s in my bookmarks bar")');
    await shot('connect-open');
    await tap('.onboard button:has-text("Open Halo")', 1200);
    await shot('connect-wait');
  }
  await p.evaluate((pl) => window.dispatchEvent(new MessageEvent('message', { origin: 'https://halo.gcu.edu', data: pl, source: window })), payload());
  await p.waitForSelector('.onboard-payoff', { timeout: 20000 }).catch(() => undefined);
  await p.waitForTimeout(3000);
  await shot('payoff');
  await tap('.onboard button:has-text("Start here")', 1200);
  await shot('notify-ask');
  await tap('.comeback button:has-text("Not now")', 1000);
  if (device !== 'desk') { await shot('home-screen'); await tap('.comeback .onboard-big', 1000); }
  await shot('tour-1');
  for (let k = 0; k < 4; k++) { if (!(await tap('.tour-tip button:has-text("Next")', 700))) break; await shot(`tour-${k + 2}`); }
  await tap('.tour-tip button:has-text("Done"), .tour-tip button:has-text("Got it"), .tour-tip button:has-text("Skip")', 900);
  await p.waitForTimeout(1500);
  await shot('after-tour');
  log.push(`${device}-${scheme} CHECK after the tour: ${(await p.$('.upgrade')) ? 'FAIL a Welcome-to-Max sequence still shows' : 'ok straight to Now'}`);
  for (let k = 0; k < 4; k++) { if (!(await tap('.upgrade .btn.primary', 900))) break; await shot(`upgrade-${k + 2}`); }
  await p.waitForTimeout(2000);
  await shot('now', device !== 'desk');
  for (const r of ['calendar', 'study', 'classes', 'inbox', 'you']) { await p.goto(`${BASE}#/${r}`); await p.waitForTimeout(2200); await shot(r, device !== 'desk'); }
  log.push(`${device}-${scheme} errors: ${JSON.stringify([...new Set(errors)].slice(0, 6))}`);
  await ctx.close();
};
try {
  for (const device of Object.keys(DEVICES)) for (const scheme of ['light', 'dark']) if (!ONLY || ONLY.includes(`${device}-${scheme}`)) await run(device, scheme);
} finally {
  await browser.close();
  for (const id of made) {
    for (const t of ['reward_grants', 'courses', 'items', 'settings', 'announcements', 'read_ledger', 'usage_log', 'usage_events', 'onboarding_events', 'notification_plan', 'notification_prefs']) await admin.from(t).delete().eq('user_id', id);
    await admin.auth.admin.deleteUser(id);
  }
  console.log(log.join('\n'));
  console.log(`removed ${made.length} throwaways`);
}
