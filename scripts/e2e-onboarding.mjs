// The new-student onboarding and the upgrade welcomes, on the real backend with brand-new throwaway accounts, desktop
// and phone, light and dark. Every screen is captured to docs/screens/onboarding/<device>-<scheme>/NN-name.png,
// including the bookmark step's one-minute fixes; each step is timed. The sync is the bookmark's real message,
// posted to the tab the way the bookmark posts it. Throwaways are removed at the end.
//   KEYS_ENV=/path/to/keys.env BASE=http://localhost:4174/school-dashboard/ node scripts/e2e-onboarding.mjs
import { readFileSync, mkdirSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { chromium, devices } from 'playwright-core';
import { currentBuild } from './lib/build.mjs';
const env = Object.fromEntries(readFileSync(process.env.KEYS_ENV, 'utf8').split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]));
const BASE = process.env.BASE ?? 'http://localhost:4174/school-dashboard/';
const ONLY = process.env.ONLY?.split(',');
const BUILD = await currentBuild(BASE);
const ref = new URL(env.VITE_SUPABASE_URL).hostname.split('.')[0];
const admin = createClient(env.VITE_SUPABASE_URL, env.SERVICE_ROLE, { auth: { persistSession: false } });
const made = [];
const checks = [];
const check = (ok, line) => { checks.push(ok); console.log(`${ok ? 'ok  ' : 'FAIL'} ${line}`); };
const newUser = async () => {
  const email = `e2e-onboard-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@example.invalid`;
  const { data } = await admin.auth.admin.createUser({ email, email_confirm: true });
  made.push(data.user.id);
  const { data: link } = await admin.auth.admin.generateLink({ type: 'magiclink', email });
  const c = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data: s } = await c.auth.verifyOtp({ token_hash: link.properties.hashed_token, type: 'magiclink' });
  return { id: data.user.id, session: s.session };
};
// What one real sync carries for a new student: two classes, a quiz in ten days, and an announcement with a requirement.
const day = (n) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10) + 'T06:59:00.000Z';
const payload = () => ({ kind: 'halo-export', version: 1, build: BUILD, exportedAt: new Date().toISOString(), source: 'bookmarklet', alerts: [], problems: [], pulls: ['assessments', 'grades', 'announcements'],
  classes: [
    { id: 'hc-chm', slugId: 'chm', classCode: 'CHM-113-O500', courseCode: 'CHM-113', name: 'General Chemistry I', instructors: ['Dr. Awad'], startDate: '2026-09-01', endDate: '2026-12-15', stage: 'CURRENT', modality: 'ONGROUND', credits: 3,
      assessments: [
        { id: 'a1', title: 'Topic 3 Homework', dueDate: day(3), points: 20, type: 'ASSIGNMENT', status: null, score: null, description: 'Complete the Topic 3 problem set in ALEKS.' },
        { id: 'a2', title: 'Lab 4: Titration Report', dueDate: day(8), points: 75, type: 'ASSIGNMENT', status: null, score: null, description: 'Write up the titration lab.' },
        { id: 'a3', title: 'Quiz 2', dueDate: day(10), points: 50, type: 'QUIZ', status: null, score: null, description: 'Covers Topics 2 and 3.' },
      ],
      announcements: [{ id: 'onb-post-1', forumId: 'f1', title: 'Lab 4 reminders', content: '<p>For the Lab 4 titration report, submit it as one PDF, no handwriting, and include your notebook pages at the end. Bring your own goggles to lab.</p>', publishedAt: new Date(Date.now() - 86_400_000).toISOString(), modifiedAt: null, author: 'Dr. Awad', mustAcknowledge: false, acknowledged: false, resources: [] }],
      resources: [], discussions: [], messages: [] },
    { id: 'hc-eng', slugId: 'eng', classCode: 'ENG-105-O501', courseCode: 'ENG-105', name: 'English Composition I', instructors: ['Prof. Black'], startDate: '2026-09-01', endDate: '2026-12-15', stage: 'CURRENT', modality: 'ONLINE', credits: 4,
      assessments: [
        { id: 'b1', title: 'Topic 4 DQ 1', dueDate: day(2), points: 5, type: 'DISCUSSION_QUESTION', status: null, score: null, description: '' },
        { id: 'b2', title: 'Rhetorical Analysis Final Draft', dueDate: day(9), points: 150, type: 'ASSIGNMENT', status: null, score: null, description: '' },
      ],
      announcements: [], resources: [], discussions: [], messages: [] },
  ] });

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const run = async (name, device, scheme) => {
  const OUT = `docs/screens/onboarding/${name}-${scheme}`;
  mkdirSync(OUT, { recursive: true });
  let n = 0;
  const shot = async (page, label) => { n += 1; await page.waitForTimeout(350); await page.screenshot({ path: `${OUT}/${String(n).padStart(2, '0')}-${label}.png` }); };
  const ctx = await browser.newContext({ ...device, colorScheme: scheme, reducedMotion: 'reduce', permissions: ['clipboard-read', 'clipboard-write'] });
  const page = await ctx.newPage();
  // Open Halo opens a real tab; it is closed again, as a student would switch back.
  const opened = [];
  page.on('popup', (p) => { opened.push(p.url()); void p.close().catch(() => undefined); });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const t0 = Date.now();
  const u = await newUser();
  await page.goto(`${BASE}#/now`, { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.setItem('school-dashboard:onboard-wait-ms', '1500'));
  await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(1200);
  await shot(page, 'welcome');
  await page.click('.onboard button:has-text("Start")');
  await page.waitForTimeout(600);
  await shot(page, 'account');
  // Coming back from the email link: the session lands, onboarding resumes where it was.
  await page.evaluate(({ s, key }) => localStorage.setItem(key, JSON.stringify(s)), { s: u.session, key: `sb-${ref}-auth-token` });
  await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(2500);
  // Since 2026-09-28 the trial is chosen: Free beside Max, then the offer; this student takes the free week.
  await page.waitForSelector('.plan-compare', { timeout: 10000 }).catch(() => undefined);
  await shot(page, 'plan-compare');
  await page.click('.plan-compare .btn.primary').catch(() => undefined);
  await shot(page, 'plan-offer');
  await page.click('.plan-offer button:has-text("Start my free week")').catch(() => undefined);
  await page.waitForTimeout(2500);
  const phone = name === 'phone';
  if (!phone) {
    // Since 2026-10-05 desktop Chrome starts with the extension; the bookmark is one tap away (e2e-onboarding-ext covers
    // the extension path itself).
    const extFirst = await page.$('.onboard [aria-label="Add the extension"]');
    if (name === 'desk' && scheme === 'light') check(!!extFirst, 'after sign-in, desktop Chrome starts with "Connect Halo the easy way" (the extension)');
    await shot(page, 'ext');
    await page.click('.onboard button:has-text("bookmark instead")');
    await page.waitForTimeout(500);
    const bar = await page.$('.onboard [aria-label="Show your bookmarks bar"]');
    if (name === 'desk' && scheme === 'light') check(!!bar, '"Use the bookmark instead" goes to the bookmarks-bar step');
    await shot(page, 'bar');
    await page.click('button:has-text("I see my bookmarks bar")');
    await shot(page, 'drag');
    await page.click('button:has-text("It\'s in my bookmarks bar")');
    await shot(page, 'open-halo');
    await page.click('.onboard button:has-text("Open Halo")');
    await page.waitForTimeout(800);
    if (name === 'desk' && scheme === 'light') check(opened.some((u) => u.includes('halo.gcu.edu')), `Open Halo opened a Halo tab: ${opened.join(', ') || 'none'}`);
    await shot(page, 'wait');
    await page.waitForSelector('.fixes', { timeout: 5000 });
    await shot(page, 'wait-fixes');
    // Resume: leave and come back.
    await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(1500);
    if (name === 'desk' && scheme === 'light') check(!!(await page.$('.onboard [aria-label="Waiting for Halo"]')), 'a reload resumes on the waiting screen');
  } else {
    await shot(page, 'phone-copy');
    await page.click('.onboard button:has-text("Copy it")');
    await shot(page, 'phone-save');
    await page.click('.onboard button:has-text("Done")');
    await shot(page, 'phone-edit');
    await page.click('.onboard button:has-text("Done")');
    await shot(page, 'phone-open');
    await page.click('.onboard button:has-text("Open Halo")');
    await shot(page, 'phone-wait');
    await page.waitForSelector('.fixes', { timeout: 5000 });
    await shot(page, 'phone-wait-fixes');
  }
  // The bookmark arrives: nothing to press.
  await page.evaluate((p) => window.dispatchEvent(new MessageEvent('message', { origin: 'https://halo.gcu.edu', data: p, source: window })), payload());
  await page.waitForSelector('.onboard-payoff', { timeout: 15000 }).catch(() => undefined);
  const arrived = Date.now() - t0;
  // Let the reader find what the announcement asks (a real Haiku call through the deployed function).
  await page.waitForSelector('.payoff-finds li', { timeout: 60000 }).catch(() => undefined);
  const payoff = await page.$eval('.onboard-payoff', (e) => e.innerText.replace(/\s+/g, ' ')).catch(() => '');
  await shot(page, 'payoff');
  if (scheme === 'light') {
    check(/5 assignments from 2 classes/.test(payoff), `${name}: payoff counts the real sync: ${payoff.slice(0, 60)}`);
    check(/next big deadline/i.test(payoff) && /Rhetorical Analysis/i.test(payoff), `${name}: next big deadline named`);
    check(/PDF|goggles|handwriting|notebook/i.test(payoff), `${name}: a hidden requirement from the announcement on the payoff`);
    check(/study plan for .*quiz 2/i.test(payoff), `${name}: a study plan for the next quiz: ${payoff.match(/About [^.]*\./)?.[0]}`);
    check(arrived < 120_000, `${name}: own assignments on screen ${Math.round(arrived / 1000)}s after opening the app (scripted clicks)`);
  }
  await page.click('.onboard button:has-text("Start here")');
  await page.waitForTimeout(1200);
  for (const stop of ['now', 'calendar', 'inbox', 'study']) {
    const tip = await page.$('.tour-tip');
    if (!tip) break;
    await shot(page, `tour-${stop}`);
    await page.click('.tour-tip button.primary');
    await page.waitForTimeout(500);
  }
  // Then Max's welcome (the trial is Max): three screens.
  await page.waitForSelector('.upgrade', { timeout: 5000 }).catch(() => undefined);
  const maxOn = !!(await page.$('.upgrade[aria-label="Welcome to Max"]'));
  if (scheme === 'light') check(maxOn, `${name}: after the tour, the Max welcome (trial)`);
  if (!maxOn) await shot(page, 'DEBUG-no-max');
  if (maxOn) {
    await shot(page, 'max-1-welcome');
    await page.click('.upgrade button.primary');
    await page.click('.accent-picker button >> nth=3').catch(() => undefined);
    await shot(page, 'max-2-colour');
    await page.click('.upgrade .onboard-actions button.primary');
    await shot(page, 'max-3-next-test');
    const t3 = await page.$eval('.upgrade', (e) => e.innerText.replace(/\s+/g, ' '));
    if (scheme === 'light') check(/Quiz 2/.test(t3) && /practice worksheet/i.test(t3) && /Maybe later/.test(t3) && /Optional/.test(t3), `${name}: Max's third screen: the next quiz, a worksheet, optional with Maybe later`);
    await page.click('.upgrade button:has-text("Maybe later")');
    await page.waitForTimeout(800);
    await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(2500);
    if (scheme === 'light') check(!(await page.$('.upgrade')), `${name}: the Max welcome never shows twice`);
  }
  // Plus, for someone who upgrades to Plus: a fresh account on Plus with its trial over.
  const p = await newUser();
  await admin.from('profiles').update({ tier: 'plus', trial_ends_at: new Date(Date.now() - 86_400_000).toISOString() }).eq('user_id', p.id);
  const ctx2 = await browser.newContext({ ...device, colorScheme: scheme, reducedMotion: 'reduce' });
  const p2 = await ctx2.newPage();
  // A student who was already set up (onboarded, toured) and has just upgraded to Plus.
  await p2.goto(`${BASE}#/now`, { waitUntil: 'networkidle' });
  await p2.evaluate(({ s, key }) => localStorage.setItem(key, JSON.stringify(s)), { s: p.session, key: `sb-${ref}-auth-token` });
  await p2.reload({ waitUntil: 'networkidle' }); await p2.waitForTimeout(1500);
  await p2.evaluate((pl) => window.dispatchEvent(new MessageEvent('message', { origin: 'https://halo.gcu.edu', data: pl, source: window })), payload());
  await p2.waitForSelector('.onboard-payoff', { timeout: 15000 }).catch(() => undefined);
  await p2.waitForSelector('.payoff-finds li', { timeout: 60000 }).catch(() => undefined);
  await p2.evaluate(() => { const d = JSON.parse(localStorage.getItem('school-dashboard:v1')); d.settings.onboarding = { ...d.settings.onboarding, step: 'done', doneAt: 'x', tourDoneAt: 'x' }; localStorage.setItem('school-dashboard:v1', JSON.stringify(d)); });
  await p2.reload({ waitUntil: 'networkidle' }); await p2.waitForTimeout(2500);
  await p2.waitForSelector('.upgrade', { timeout: 5000 }).catch(() => undefined);
  const plusOn = !!(await p2.$('.upgrade[aria-label="Welcome to Plus"]'));
  if (scheme === 'light') check(plusOn, `${name}: a Plus account gets the Plus welcome`);
  if (!plusOn) await p2.screenshot({ path: `${OUT}/DEBUG-no-plus.png` });
  if (plusOn) {
    const OUTP = OUT;
    const shot2 = async (label) => { n += 1; await p2.waitForTimeout(350); await p2.screenshot({ path: `${OUTP}/${String(n).padStart(2, '0')}-${label}.png` }); };
    await shot2('plus-1-welcome');
    await p2.click('.upgrade button.primary');
    await shot2('plus-2-found');
    const t2 = await p2.$eval('.upgrade', (e) => e.innerText.replace(/\s+/g, ' '));
    if (scheme === 'light') check(/PDF|goggles|handwriting|notebook/i.test(t2), `${name}: Plus shows what it found in their real announcement: ${t2.slice(0, 90)}`);
    await p2.click('.upgrade button.primary');
    await shot2('plus-3-autosync-notifications');
  }
  await ctx2.close();
  if (errors.length) console.log(`${name}-${scheme} page errors:`, errors.slice(0, 3));
  await ctx.close();
};
try {
  const combos = [['desk', { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 }], ['phone', { ...devices['iPhone 14'], deviceScaleFactor: 2 }]];
  for (const [name, device] of combos) for (const scheme of ['light', 'dark']) if (!ONLY || ONLY.includes(`${name}-${scheme}`)) await run(name, device, scheme);
} finally {
  await browser.close();
  for (const id of made) {
    for (const t of ['courses', 'items', 'settings', 'usage_log', 'usage_events', 'read_ledger', 'announcements', 'onboarding_events']) await admin.from(t).delete().eq('user_id', id);
    await admin.auth.admin.deleteUser(id);
  }
  console.log(`removed ${made.length} throwaways`);
}
console.log(checks.every(Boolean) ? 'PASS' : 'FAIL');
