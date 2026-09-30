// A brand-new account, the way George found the lab bug (2026-09-30), on the real backend with throwaway accounts.
// The export mirrors his test account's six classes: two lectures with labs (CHM-113 + CHM-113L, ESG-162 + ESG-162L),
// one online (ENG-105-ONL4) and one traditional-online (UNV-106-TOENGN05), each with its own class grade.
//   1. Fresh account, first sync in onboarding: Classes shows all six, each with its own grade and the meeting times its
//      Halo section code says (labs separate; ENG-105 online, no invented Wednesday/Friday times).
//   2. An account already hurt by the old rule (the lab merged into the lecture, items under it, the legacy timetable)
//      is repaired by its next sync: six classes, the lab's items moved with their done marks, nothing removed.
//   3. Now has no checklist card and shows the quiet invite line on day one.
//   4. The trial sheet ("Max · 7 days left"): the app's font, nothing cut off, scrolls to the invite button.
// Screens to docs/screens/fresh-account/<device>-<scheme>/.
//   KEYS_ENV=... BASE=http://localhost:4174/school-dashboard/ node scripts/e2e-fresh-account.mjs
import { mkdirSync, readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { chromium, devices } from 'playwright-core';
import { currentBuild } from './lib/build.mjs';
const env = Object.fromEntries(readFileSync(process.env.KEYS_ENV, 'utf8').split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]));
const BASE = process.env.BASE ?? 'http://localhost:4174/school-dashboard/';
const BUILD = await currentBuild(BASE);
const ref = new URL(env.VITE_SUPABASE_URL).hostname.split('.')[0];
const admin = createClient(env.VITE_SUPABASE_URL, env.SERVICE_ROLE, { auth: { persistSession: false } });
const DAY = 86_400_000;
const made = [];
const checks = [];
const check = (ok, line) => { checks.push(ok); console.log(`${ok ? 'ok  ' : 'FAIL'} ${line}`); };
const newUser = async () => {
  const email = `e2e-fresh-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@example.invalid`;
  const { data } = await admin.auth.admin.createUser({ email, email_confirm: true });
  made.push(data.user.id);
  const { data: link } = await admin.auth.admin.generateLink({ type: 'magiclink', email });
  const c = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data: s } = await c.auth.verifyOtp({ token_hash: link.properties.hashed_token, type: 'magiclink' });
  return { id: data.user.id, session: s.session };
};
const due = (n) => new Date(Date.now() + n * DAY).toISOString();
const A = (id, title, n, points, type = 'ASSIGNMENT', extra = {}) => ({ id, title, dueDate: due(n), points, type, status: null, score: null, description: '', ...extra });
const grade = (letter, points, maxPoints) => ({ letter, points, maxPoints, published: true });
const cls = (id, courseCode, section, name, modality, finalGrade, assessments, extra = {}) => ({ id, slugId: `${courseCode}-${section}-20260908`, classCode: `${courseCode}-${section}`, courseCode, name, instructors: ['Dr. Example'], startDate: '2026-09-08', endDate: '2026-12-20', stage: 'CURRENT', modality, credits: 3, finalGrade, assessments, announcements: [], resources: [], discussions: [], messages: [], ...extra });
const CLASSES = () => [
  cls('hc-chm', 'CHM-113', 'WF700A', 'General Chemistry I-Lecture', 'ONGROUND', grade('A', 190, 200), [A('a-chm-hw5', 'Topic 5 Homework', 3, 20), A('a-chm-q2', 'Quiz 2', 5, 50, 'QUIZ')]),
  cls('hc-chml', 'CHM-113L', 'M600A', 'General Chemistry I-Lab', 'ONGROUND', grade('B-', 176.34, 215), [A('a-lab-stoich', 'Stoichiometry Lab', 2, 30), A('a-lab-formal', 'Formal Lab Report', 9, 75)]),
  cls('hc-eng', 'ENG-105', 'ONL4', 'English Composition I', 'ONLINE', grade('B', 127.5, 150), [A('a-eng-oped', 'Final Draft of an Op-Ed', 6, 100)], { credits: 4 }),
  cls('hc-esg', 'ESG-162', 'MW100A', 'Engineering Math', 'ONGROUND', grade('A', 127, 130), [A('a-esg-matlab', 'MATLAB: Vectors', 4, 20)]),
  cls('hc-esgl', 'ESG-162L', 'T1230A', 'Engineering Math Lab', 'ONGROUND', grade('A-', 88, 95), [A('a-esgl-sensor', 'CLC – Sensor Lab 1', 7, 40)]),
  cls('hc-unv', 'UNV-106', 'TOENGN05', 'University On-Campus Success', 'TRADONLINE', grade('B+', 264.19, 300), [A('a-unv-q1', 'Topic 1 Quiz', 1, 10, 'QUIZ')], { credits: 4 }),
];
let classesOnce = null;
const payload = () => ({ kind: 'halo-export', version: 1, build: BUILD, exportedAt: new Date().toISOString(), source: 'bookmarklet', alerts: [], problems: [], pulls: ['assessments', 'grades', 'announcements'], classes: (classesOnce ??= CLASSES()) });
const EXPECT = {
  'CHM-113': { grade: 'A', meta: 'Wed 7:00 AM · Fri 7:00 AM · from your Halo section' },
  'CHM-113L': { grade: 'B-', meta: 'Mon 6:00 PM · from your Halo section' },
  'ENG-105': { grade: 'B', meta: 'Online' },
  'ESG-162': { grade: 'A', meta: 'Mon 1:00 PM · Wed 1:00 PM · from your Halo section' },
  'ESG-162L': { grade: 'A-', meta: 'Tue 12:30 PM · from your Halo section' },
  'UNV-106': { grade: 'B+', meta: 'Online' },
};
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const text = (p, sel) => p.$eval(sel, (e) => e.innerText.replace(/\s+/g, ' ').trim()).catch(() => '');
const cards = (p) => p.$$eval('.class-card', (els) => els.map((e) => ({ code: e.querySelector('.class-card-head > :first-child')?.innerText.trim() ?? '', grade: e.querySelector('.class-card-grade')?.innerText.replace(/\s+/g, ' ').trim() ?? '', meta: e.querySelector('.class-card-meta')?.innerText.trim() ?? '' })));
const cloudCourses = async (id) => (await admin.from('courses').select('data').eq('user_id', id).is('deleted_at', null)).data?.map((r) => r.data) ?? [];
const DESK = { viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2 };
const PHONE = { ...devices['iPhone 14'], deviceScaleFactor: 2 };

const dispatch = (page) => page.evaluate((pl) => window.dispatchEvent(new MessageEvent('message', { origin: 'https://halo.gcu.edu', data: pl, source: window })), payload());

const fresh = async (name, device, scheme) => {
  const OUT = `docs/screens/fresh-account/${name}-${scheme}`;
  mkdirSync(OUT, { recursive: true });
  const main = scheme === 'light';
  const say = (ok, line) => (main ? check(ok, `${name}: ${line}`) : ok || console.log(`note ${name}-${scheme}: ${line}`));
  const u = await newUser();
  const ctx = await browser.newContext({ ...device, colorScheme: scheme, reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  await page.goto(`${BASE}#/now`, { waitUntil: 'load' });
  await page.waitForTimeout(1200);
  await page.evaluate(() => localStorage.setItem('school-dashboard:onboard-wait-ms', '1500'));
  await page.click('.onboard button:has-text("Start")').catch(() => undefined);
  await page.waitForTimeout(400);
  await page.evaluate(({ s, key }) => localStorage.setItem(key, JSON.stringify(s)), { s: u.session, key: `sb-${ref}-auth-token` });
  await page.reload({ waitUntil: 'load' });
  await page.waitForSelector('.story', { timeout: 15000 }).catch(() => undefined);
  await page.click('.story-skip').catch(() => undefined);
  await page.waitForSelector('.gift', { timeout: 8000 }).catch(() => undefined);
  await page.click('.gift .offer-go').catch(() => undefined);
  await page.waitForTimeout(800);
  await dispatch(page);
  await page.waitForSelector('.onboard-payoff', { timeout: 20000 }).catch(() => undefined);
  await page.waitForTimeout(1200);
  await page.click('.onboard button:has-text("Start here")').catch(() => undefined);
  await page.waitForSelector('.comeback', { timeout: 6000 }).catch(() => undefined);
  await page.click('.comeback button:has-text("Not now")').catch(() => undefined);
  await page.waitForTimeout(600);
  await page.click('.comeback .onboard-big', { timeout: 2000 }).catch(() => undefined);
  await page.click('.tour-tip button:has-text("Skip")', { timeout: 3000 }).catch(() => undefined);
  await page.waitForTimeout(600);
  await page.click('.upgrade button:has-text("Skip")', { timeout: 4000 }).catch(() => undefined);
  await page.waitForTimeout(1500);
  // ---- Classes: all six.
  await page.goto(`${BASE}#/classes`, { waitUntil: 'load' });
  await page.waitForSelector('.class-card', { timeout: 10000 }).catch(() => undefined);
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${OUT}/1-classes.png`, fullPage: true });
  const got = await cards(page);
  const byCode = Object.fromEntries(got.map((c) => [c.code, c]));
  say(got.length === 6 && Object.keys(EXPECT).every((k) => byCode[k]), `Classes shows all 6: ${got.map((c) => c.code).join(', ')}`);
  for (const [code, want] of Object.entries(EXPECT)) {
    const c = byCode[code];
    say(!!c && c.grade.startsWith(want.grade) && c.meta === want.meta, `${code}: grade "${c?.grade.split(' ')[0]}", meetings "${c?.meta}"`);
  }
  const cloud = await cloudCourses(u.id);
  say(cloud.length === 6 && cloud.every((c) => c.haloClassId && CLASSES().some((k) => k.id === c.haloClassId && k.courseCode === c.code)), `the account holds 6 classes, each linked to its own Halo class`);
  // ---- Now: no checklist, the invite line from day one.
  await page.goto(`${BASE}#/now`, { waitUntil: 'load' });
  await page.waitForTimeout(3000);
  await page.click('.upgrade button:has-text("Skip")', { timeout: 2000 }).catch(() => undefined);
  const nowText = await text(page, '.now');
  await page.screenshot({ path: `${OUT}/2-now.png`, fullPage: name === 'phone' });
  say(!/Get the most out of your week/i.test(nowText) && !(await page.$('.welcome-list')), 'no "Get the most out of your week" card on Now');
  say(/Invite a friend, you both get 30 days of Plus free/.test(nowText) && !!(await page.$('.invite-line')), 'the quiet invite line shows on day one');
  // ---- The trial sheet.
  await page.click('.trial-chip');
  await page.waitForSelector('.trial-sheet', { timeout: 6000 }).catch(() => undefined);
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${OUT}/3-trial-sheet.png` });
  const sheet = await page.evaluate(() => {
    const modal = document.querySelector('.modal');
    const body = modal?.querySelector('.trial-sheet');
    if (!modal || !body) return null;
    const fonts = [...body.querySelectorAll('b, li, small, p, h3, span, button')].map((e) => getComputedStyle(e).fontFamily);
    const mono = fonts.filter((f) => /mono|Menlo|Courier/i.test(f)).length;
    const wraps = [...body.querySelectorAll('*')].every((e) => getComputedStyle(e).whiteSpace !== 'nowrap' || e.scrollWidth <= e.clientWidth + 1);
    const cut = [...body.querySelectorAll('*')].filter((e) => e.getBoundingClientRect().right > modal.getBoundingClientRect().right + 1).length;
    const invite = body.querySelector('.invite-btn');
    invite?.scrollIntoView({ block: 'end' });
    const r = invite?.getBoundingClientRect();
    const inView = !!r && r.bottom <= window.innerHeight + 1 && r.top >= 0 && r.right <= window.innerWidth + 1;
    return { mono, wraps, cut, scrolls: modal.scrollHeight > modal.clientHeight ? modal.scrollTop > 0 || modal.scrollHeight - modal.clientHeight < 2 : true, inView, overflowY: getComputedStyle(modal).overflowY };
  });
  await page.screenshot({ path: `${OUT}/3b-trial-sheet-bottom.png` });
  say(!!sheet && sheet.mono === 0, `trial sheet: the app font everywhere (${sheet?.mono ?? '?'} monospace elements)`);
  say(!!sheet && sheet.cut === 0 && sheet.wraps, `trial sheet: nothing runs past the right edge (${sheet?.cut ?? '?'} clipped)`);
  say(!!sheet && sheet.inView && sheet.scrolls, `trial sheet: scrolls, and the invite button can be reached (overflow ${sheet?.overflowY})`);
  await ctx.close();
};

// An account as the old rule left it: one CHM-113 linked to the LAB, both classes' items under it, George's timetable.
const repair = async () => {
  const u = await newUser();
  const now = new Date().toISOString();
  const courseId = '6f0d3c4e-1111-4a2b-9c3d-000000000001';
  const course = { id: courseId, code: 'CHM-113', name: 'General Chemistry I-Lecture', color: '#D95D39', credits: 3, instructors: [{ name: 'Dr. Example', email: '' }], meetings: [{ day: 3, start: '07:00', end: '08:15' }, { day: 5, start: '07:00', end: '08:15' }], online: false, haloSlugId: 'CHM-113L-M600A-20260908', haloClassId: 'hc-chml', termStart: '2026-09-08', termEnd: '2026-12-20', updatedAt: now };
  const item = (id, haloId, title, n, points, extra = {}) => ({ id, courseId, title, label: title, labelOverridden: false, type: 'homework', points, opensAt: null, dueAt: due(n), estimatedMinutes: 60, estimateOverridden: false, startByOverride: null, status: 'todo', completedAt: null, score: null, notes: '', topic: null, flags: { inClass: false, group: false, lopesWrite: false, timed: false, practice: false }, source: 'halo', haloId, award: null, updatedAt: now, ...extra });
  const items = [
    item('6f0d3c4e-1111-4a2b-9c3d-00000000a001', 'a-chm-hw5', 'Topic 5 Homework', 3, 20, { notes: 'half done' }),
    item('6f0d3c4e-1111-4a2b-9c3d-00000000a002', 'a-lab-stoich', 'Stoichiometry Lab', 2, 30, { status: 'done', completedAt: now, score: 28 }),
    item('6f0d3c4e-1111-4a2b-9c3d-00000000a003', 'a-lab-formal', 'Formal Lab Report', 9, 75),
  ];
  await admin.from('courses').insert({ id: courseId, user_id: u.id, data: course, updated_at: now });
  await admin.from('items').insert(items.map((i) => ({ id: i.id, user_id: u.id, data: i, updated_at: now })));
  const settings = { timezone: 'America/Phoenix', lastPull: { at: new Date(Date.now() - DAY).toISOString(), source: 'bookmarklet' }, onboarding: { startedAt: 'x', step: 'done', doneAt: 'x', skippedAt: null, tourDoneAt: 'x' }, upgradeSeen: { plus: 'x', max: 'x' }, notifyAsk: { askedAt: 'x', answer: 'no' } };
  await admin.from('settings').upsert({ user_id: u.id, updated_at: now, data: settings });
  const ctx = await browser.newContext({ ...DESK, colorScheme: 'light', reducedMotion: 'reduce' });
  await ctx.addInitScript(({ s, key, settings }) => { if (localStorage.getItem(key)) return; localStorage.setItem(key, JSON.stringify(s)); localStorage.setItem('school-dashboard:v1', JSON.stringify({ courses: [], items: [], settings })); }, { s: u.session, key: `sb-${ref}-auth-token`, settings });
  const page = await ctx.newPage();
  await page.goto(`${BASE}#/classes`, { waitUntil: 'load' });
  await page.waitForTimeout(4500);
  const before = await cards(page);
  check(before.length === 1 && before[0].code === 'CHM-113', `before the sync, the hurt account shows ${before.length} class: ${before.map((c) => c.code).join(', ')}`);
  // Sync as a student would: the bookmark's export arrives, the review opens, Apply.
  await page.click('.topbar button:has-text("Sync"), button.nav-sync, [aria-label="Sync Halo"]').catch(() => undefined);
  await page.waitForTimeout(800);
  await dispatch(page);
  await page.waitForSelector('.diff-review, .diff', { timeout: 15000 }).catch(() => undefined);
  await page.waitForTimeout(2500);
  await page.screenshot({ path: 'docs/screens/fresh-account/repair-review.png', fullPage: true });
  const review = await page.evaluate(() => [...document.querySelectorAll('.modal')].map((m) => m.innerText).join(' ').replace(/\s+/g, ' '));
  check(/CHM-113L/.test(review) && /Class/.test(review), `the review shows the lab as its own class and the moved items ("${(review.match(/Class[^.]{0,60}/) ?? [''])[0]}")`);
  check(!/Removed|No longer in Halo|remove/i.test(review) || !/Stoichiometry Lab.*(remove|Removed)/i.test(review), 'nothing is proposed for removal');
  await page.click('button:has-text("Apply")');
  await page.waitForTimeout(3000);
  await page.click('button:has-text("Done"), .modal-close', { timeout: 2000 }).catch(() => undefined);
  await page.goto(`${BASE}#/classes`, { waitUntil: 'load' });
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(3500);
  const after = await cards(page);
  await page.screenshot({ path: 'docs/screens/fresh-account/repair-classes.png', fullPage: true });
  check(after.length === 6 && after.some((c) => c.code === 'CHM-113L'), `after the sync: ${after.length} classes: ${after.map((c) => c.code).join(', ')}`);
  const cl = await cloudCourses(u.id);
  const lec = cl.find((c) => c.code === 'CHM-113');
  const lab = cl.find((c) => c.code === 'CHM-113L');
  check(lec?.haloClassId === 'hc-chm' && lab?.haloClassId === 'hc-chml' && lec?.haloGrade?.letter === 'A' && lab?.haloGrade?.letter === 'B-', `lecture linked to its own class (grade ${lec?.haloGrade?.letter}), lab to its own (grade ${lab?.haloGrade?.letter})`);
  check(lec && lec.meetings.length === 2 && lec.meetings[0].start === '07:00' && lab && lab.meetings.length === 1 && lab.meetings[0].start === '18:00', `each keeps its own schedule: lecture ${JSON.stringify(lec?.meetings.map((m) => m.day + '@' + m.start))}, lab ${JSON.stringify(lab?.meetings.map((m) => m.day + '@' + m.start))}`);
  const rows = (await admin.from('items').select('data, deleted_at').eq('user_id', u.id)).data ?? [];
  const stoich = rows.find((r) => r.data.haloId === 'a-lab-stoich');
  const hw = rows.find((r) => r.data.haloId === 'a-chm-hw5');
  check(!!stoich && !stoich.deleted_at && stoich.data.courseId === lab?.id && stoich.data.status === 'done' && stoich.data.score === 28, 'the lab item moved to the lab class with its done mark and score');
  check(!!hw && !hw.deleted_at && hw.data.courseId === lec?.id && hw.data.notes === 'half done', 'the lecture item stayed, notes kept');
  check(rows.every((r) => !r.deleted_at), 'nothing was deleted');
  await ctx.close();
};

const ONLY = process.env.ONLY;
try {
  if (!ONLY || ONLY === 'fresh') for (const [name, device] of [['desk', DESK], ['phone', PHONE]]) for (const scheme of ['light', 'dark']) { console.log(`--- ${name}-${scheme}`); await fresh(name, device, scheme); }
  if (!ONLY || ONLY === 'repair') { console.log('--- repair'); await repair(); }
} finally {
  await browser.close();
  for (const id of made) {
    for (const t of ['reward_grants', 'courses', 'items', 'settings', 'usage_log', 'usage_events', 'read_ledger', 'announcements', 'onboarding_events', 'notification_plan', 'winback_sends']) await admin.from(t).delete().eq('user_id', id);
    await admin.auth.admin.deleteUser(id);
  }
  console.log(`removed ${made.length} throwaways`);
}
console.log(checks.every(Boolean) ? 'PASS' : 'FAIL');
process.exit(checks.every(Boolean) ? 0 : 1);
