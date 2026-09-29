// The free trial (2026-09-29; first version 2026-09-28), on the real backend with brand-new throwaway accounts: a student who picks
// the trial, one who picks Free, then the trial moved to day 5, day 6, the last day and past its end. Every screen to
// docs/screens/trial/<desk|phone>-<light|dark>/NN-name.png. Throwaways removed at the end.
//   KEYS_ENV=/path/to/keys.env BASE=http://localhost:4174/school-dashboard/ node scripts/e2e-trial.mjs
import { mkdirSync, readFileSync } from 'node:fs';
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
  const email = `e2e-trial-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@example.invalid`;
  const { data } = await admin.auth.admin.createUser({ email, email_confirm: true });
  made.push(data.user.id);
  const { data: link } = await admin.auth.admin.generateLink({ type: 'magiclink', email });
  const c = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data: s } = await c.auth.verifyOtp({ token_hash: link.properties.hashed_token, type: 'magiclink' });
  return { id: data.user.id, session: s.session };
};
const profile = async (id) => (await admin.from('profiles').select('tier, trial_started_at, trial_ends_at').eq('user_id', id).single()).data;
const day = (n) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10) + 'T06:59:00.000Z';
const payload = () => ({ kind: 'halo-export', version: 1, build: BUILD, exportedAt: new Date().toISOString(), source: 'bookmarklet', alerts: [], problems: [], pulls: ['assessments', 'grades', 'announcements'],
  classes: [
    { id: 'hc-chm', slugId: 'chm', classCode: 'CHM-113-O500', courseCode: 'CHM-113', name: 'General Chemistry I', instructors: ['Dr. Awad'], startDate: '2026-09-01', endDate: '2026-12-15', stage: 'CURRENT', modality: 'ONGROUND', credits: 3,
      assessments: [
        { id: 'a1', title: 'Topic 3 Homework', dueDate: day(3), points: 20, type: 'ASSIGNMENT', status: null, score: null, description: '' },
        { id: 'a2', title: 'Lab 4: Titration Report', dueDate: day(8), points: 75, type: 'ASSIGNMENT', status: null, score: null, description: '' },
        { id: 'a3', title: 'Quiz 2', dueDate: day(4), points: 50, type: 'QUIZ', status: null, score: null, description: 'Covers Topics 2 and 3.' },
      ],
      announcements: [{ id: 'tr-post-1', forumId: 'f1', title: 'Discussion this week', content: '<p>For the Topic 3 discussion, reply to two classmates by Sunday. Bring goggles to lab.</p>', publishedAt: new Date(Date.now() - 86_400_000).toISOString(), modifiedAt: null, author: 'Dr. Awad', mustAcknowledge: false, acknowledged: false, resources: [] }],
      resources: [], discussions: [], messages: [] },
  ] });

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const run = async (name, device, scheme) => {
  const OUT = `docs/screens/trial/${name}-${scheme}`;
  mkdirSync(OUT, { recursive: true });
  const say = (ok, line) => ((name === 'desk' || name.startsWith('ipad')) && scheme === 'light' ? check(ok, line) : ok || console.log(`note ${name}-${scheme}: ${line}`));
  // An iPad reports itself as a Mac with a touch screen (Safari) or as an iPad (Chrome).
  const prep = (c) => (name.startsWith('ipad') ? c.addInitScript(() => { Object.defineProperty(navigator, 'maxTouchPoints', { get: () => 5 }); Object.defineProperty(navigator, 'platform', { get: () => (/CriOS/.test(navigator.userAgent) ? 'iPad' : 'MacIntel') }); }) : null);
  let n = 0;
  const ctx = await browser.newContext({ ...device, colorScheme: scheme, reducedMotion: 'reduce' });
  await prep(ctx);
  await ctx.addInitScript(() => { window.open = () => null; });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const shot = async (label, p = page) => { n += 1; await p.waitForTimeout(450); await p.screenshot({ path: `${OUT}/${String(n).padStart(2, '0')}-${label}.png` }); };
  const text = (sel, p = page) => p.$eval(sel, (e) => e.innerText.replace(/\s+/g, ' ').trim()).catch(() => '');
  const signIn = async (p, u) => {
    await p.goto(`${BASE}#/now`, { waitUntil: 'load' });
    await p.waitForTimeout(1200);
    await p.evaluate(() => localStorage.setItem('school-dashboard:onboard-wait-ms', '1500'));
    await p.click('.onboard button:has-text("Start")').catch(() => undefined);
    await p.waitForTimeout(500);
    await p.evaluate(({ s, key }) => localStorage.setItem(key, JSON.stringify(s)), { s: u.session, key: `sb-${ref}-auth-token` });
    await p.reload({ waitUntil: 'load' });
    await p.waitForTimeout(3000);
  };

  // ---- 1. A new student who picks the trial.
  const u = await newUser();
  const p0 = await profile(u.id);
  say(p0.tier === 'free' && !p0.trial_started_at && !p0.trial_ends_at, 'a new account starts on Free with no trial running');
  await signIn(page, u);
  await page.waitForSelector('.story', { timeout: 10000 }).catch(() => undefined);
  // The fifteen seconds, playing by itself: Free, then Plus, then Max, then the trial screen.
  const t0 = Date.now();
  const beatAt = async (ms, label) => { await page.waitForTimeout(Math.max(0, ms - (Date.now() - t0))); await shot(label); return text('.story-caption'); };
  const b1 = await beatAt(800, 'story-1-free');
  const b2 = await beatAt(5800, 'story-2-plus');
  const b3 = await beatAt(10800, 'story-3-max');
  say(/^Free What you add yourself\.$/.test(b1) && /^Plus Everything from Halo, read for you\.$/.test(b2) && /^Max Study help that knows your class\.$/.test(b3), `three beats, playing by themselves: "${b1}" / "${b2}" / "${b3}"`);
  say(/Example: a GCU student's week, not your data\./.test(await text('.story')), 'labelled as an example');
  say(!!(await page.$('.story-skip')), 'and skippable');
  await page.waitForSelector('.plan-offer', { timeout: 9000 }).catch(() => undefined);
  const took = Math.round((Date.now() - t0) / 1000);
  say(!!(await page.$('.plan-offer')) && took <= 18, `it moves on to the trial screen by itself (${took}s)`);
  await shot('offer');
  const offer = await text('.plan-offer');
  say(/^Try everything free for 7 days\./.test(offer), 'big: "Try everything free for 7 days."');
  say(/No card\. Nothing to cancel\. Nothing charges\./.test(offer) && (await page.$eval('.offer-promise', (e) => getComputedStyle(e).fontWeight)) >= 600, 'right under it, bold: "No card. Nothing to cancel. Nothing charges."');
  const go = await page.$eval('.offer-go', (e) => ({ t: e.innerText.trim(), h: e.getBoundingClientRect().height, w: e.getBoundingClientRect().width, pw: e.parentElement.getBoundingClientRect().width }));
  say(go.t === 'Start my free week' && go.h >= 60 && go.w >= go.pw - 2, `one huge gold button: "${go.t}" ${Math.round(go.w)}x${Math.round(go.h)}`);
  say(offer.includes('After 7 days you go back to Free and choose if you want to keep anything.'), 'one line under the button');
  say(/Continue with Free instead\.$/.test(offer), 'a small link at the bottom: "Continue with Free instead."');
  await page.click('.plan-offer button:has-text("Start my free week")');
  await page.waitForTimeout(2500);
  const p1 = await profile(u.id);
  say(!!p1.trial_started_at && new Date(p1.trial_ends_at).getTime() - new Date(p1.trial_started_at).getTime() > 6.9 * 86_400_000, 'Start my free week starts a 7-day trial on the server');
  say(!!(await page.$('.onboard [aria-label="Show your bookmarks bar"], .onboard [aria-label="Drag the bookmark"], .onboard [aria-label="Copy the bookmark"], .onboard .ipad-step')), `and goes straight into connecting Halo${name.startsWith('ipad') ? ' (the iPad’s own steps)' : ''}`);
  await shot('connect-halo');
  await page.evaluate((pl) => window.dispatchEvent(new MessageEvent('message', { origin: 'https://halo.gcu.edu', data: pl, source: window })), payload());
  await page.waitForSelector('.onboard-payoff', { timeout: 15000 }).catch(() => undefined);
  await page.waitForTimeout(1500);
  await shot('payoff');
  await page.click('.onboard button:has-text("Start here")').catch(() => undefined);
  await page.waitForTimeout(1200);
  await page.click('.tour-tip button:has-text("Skip")').catch(() => undefined);
  await page.waitForTimeout(800);
  // The Max welcome opens after the tour, sometimes a moment later: wait for it, then skip it.
  await page.waitForSelector('.upgrade', { timeout: 8000 }).catch(() => undefined);
  await page.click('.upgrade button:has-text("Skip")', { timeout: 5000 }).catch(() => undefined);
  await page.waitForTimeout(1000);
  await shot('now-trial');
  const chip = await text('.trial-chip');
  say(/^(Free trial · 7 days left|Trial · 7 days)$/.test(chip) && (name !== 'desk' || /^Free trial/.test(chip)), `the chip in the top bar: "${chip}"`);
  const wide = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  say(wide <= 2, `the top bar with the chip fits the screen (overflow ${wide}px)`);
  say(!!(await page.$('.plan-badge')), 'Max-only and Plus things carry a badge during the trial');
  await page.click('.trial-chip');
  await page.waitForTimeout(500);
  await shot('chip-sheet');
  const sheet = await text('.trial-sheet');
  say(/What's included/.test(sheet) && /After it ends/.test(sheet) && /back to Free/.test(sheet) && /Keep Max/.test(sheet) && /Choose Plus/.test(sheet) && /Cancel anytime/.test(sheet), 'the sheet: what is included, when it ends, what then, the options');
  await page.keyboard.press('Escape');

  // ---- Fast-forward: day 5 (two days before the end), day 6, the last day, then after.
  const setEnd = async (ms) => {
    await admin.from('profiles').update({ trial_started_at: new Date(Date.now() + ms - 7 * 86_400_000).toISOString(), trial_ends_at: new Date(Date.now() + ms).toISOString() }).eq('user_id', u.id);
    await page.goto(`${BASE}#/now`, { waitUntil: 'load' });
    await page.reload({ waitUntil: 'load' });
    await page.waitForTimeout(3000);
  };
  await setEnd(2.5 * 86_400_000);
  await shot('day5');
  say(/3 days/.test(await text('.trial-chip')) && !(await page.$('.trial-receipts')), `day 5: the chip counts down ("${await text('.trial-chip')}"), no card yet`);
  await setEnd(1.5 * 86_400_000);
  await shot('day6-reminder');
  say(/Your free trial ends in 2 days/i.test(await text('.trial-receipts')) && /2 days/.test(await text('.trial-chip')), 'day 6: the reminder, two days before the end');
  say(/Keep Max/.test(await text('.trial-receipts')) && /Nothing charges/.test(await text('.trial-receipts')), 'the reminder says what happens and offers the choices');
  await setEnd(60 * 60 * 1000);
  await shot('last-day');
  say(/Last day of your free trial/i.test(await text('.trial-receipts')) && /last day/.test(await text('.trial-chip')), 'the last day: the reminder and the chip');
  await setEnd(-60 * 60 * 1000);
  await page.waitForSelector('.trial-ended', { timeout: 8000 }).catch(() => undefined);
  await shot('ended');
  const ended = await text('.trial-ended');
  say(/Your free trial ended\./.test(ended), 'after it ends: one clear screen');
  say(/assignments pulled from Halo/.test(ended), `with real numbers: ${ended.match(/What it did[^W]*/)?.[0]?.slice(0, 120) ?? ''}`);
  say(/Halo sync is paused/.test(ended) && /aren't read/.test(ended) && /locked/.test(ended), 'what changes, in plain words');
  say(/What you keep/i.test(ended) && /Everything you added/.test(ended), 'what they keep');
  say(/Keep Max/.test(ended) && /Choose Plus/.test(ended) && /Stay on Free/.test(ended) && /\$7\.99 a month/.test(ended) && /\$4\.99 a month/.test(ended) && /Cancel anytime/.test(ended), 'three choices with monthly prices');
  await page.click('.trial-ended button:has-text("Stay on Free")');
  await page.waitForTimeout(1500);
  await shot('after-ended-frozen');
  say(!(await page.$('.trial-ended')) && !!(await page.$('.frozen-banner')), 'then the frozen banner as before');
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(2500);
  say(!(await page.$('.trial-ended')), 'the ending screen shows once');
  await page.click('.nav-link[href="#/study"] >> visible=true').catch(() => undefined);
  await page.waitForTimeout(1200);
  await shot('used-study-locked');
  say(!/Try everything free|Try it free/.test(await text('main')) && /Get Max/.test(await text('main')), 'once used, the offer turns into normal upgrade wording');
  await ctx.close();

  // ---- 2. A new student who picks Free.
  const f = await newUser();
  const ctx2 = await browser.newContext({ ...device, colorScheme: scheme, reducedMotion: 'reduce' });
  await prep(ctx2);
  await ctx2.addInitScript(() => { window.open = () => null; });
  const p2 = await ctx2.newPage();
  await signIn(p2, f);
  await p2.waitForSelector('.story', { timeout: 10000 }).catch(() => undefined);
  await p2.click('.story-skip');
  say(!!(await p2.$('.plan-offer')), 'Skip goes straight to the trial screen');
  await p2.click('.plan-offer button:has-text("Continue with Free instead.")');
  await p2.waitForTimeout(800);
  await shot('free-syllabus-step', p2);
  say(/Add your classes from their syllabi/.test(await text('.onboard', p2)) && /You're on Free/.test(await text('.onboard', p2)), 'Free: straight to adding classes from syllabi, and says the plan');
  say(!(await profile(f.id)).trial_started_at, 'choosing Free starts nothing');
  await p2.click('.onboard button:has-text("Skip for now")');
  await p2.waitForTimeout(1200);
  // A class by hand so Now has something (the free path's own way in).
  await p2.evaluate(() => { const d = JSON.parse(localStorage.getItem('school-dashboard:v1')); d.courses.push({ id: 'c-free', code: 'CHM-113', name: 'General Chemistry I', color: '#e0632e', meetings: [], online: false, instructors: [], updatedAt: new Date().toISOString() }); d.items.push({ id: 'i-free', courseId: 'c-free', title: 'Chem homework', label: 'Chem homework', type: 'homework', dueAt: new Date(Date.now() + 2 * 86_400_000).toISOString(), points: 20, status: 'todo', estimatedMinutes: 60, flags: {}, source: 'manual', updatedAt: new Date().toISOString() }); localStorage.setItem('school-dashboard:v1', JSON.stringify(d)); });
  await p2.reload({ waitUntil: 'load' });
  await p2.waitForTimeout(2500);
  await shot('free-now', p2);
  say(/Try everything free for 7 days\. No card\./.test(await text('.trial-quiet', p2)), 'Free Now: one quiet offer line');
  say(!(await p2.$('.trial-chip')), 'no trial chip on Free');
  await p2.click('.topbar-sync').catch(() => undefined);
  await p2.waitForTimeout(1000);
  await shot('free-sync-button', p2);
  say(/Try everything free for 7 days/.test(await text('body', p2)), 'the Sync button offers the trial');
  await p2.keyboard.press('Escape');
  await p2.goto(`${BASE}#/study`, { waitUntil: 'load' });
  await p2.waitForTimeout(1500);
  await shot('free-study-locked', p2);
  say(/Try everything free for 7 days/.test(await text('main', p2)), 'locked features offer the trial');
  await p2.goto(`${BASE}#/you?s=plan`, { waitUntil: 'load' });
  await p2.waitForTimeout(1500);
  await shot('free-you', p2);
  say(/Try everything free for 7 days/.test(await text('main', p2)), 'You offers the trial');
  // Start it later, from anywhere: here, from You.
  await p2.click('main button:has-text("Start my free week")');
  await p2.waitForTimeout(2500);
  say(!!(await profile(f.id)).trial_started_at, 'a Free student can start the trial later from You');
  await ctx2.close();

  // ---- The landing.
  const ctx3 = await browser.newContext({ ...device, colorScheme: scheme, reducedMotion: 'reduce' });
  await prep(ctx3);
  const p3 = await ctx3.newPage();
  await p3.goto(BASE, { waitUntil: 'load' });
  await p3.waitForTimeout(1500);
  await shot('landing', p3);
  say(/Try everything free for 7 days\. No card\./.test(await text('body', p3)) && !/from the moment you sign up/.test(await text('body', p3)), 'the landing says the trial is chosen');
  await ctx3.close();
  if (errors.length) say(false, `page errors: ${errors.slice(0, 2).join(' | ')}`);
};
try {
  const IPAD_SAFARI = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15';
  const IPAD_CHROME = 'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0.6723.90 Mobile/15E148 Safari/604.1';
  const ipad = (ua) => ({ ...devices['iPad Pro 11'], userAgent: ua, viewport: { width: 834, height: 1194 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  const combos = [['desk', { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 }], ['phone', { ...devices['iPhone 14'], deviceScaleFactor: 2 }], ['ipad-safari', ipad(IPAD_SAFARI)], ['ipad-chrome', ipad(IPAD_CHROME)]];
  for (const [name, device] of combos) for (const scheme of ['light', 'dark']) if (!ONLY || ONLY.includes(`${name}-${scheme}`)) { console.log(`--- ${name}-${scheme}`); await run(name, device, scheme); }
} finally {
  await browser.close();
  for (const id of made) {
    for (const t of ['courses', 'items', 'settings', 'usage_log', 'usage_events', 'read_ledger', 'announcements', 'onboarding_events', 'notification_plan']) await admin.from(t).delete().eq('user_id', id);
    await admin.auth.admin.deleteUser(id);
  }
  console.log(`removed ${made.length} throwaways`);
}
console.log(checks.every(Boolean) ? 'PASS' : 'FAIL');
process.exit(checks.every(Boolean) ? 0 : 1);
