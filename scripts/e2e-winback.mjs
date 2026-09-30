// Win-back (2026-09-29), on the real backend: a throwaway student on Free a week after their Max week ended, with a
// quiz 4 days out as of a sync 8 days ago. The frozen banner invites a peek; Sync shows what Halo has (counts only,
// nothing applied); the exam-week card on Now; the exam push and the out-of-date push as the planner writes them;
// the log a sent push leaves; the push opening the peek; one a week; none after three ignored; none once a referral
// starts; the Admin numbers. Screens in light and dark to docs/screens/winback/.
//   KEYS_ENV=... BASE=http://localhost:4174/school-dashboard/ node scripts/e2e-winback.mjs
import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { chromium, devices } from 'playwright-core';
import { currentBuild } from './lib/build.mjs';
const env = Object.fromEntries(readFileSync(process.env.KEYS_ENV, 'utf8').split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]));
const BASE = process.env.BASE ?? 'http://localhost:4174/school-dashboard/';
const BUILD = await currentBuild(BASE);
const ref = new URL(env.VITE_SUPABASE_URL).hostname.split('.')[0];
const admin = createClient(env.VITE_SUPABASE_URL, env.SERVICE_ROLE, { auth: { persistSession: false } });
const OUT = 'docs/screens/winback';
mkdirSync(OUT, { recursive: true });
const DAY = 86_400_000;
const made = [];
const checks = [];
const check = (ok, line) => { checks.push(ok); console.log(`${ok ? 'ok  ' : 'FAIL'} ${line}`); };
const newUser = async () => {
  const email = `e2e-winback-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@example.invalid`;
  const { data } = await admin.auth.admin.createUser({ email, email_confirm: true });
  made.push(data.user.id);
  const { data: link } = await admin.auth.admin.generateLink({ type: 'magiclink', email });
  const c = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data: s } = await c.auth.verifyOtp({ token_hash: link.properties.hashed_token, type: 'magiclink' });
  return { id: data.user.id, session: s.session };
};
// Phoenix dates: 11:59 PM local is 06:59 UTC the next day.
const localDay = (n) => new Date(Date.now() - 7 * 3_600_000 + n * DAY).toISOString().slice(0, 10);
const dueLocal = (n) => `${localDay(n)}T23:59:00-07:00`;
const lastPullAt = new Date(Date.now() - 8 * DAY).toISOString();
const quizDay = new Date(`${localDay(4)}T12:00:00-07:00`).toLocaleDateString('en-US', { weekday: 'long', timeZone: 'America/Phoenix' });

const seed = async (u, { quiz = true } = {}) => {
  await admin.from('profiles').update({ tier: 'free', trial_started_at: new Date(Date.now() - 14 * DAY).toISOString(), trial_ends_at: new Date(Date.now() - 7 * DAY).toISOString() }).eq('user_id', u.id);
  const courseId = randomUUID();
  const now = new Date().toISOString();
  const course = { id: courseId, code: 'CHM-113', name: 'General Chemistry I', color: '#2E7D6B', credits: 3, instructors: [], meetings: [], online: false, termStart: '2026-09-01', termEnd: '2026-12-15', haloClassId: 'hc-chm', updatedAt: now };
  const item = (title, n, type, points, haloId) => ({ id: randomUUID(), courseId, title, label: title, labelOverridden: false, type, points, opensAt: null, dueAt: dueLocal(n), estimatedMinutes: 60, estimateOverridden: false, startByOverride: null, status: 'todo', completedAt: null, score: null, notes: '', topic: null, flags: { inClass: false, group: false, lopesWrite: false, timed: false, practice: false }, source: 'halo', haloId, award: null, updatedAt: now });
  const items = [item('Topic 3 Homework', 2, 'homework', 20, 'a1'), item('Lab 4: Titration Report', 9, 'assignment', 75, 'a2')];
  if (quiz) items.push(item('Chem Quiz 2', 4, 'quiz', 50, 'a3'));
  await admin.from('courses').insert({ id: courseId, user_id: u.id, data: course, updated_at: now });
  await admin.from('items').insert(items.map((i) => ({ id: i.id, user_id: u.id, data: i, updated_at: now })));
  await admin.from('settings').upsert({ user_id: u.id, updated_at: now, data: settingsOf() });
};
const settingsOf = () => ({ timezone: 'America/Phoenix', lastPull: { at: lastPullAt, source: 'bookmarklet' }, onboarding: { startedAt: 'x', step: 'done', doneAt: lastPullAt, skippedAt: null, tourDoneAt: 'x' }, upgradeSeen: { plus: 'x', max: 'x' }, trialEndSeen: 'x', reminders: { pushEnabled: true, morningTime: '07:30', quietFrom: '22:00', quietTo: '07:00' } });
// What Halo has now: the quiz moved a day, two new assignments, one announcement asking for work, one that does not.
const payload = () => ({ kind: 'halo-export', version: 1, build: BUILD, exportedAt: new Date().toISOString(), source: 'bookmarklet', alerts: [], problems: [], pulls: ['assessments', 'grades', 'announcements'],
  classes: [{ id: 'hc-chm', slugId: 'chm', classCode: 'CHM-113-O500', courseCode: 'CHM-113', name: 'General Chemistry I', instructors: ['Dr. Awad'], startDate: '2026-09-01', endDate: '2026-12-15', stage: 'CURRENT', modality: 'ONGROUND', credits: 3,
    assessments: [
      { id: 'a1', title: 'Topic 3 Homework', dueDate: new Date(dueLocal(2)).toISOString(), points: 20, type: 'ASSIGNMENT', status: null, score: null, description: '' },
      { id: 'a2', title: 'Lab 4: Titration Report', dueDate: new Date(dueLocal(9)).toISOString(), points: 75, type: 'ASSIGNMENT', status: null, score: null, description: '' },
      { id: 'a3', title: 'Chem Quiz 2', dueDate: new Date(dueLocal(5)).toISOString(), points: 50, type: 'QUIZ', status: null, score: null, description: '' },
      { id: 'a4', title: 'Topic 4 Homework', dueDate: new Date(dueLocal(6)).toISOString(), points: 20, type: 'ASSIGNMENT', status: null, score: null, description: '' },
      { id: 'a5', title: 'Topic 4 Discussion', dueDate: new Date(dueLocal(7)).toISOString(), points: 10, type: 'ASSIGNMENT', status: null, score: null, description: '' },
    ],
    announcements: [
      { id: 'p1', forumId: 'f1', title: 'Quiz moved', content: '<p>Quiz 2 moved to next week. Bring a calculator.</p>', publishedAt: new Date(Date.now() - DAY).toISOString(), modifiedAt: null, author: 'Dr. Awad', mustAcknowledge: false, acknowledged: false, resources: [] },
      { id: 'p2', forumId: 'f1', title: 'Nice work', content: '<p>Great week, everyone.</p>', publishedAt: new Date(Date.now() - DAY).toISOString(), modifiedAt: null, author: 'Dr. Awad', mustAcknowledge: false, acknowledged: false, resources: [] },
    ],
    resources: [], discussions: [], messages: [] }] });

const planned = async (id) => (await admin.from('notification_plan').select('kind, send_at, body, url, sent_at').eq('user_id', id).like('kind', 'winback%')).data ?? [];
const until = async (fn, ms = 15000) => { const end = Date.now() + ms; let v; while (Date.now() < end) { v = await fn(); if (v) return v; await new Promise((r) => setTimeout(r, 500)); } return v; };

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const open = async (u, scheme, device, hash = '#/now') => {
  const ctx = await browser.newContext({ ...device, colorScheme: scheme, reducedMotion: 'reduce' });
  // Onboarding is kept per device: this device has been through it.
  await ctx.addInitScript(({ s, key, settings }) => {
    if (localStorage.getItem(key)) return;
    localStorage.setItem(key, JSON.stringify(s));
    localStorage.setItem('school-dashboard:v1', JSON.stringify({ courses: [], items: [], settings }));
  }, { s: u.session, key: `sb-${ref}-auth-token`, settings: settingsOf() });
  await ctx.addInitScript(() => { window.__h = [location.hash]; addEventListener('hashchange', () => window.__h.push(location.hash)); });
  const page = await ctx.newPage();
  page.on('framenavigated', (f) => f === page.mainFrame() && process.env.DBG && console.log('nav', f.url()));
  await page.goto(`${BASE}${hash}`, { waitUntil: 'load' });
  await page.waitForTimeout(4000);
  return { ctx, page };
};
const text = (p, sel) => p.$eval(sel, (e) => e.innerText.replace(/\s+/g, ' ').trim()).catch(() => '');
const localItems = (p) => p.evaluate(() => JSON.parse(localStorage.getItem('school-dashboard:v1') ?? '{}').items?.length ?? 0);

try {
  for (const scheme of ['light', 'dark']) {
    const main = scheme === 'light';
    const say = (ok, line) => (main ? check(ok, line) : ok || console.log(`note ${scheme}: ${line}`));
    const u = await newUser();
    await seed(u);
    for (const [name, device] of [['desk', { viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2 }], ['phone', { ...devices['iPhone 14'], deviceScaleFactor: 2 }]]) {
      const tag = `${name}-${scheme}`;
      const first = name === 'desk';
      const { ctx, page } = await open(u, scheme, device);
      await page.waitForSelector('.frozen-banner', { timeout: 15000 }).catch(() => undefined);
      const banner = await text(page, '.frozen-banner');
      if (first) say(/Halo sync paused since \w{3} \d{1,2}\./.test(banner) && /Tap Sync to see what's changed/.test(banner), `the frozen banner invites a peek: "${banner.slice(0, 80)}"`);
      // The exam-week card.
      await page.waitForSelector('.exam-week', { timeout: 10000 }).catch(() => undefined);
      const card = await text(page, '.exam-week');
      if (first) {
        say(card.includes(`Your Chem Quiz 2 is ${quizDay}. Get a study plan and practice worksheet with Max.`), `the exam-week card: "${card.slice(0, 110)}"`);
        say(/Dates as of your last sync, \w{3} \d{1,2}\./.test(card), 'it says the dates are as of the last sync, which is 8 days old');
      }
      await page.locator('.exam-week').scrollIntoViewIfNeeded().catch(() => undefined);
      await page.screenshot({ path: `${OUT}/exam-week-card-${tag}.png` });
      // Peek sync: Sync, then the bookmark's export arrives.
      const before = await localItems(page);
      await page.click('.frozen-banner button:has-text("Sync")');
      await page.waitForTimeout(800);
      if (first) say(/See what's changed in Halo/i.test(await text(page, '.modal')), 'Sync on Free opens "See what\'s changed in Halo"');
      await page.evaluate((pl) => window.dispatchEvent(new MessageEvent('message', { origin: 'https://halo.gcu.edu', data: pl, source: window })), payload());
      await page.waitForSelector('.peek', { timeout: 10000 }).catch(() => undefined);
      await page.waitForTimeout(600);
      const peek = await text(page, '.modal');
      await page.screenshot({ path: `${OUT}/peek-summary-${tag}.png` });
      if (first) {
        say(/Since \w{3} \d{1,2}: 2 new assignments, 1 due date moved and 1 announcement that looks like work\./.test(peek), `the peek, from the real export: "${(peek.match(/Since[^.]*\./) ?? [''])[0]}"`);
        say(['Bring it all in with Plus $4.99', 'Get Max $7.99', 'Invite a friend for 30 days free'].every((b) => peek.includes(b)), 'the three ways in: Plus $4.99, Max $7.99, invite a friend');
        await page.waitForTimeout(1500);
        const after = await localItems(page);
        const cloud = (await admin.from('items').select('id').eq('user_id', u.id).is('deleted_at', null)).data?.length ?? 0;
        say(after === before && cloud === 3, `nothing applied or saved: ${after} items on the device, ${cloud} in the account, as before`);
      }
      await ctx.close();
    }
    if (!main) continue;
    // The planner, as the app left it: the exam-week push at 9 today (or now), opening Practice for the quiz.
    const exam = await until(async () => (await planned(u.id)).find((r) => r.kind === 'winback_exam'));
    check(!!exam && exam.body.startsWith(`Your Chem Quiz 2 is ${quizDay}.`) && /^#\/practice\?i=.+&wb=exam$/.test(exam.url), `the exam-week push is planned: "${exam?.body}" → ${exam?.url}`);
    check((await planned(u.id)).filter((r) => !r.sent_at).length === 1, 'one win-back push planned at a time');

    // Out-of-date: a student without a test coming up.
    const s = await newUser();
    await seed(s, { quiz: false });
    let { ctx, page } = await open(s, 'light', { viewport: { width: 1280, height: 900 } });
    const stale = await until(async () => (await planned(s.id)).find((r) => r.kind === 'winback_stale'));
    const days = stale ? (new Date(stale.send_at) - Date.now()) / DAY : 0;
    check(!!stale && /^Your Halo\+ planner is 2 weeks out of date\. See what's changed\.$/.test(stale.body) && stale.url === '#/now?peek=1&wb=stale' && days >= 7 && days < 8.1, `the out-of-date push, a week after this visit: "${stale?.body}" in ${days.toFixed(1)} days → ${stale?.url}`);
    await ctx.close();
    // notify-send marks it sent; the log keeps it past the 7-day prune.
    // Fast-forward: it goes out now, after that visit (which the student made on their own).
    const sentAt = new Date().toISOString();
    await admin.from('notification_plan').update({ send_at: sentAt, sent_at: sentAt, key: `winback_stale:${sentAt.slice(0, 16)}` }).eq('user_id', s.id).eq('kind', 'winback_stale');
    const log = (await admin.from('winback_sends').select('kind, sent_at').eq('user_id', s.id)).data ?? [];
    check(log.length === 1 && log[0].kind === 'stale', 'a sent win-back push is logged (kind "stale")');
    // Tapping it: the peek opens by itself.
    ({ ctx, page } = await open(s, 'light', { ...devices['iPhone 14'], deviceScaleFactor: 2 }, '#/now?peek=1&wb=stale'));
    await page.waitForSelector('.modal', { timeout: 8000 }).catch(() => undefined);
    check(/See what's changed in Halo/i.test(await text(page, '.modal')), 'the push opens straight into the peek');
    if (process.env.DBG) console.log('hashes', await page.evaluate(() => [window.__h, JSON.parse(localStorage.getItem('school-dashboard:v1')).settings.winbackOwnOpenAt]));
    await page.evaluate((pl) => window.dispatchEvent(new MessageEvent('message', { origin: 'https://halo.gcu.edu', data: pl, source: window })), payload());
    await page.waitForSelector('.peek', { timeout: 10000 }).catch(() => undefined);
    await page.screenshot({ path: `${OUT}/stale-push-peek-phone-light.png` });
    const next = (await until(async () => { const r = (await planned(s.id)).filter((x) => !x.sent_at); return r.length ? r : null; })) ?? [];
    if (!next.length) console.log('planned:', JSON.stringify(await planned(s.id)), 'log:', JSON.stringify((await admin.from('winback_sends').select('*').eq('user_id', s.id)).data));
    check(next.length === 1 && new Date(next[0].send_at) - new Date(sentAt) >= 7 * DAY - 60_000, `at most one a week: the next one waits until ${next[0]?.send_at}`);
    // Counted: the peek and the open, flushed when the tab goes.
    await page.evaluate(() => { Object.defineProperty(document, 'visibilityState', { get: () => 'hidden', configurable: true }); document.dispatchEvent(new Event('visibilitychange')); });
    await page.waitForTimeout(2500);
    await ctx.close();
    const ev = (await admin.from('usage_events').select('key, n').eq('user_id', s.id).like('key', 'winback:%')).data ?? [];
    check(ev.some((e) => e.key === 'winback:open:stale') && ev.some((e) => e.key === 'winback:peek'), `counted for Admin: ${ev.map((e) => e.key).join(', ')}`);
    // Three ignored in a row: nothing more until they open the app on their own.
    await admin.from('winback_sends').insert([1, 2].map((k) => ({ user_id: s.id, kind: 'stale', sent_at: new Date(Date.now() - k * 1000).toISOString() })));
    ({ ctx, page } = await open(s, 'light', { viewport: { width: 1280, height: 900 } }, '#/now?wb=stale'));
    const quiet = !!(await until(async () => (await planned(s.id)).filter((r) => !r.sent_at).length === 0));
    if (!quiet) console.log('own:', await page.evaluate(() => JSON.parse(localStorage.getItem('school-dashboard:v1')).settings.winbackOwnOpenAt), 'sends:', JSON.stringify((await admin.from('winback_sends').select('sent_at').eq('user_id', s.id)).data), 'plan:', JSON.stringify(await planned(s.id)));
    check(quiet, 'after three ignored in a row, nothing is planned');
    await ctx.close();
    ({ ctx, page } = await open(s, 'light', { viewport: { width: 1280, height: 900 } }, '#/now'));
    check(!!(await until(async () => (await planned(s.id)).filter((r) => !r.sent_at).length === 1)), 'opening Halo+ on their own starts them again (a week after the last one)');
    await ctx.close();
    // Starting a referral: none of these, and no exam card.
    await admin.from('reward_grants').insert({ user_id: u.id, tier: 'plus', source: 'invited', starts_at: new Date(Date.now() + DAY).toISOString(), ends_at: new Date(Date.now() + 31 * DAY).toISOString() }).then(({ error }) => error && console.log('grant:', error.message));
    ({ ctx, page } = await open(u, 'light', { viewport: { width: 1280, height: 900 } }));
    await page.waitForTimeout(3500);
    check(!(await page.$('.exam-week')) && (await planned(u.id)).filter((r) => !r.sent_at).length === 0, 'someone with a referral reward gets no card and no push');
    await ctx.close();
  }
  // Admin.
  for (const scheme of ['light', 'dark']) {
    const g = await newUser();
    await admin.from('profiles').update({ is_admin: true }).eq('user_id', g.id);
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 1100 }, deviceScaleFactor: 2, colorScheme: scheme });
    const p = await ctx.newPage();
    await p.goto(`${BASE}#/now`, { waitUntil: 'load' });
    await p.evaluate(({ s, key }) => { localStorage.setItem(key, JSON.stringify(s)); localStorage.setItem('school-dashboard:v1', JSON.stringify({ courses: [], items: [], settings: { onboarding: { startedAt: 'x', step: 'done', doneAt: 'x', skippedAt: null, tourDoneAt: 'x' } } })); }, { s: g.session, key: `sb-${ref}-auth-token` });
    await p.goto(`${BASE}#/admin`, { waitUntil: 'load' });
    await p.reload({ waitUntil: 'load' });
    await p.waitForSelector('.winback-table', { timeout: 15000 }).catch(() => undefined);
    await p.click('.upgrade button:has-text("Skip")', { timeout: 3000 }).catch(() => undefined);
    await p.locator('.winback-table').scrollIntoViewIfNeeded().catch(() => undefined);
    await p.screenshot({ path: `${OUT}/admin-winback-${scheme}.png` });
    const t = await text(p, '.admin-funnel');
    if (scheme === 'light' && !/Out-of-date push/.test(t)) console.log('admin text:', t.slice(0, 400));
    if (scheme === 'light') check(/peek syncs by \d+ Free students/.test(t) && ['Peek sync', 'Exam-week offer', 'Out-of-date push', 'Pushes sent', 'Opened', 'Upgraded'].every((w) => t.includes(w)), 'Admin: peek syncs, and per way in: pushes sent, opened, upgrade taps, upgraded');
    await ctx.close();
  }
} finally {
  await browser.close();
  for (const id of made) {
    for (const t of ['reward_grants', 'winback_sends', 'courses', 'items', 'settings', 'usage_log', 'usage_events', 'read_ledger', 'announcements', 'onboarding_events', 'notification_plan', 'notification_prefs']) await admin.from(t).delete().eq('user_id', id);
    await admin.auth.admin.deleteUser(id);
  }
  console.log(`removed ${made.length} throwaways`);
}
console.log(checks.every(Boolean) ? 'PASS' : 'FAIL');
process.exit(checks.every(Boolean) ? 0 : 1);
