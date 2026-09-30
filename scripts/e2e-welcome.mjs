// The welcome week (2026-09-29), on the real backend with brand-new throwaway accounts: the automatic gift, the
// fifteen seconds into the gift screen, Connect Halo, the payoff with a clear invite, the morning-note question, the
// Home Screen on phones, every invite spot, the fast-forward to day
// 3 (invite card, the morning-note question once more), 2 days left, the last day and the end (with the invite as a
// fourth option); then a student arriving through an invite link (the gift, then Plus from the friend). Desktop,
// phone, iPad Safari and iPad Chrome, light and dark. Screens to docs/screens/welcome/<device>-<scheme>/.
//   KEYS_ENV=... BASE=http://localhost:4174/school-dashboard/ node scripts/e2e-welcome.mjs
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
  const email = `e2e-welcome-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@example.invalid`;
  const { data } = await admin.auth.admin.createUser({ email, email_confirm: true });
  made.push(data.user.id);
  const { data: link } = await admin.auth.admin.generateLink({ type: 'magiclink', email });
  const c = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data: s } = await c.auth.verifyOtp({ token_hash: link.properties.hashed_token, type: 'magiclink' });
  return { id: data.user.id, session: s.session };
};
const profile = async (id) => (await admin.from('profiles').select('tier, trial_started_at, trial_ends_at, referral_code, referred_by').eq('user_id', id).single()).data;
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
const DAY = 86_400_000;
const run = async (name, device, scheme) => {
  const OUT = `docs/screens/welcome/${name}-${scheme}`;
  mkdirSync(OUT, { recursive: true });
  const main = scheme === 'light';
  const say = (ok, line) => (main ? check(ok, `${name}: ${line}`) : ok || console.log(`note ${name}-${scheme}: ${line}`));
  const prep = async (c) => {
    if (name.startsWith('ipad')) await c.addInitScript(() => { Object.defineProperty(navigator, 'maxTouchPoints', { get: () => 5 }); Object.defineProperty(navigator, 'platform', { get: () => (/CriOS/.test(navigator.userAgent) ? 'iPad' : 'MacIntel') }); });
    // Record what the share sheet would get (phones have navigator.share; desktop copies instead).
    await c.addInitScript(() => { window.open = () => null; window.__shared = null; if (/iPhone|Android|iPad|Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 0) navigator.share = async (d) => { window.__shared = d; }; });
  };
  let n = 0;
  const ctx = await browser.newContext({ ...device, colorScheme: scheme, reducedMotion: 'reduce', permissions: ['clipboard-read', 'clipboard-write'] });
  await prep(ctx);
  const page = await ctx.newPage();
  const shot = async (label, p = page) => { n += 1; await p.waitForTimeout(450); await p.screenshot({ path: `${OUT}/${String(n).padStart(2, '0')}-${label}.png` }); };
  const text = (sel, p = page) => p.$eval(sel, (e) => e.innerText.replace(/\s+/g, ' ').trim()).catch(() => '');
  const signIn = async (p, u, hash = '#/now') => {
    await p.goto(`${BASE}${hash}`, { waitUntil: 'load' });
    await p.waitForTimeout(1200);
    await p.evaluate(() => localStorage.setItem('school-dashboard:onboard-wait-ms', '1500'));
    await p.click('.onboard button:has-text("Start")').catch(() => undefined);
    await p.waitForTimeout(500);
    await p.evaluate(({ s, key }) => localStorage.setItem(key, JSON.stringify(s)), { s: u.session, key: `sb-${ref}-auth-token` });
    await p.reload({ waitUntil: 'load' });
    await p.waitForTimeout(3000);
  };

  // ---- A new student.
  const u = await newUser();
  const p0 = await profile(u.id);
  say(p0.trial_started_at && new Date(p0.trial_ends_at).getTime() - Date.now() > 6.9 * DAY, 'the account has Max for 7 days from sign-up, before anything is pressed');
  await signIn(page, u);
  await page.waitForSelector('.story', { timeout: 10000 }).catch(() => undefined);
  say(!!(await page.$('.story')), 'the fifteen seconds still play');
  await page.click('.story-skip');
  await page.waitForSelector('.gift', { timeout: 5000 }).catch(() => undefined);
  await shot('gift');
  const gift = await text('.gift');
  say(/^🎁 You've got Max free for 7 days\./.test(gift) || /You've got Max free for 7 days\./.test(gift), 'the gift screen: "You\'ve got Max free for 7 days."');
  say(/No card\. Nothing to cancel\. Nothing charges\./.test(gift), 'bold under it: no card, nothing to cancel, nothing charges');
  say(['Pulls every class, assignment, and grade from Halo', 'Reads your announcements so you never miss hidden work', 'Tells you what to do next', 'Builds study plans and practice worksheets for your quizzes', 'Answers questions about your own classes', 'Pick your own color'].every((l) => gift.includes(l)), 'the six Max lines, each with its icon');
  say(/After 7 days you choose what to keep\. Free stays free\./.test(gift) && /Connect Halo$/.test(gift), 'the bottom line and one big button: Connect Halo');
  say(!/Continue with Free|Start my free week/.test(gift), 'no choice to make');
  await page.click('.gift .offer-go');
  await page.waitForTimeout(800);
  say(!!(await page.$('.onboard [aria-label="Show your bookmarks bar"], .onboard [aria-label="Drag the bookmark"], .onboard [aria-label="Copy the bookmark"], .onboard .ipad-step')), 'Connect Halo goes straight into connecting Halo');
  await page.evaluate((pl) => window.dispatchEvent(new MessageEvent('message', { origin: 'https://halo.gcu.edu', data: pl, source: window })), payload());
  await page.waitForSelector('.onboard-payoff', { timeout: 15000 }).catch(() => undefined);
  await page.waitForTimeout(1500);
  await shot('payoff-invite');
  say(!!(await page.$('.payoff-invite .invite-btn')), 'the payoff has a clear Invite a friend button');
  await page.click('.onboard button:has-text("Start here")');
  await page.waitForSelector('.comeback', { timeout: 5000 }).catch(() => undefined);
  await shot('notify-ask');
  say(/Want a morning note with what to do today\?/.test(await text('.comeback')), 'then: "Want a morning note with what to do today?"');
  await page.click('.comeback button:has-text("Not now")');
  await page.waitForTimeout(600);
  if (name === 'phone' || name.startsWith('ipad')) {
    await shot('home-screen');
    const hs = await text('.comeback');
    say(/Add Halo\+ to your Home Screen/.test(hs) && !!(await page.$('.comeback .tp [data-hot="true"]')), 'on a phone or iPad: Add Halo+ to your Home Screen, with a picture');
    await page.click('.comeback .onboard-big');
    await page.waitForTimeout(600);
  }
  await page.click('.tour-tip button:has-text("Skip")').catch(() => undefined);
  await page.waitForTimeout(600);
  await page.waitForSelector('.upgrade', { timeout: 6000 }).catch(() => undefined);
  await page.click('.upgrade button:has-text("Skip")', { timeout: 4000 }).catch(() => undefined);
  await page.waitForTimeout(1200);
  await page.goto(`${BASE}#/now`, { waitUntil: 'load' });
  await page.waitForTimeout(1500);
  say(!(await page.$('.welcome-list')) && !/Get the most out of your week/i.test(await text('.now')), 'no checklist card on Now (removed 2026-09-30)');
  const chip = await text('.trial-chip');
  say(/^Max · 7 days( left)?$/.test(chip), `the chip: "${chip}"`);
  await page.click('.trial-chip');
  await page.waitForTimeout(500);
  await shot('chip-sheet-invite');
  say(/Invite a friend and you both get Plus free for 30 days\./.test(await text('.trial-sheet')) && /none is wasted/.test(await text('.trial-sheet')), 'the chip sheet carries the invite and its rule');
  await page.keyboard.press('Escape');
  await page.goto(`${BASE}#/you`, { waitUntil: 'load' });
  await page.waitForTimeout(1500);
  await shot('you-top-invite');
  say(!!(await page.$('.you-invite-top .invite-btn')), 'the top of You: the invite, not buried');
  await page.bringToFront();
  await page.click('.you-invite-top .invite-btn');
  await page.waitForTimeout(800);
  const said = await text('.you-invite-top .invite-said');
  const sent = await page.evaluate(async () => window.__shared ?? { clip: await navigator.clipboard.readText().catch(() => '') });
  const msg = sent.text ? `${sent.text} ${sent.url}` : sent.clip;
  say((sent.text || /Copied/.test(said)) && /I've been using Halo\+ for Halo, it reads your announcements and tells you what's due\. We both get Plus free for 30 days with my link: \S+#\/start\?ref=[a-f0-9]+/.test(msg ?? ''), `${sent.text ? 'the share sheet opens with' : 'the message is copied'}: "${(msg ?? '').slice(0, 70)}…"`);
  // ---- Day 3: the invite card; the morning note asked once more.
  await admin.from('profiles').update({ trial_started_at: new Date(Date.now() - 3.2 * DAY).toISOString(), trial_ends_at: new Date(Date.now() + 3.8 * DAY).toISOString() }).eq('user_id', u.id);
  await page.evaluate(() => { const d = JSON.parse(localStorage.getItem('school-dashboard:v1')); d.settings.notifyAsk = { declinedAt: new Date(Date.now() - 25 * 3600000).toISOString(), asks: 1 }; d.settings.updatedAt = new Date().toISOString(); localStorage.setItem('school-dashboard:v1', JSON.stringify(d)); });
  await page.goto(`${BASE}#/now`, { waitUntil: 'load' });
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(3000);
  await page.locator('.invite-now').scrollIntoViewIfNeeded().catch(() => undefined);
  await shot('day3-invite-card');
  say(/Know someone in your classes\? You both get Plus free for 30 days\./.test(await text('.invite-now')), 'day 3: the invite card on Now');
  say(/Want a morning note/.test(await text('.notify-reask')), 'day 2 on: the morning note asked once more');
  await page.click('.notify-reask button:has-text("No thanks")');
  await page.click('.invite-now .welcome-x');
  await page.waitForTimeout(600);
  say(!(await page.$('.notify-reask')) && !(await page.$('.invite-now')), 'both go away when answered or put away');
  // ---- Fast-forward: 2 days left, the last day, the end.
  const setEnd = async (ms) => {
    await admin.from('profiles').update({ trial_started_at: new Date(Date.now() + ms - 7 * DAY).toISOString(), trial_ends_at: new Date(Date.now() + ms).toISOString() }).eq('user_id', u.id);
    await page.goto(`${BASE}#/now`, { waitUntil: 'load' });
    await page.reload({ waitUntil: 'load' });
    await page.waitForTimeout(3000);
  };
  await setEnd(1.5 * DAY);
  await page.locator('.trial-receipts').scrollIntoViewIfNeeded().catch(() => undefined);
  await shot('two-days-left');
  say(/ends in 2 days/i.test(await text('.trial-receipts')) && /Keep Max/.test(await text('.trial-receipts')) && /Invite a friend/.test(await text('.trial-receipts')), 'two days left: the reminder, the choices and the invite');
  await setEnd(3600_000);
  await page.locator('.trial-receipts').scrollIntoViewIfNeeded().catch(() => undefined);
  await shot('last-day');
  say(/Last day/i.test(await text('.trial-receipts')) && /last day/.test(await text('.trial-chip')), 'the last day: the reminder and the chip');
  await setEnd(-3600_000);
  await page.waitForSelector('.trial-ended', { timeout: 8000 }).catch(() => undefined);
  await shot('trial-end');
  const end = await text('.trial-ended');
  say(/Keep Max/.test(end) && /\$7\.99/.test(end) && /\$4\.99/.test(end) && /Stay on Free/.test(end) && /Cancel anytime/.test(end), 'the end: Max $7.99, Plus $4.99, or stay Free');
  say(/Not ready to pay\? Invite a friend and you both get Plus free for 30 days\./.test(end) && !!(await page.$('.trial-ended .plan-choice-invite .invite-btn')), 'and a fourth option, as prominent as the plans, with the share button right there');
  await page.locator('.plan-choice-invite').scrollIntoViewIfNeeded().catch(() => undefined);
  await shot('trial-end-invite');
  await ctx.close();

  // ---- The landing.
  const ctx3 = await browser.newContext({ ...device, colorScheme: scheme, reducedMotion: 'reduce' });
  const p3 = await ctx3.newPage();
  await p3.goto(BASE, { waitUntil: 'load' });
  await p3.waitForTimeout(1500);
  await p3.locator('.landing-invite').scrollIntoViewIfNeeded().catch(() => undefined);
  await shot('landing-invite', p3);
  say(/Bring a friend, both get a month/.test(await text('.landing-invite', p3)) && /Max free for 7 days/.test(await text('body', p3)), 'the landing explains the gift and the invite');
  await ctx3.close();
};

// ---- A student who arrives through an invite link.
const invited = async (scheme) => {
  const OUT = `docs/screens/welcome/invited-${scheme}`;
  mkdirSync(OUT, { recursive: true });
  const inviter = await newUser();
  await admin.from('profiles').update({ trial_ends_at: new Date(Date.now() - DAY).toISOString() }).eq('user_id', inviter.id);
  const code = (await profile(inviter.id)).referral_code;
  const v = await newUser();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2, colorScheme: scheme, reducedMotion: 'reduce' });
  await ctx.addInitScript(() => { window.open = () => null; });
  const p = await ctx.newPage();
  const text = (sel) => p.$eval(sel, (e) => e.innerText.replace(/\s+/g, ' ').trim()).catch(() => '');
  await p.goto(`${BASE}#/start?ref=${code}`, { waitUntil: 'load' });
  await p.waitForTimeout(1200);
  await p.evaluate(({ s, key }) => localStorage.setItem(key, JSON.stringify(s)), { s: v.session, key: `sb-${ref}-auth-token` });
  await p.reload({ waitUntil: 'load' });
  await p.waitForTimeout(3500);
  await p.click('.story-skip').catch(() => undefined);
  await p.waitForSelector('.gift', { timeout: 6000 }).catch(() => undefined);
  await p.screenshot({ path: `${OUT}/1-gift.png` });
  const main = scheme === 'light';
  const say = (ok, line) => (main ? check(ok, `invited: ${line}`) : ok || console.log(`note invited-${scheme}: ${line}`));
  say(/You've got Max free for 7 days\./.test(await text('.gift')) && /Then 30 days of Plus free, from your friend's invite\./.test(await text('.gift')), 'the gift screen says the Max week comes first, then Plus from the friend');
  const grants = (await admin.from('reward_grants').select('*').eq('user_id', v.id)).data ?? [];
  const pv = await profile(v.id);
  say(pv.referred_by === inviter.id && grants.length === 1 && Math.abs(new Date(grants[0].starts_at) - new Date(pv.trial_ends_at)) < 300_000, 'the invite was claimed: Plus starts when the Max week ends');
  const gi = (await admin.from('reward_grants').select('*').eq('user_id', inviter.id)).data ?? [];
  say(gi.length === 1, 'and the inviter got their month');
  // The Max week ends: Plus from the friend takes over, and the end screen says so.
  await admin.from('profiles').update({ trial_started_at: new Date(Date.now() - 7.1 * DAY).toISOString(), trial_ends_at: new Date(Date.now() - 0.1 * DAY).toISOString() }).eq('user_id', v.id);
  await admin.from('reward_grants').update({ starts_at: new Date(Date.now() - 0.1 * DAY).toISOString(), ends_at: new Date(Date.now() + 29.9 * DAY).toISOString() }).eq('user_id', v.id);
  await p.evaluate(() => { const d = JSON.parse(localStorage.getItem('school-dashboard:v1')); d.settings.onboarding = { startedAt: 'x', step: 'done', doneAt: new Date().toISOString(), skippedAt: null, tourDoneAt: 'x' }; d.settings.upgradeSeen = { plus: 'x', max: 'x' }; localStorage.setItem('school-dashboard:v1', JSON.stringify(d)); });
  await p.goto(`${BASE}#/now`, { waitUntil: 'load' });
  await p.reload({ waitUntil: 'load' });
  await p.waitForSelector('.trial-ended', { timeout: 10000 }).catch(() => undefined);
  await p.screenshot({ path: `${OUT}/2-max-week-over-plus-on.png` });
  say(/Your free week of Max ended\. Plus from your friend is on\./.test(await text('.trial-ended')) && /Plus is free until/.test(await text('.trial-ended')), 'when the Max week ends: "Plus from your friend is on", with the date it runs to');
  await ctx.close();
};

// ---- George's funnel.
const funnel = async (scheme) => {
  const g = await newUser();
  await admin.from('profiles').update({ is_admin: true }).eq('user_id', g.id);
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 }, deviceScaleFactor: 2, colorScheme: scheme });
  const p = await ctx.newPage();
  await p.goto(`${BASE}#/now`, { waitUntil: 'load' });
  await p.evaluate(({ s, key }) => { localStorage.setItem(key, JSON.stringify(s)); localStorage.setItem('school-dashboard:v1', JSON.stringify({ courses: [], items: [], settings: { onboarding: { startedAt: 'x', step: 'done', doneAt: 'x', skippedAt: null, tourDoneAt: 'x' } } })); }, { s: g.session, key: `sb-${ref}-auth-token` });
  await p.goto(`${BASE}#/admin`, { waitUntil: 'load' });
  await p.reload({ waitUntil: 'load' });
  await p.waitForSelector('.admin-funnel .funnel-table', { timeout: 15000 }).catch(() => undefined);
  await p.click('.upgrade button:has-text("Skip")', { timeout: 3000 }).catch(() => undefined);
  await p.locator('.admin-funnel').scrollIntoViewIfNeeded().catch(() => undefined);
  await p.screenshot({ path: `docs/screens/welcome/admin-funnel-${scheme}.png` });
  const t = await p.$eval('.admin-funnel', (e) => e.innerText).catch(() => '');
  if (scheme === 'light') check(['Signed up', 'Synced Halo', 'Turned on notifications', 'Active on day 2', 'Active on day 4', 'Active on day 7', 'Invited a friend', 'Chose a plan at the end'].every((r) => t.includes(r)) && /came through a friend's invite link/.test(t), 'Admin: the new-account funnel, with referral signups');
  await ctx.close();
};

try {
  const IPAD_SAFARI = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15';
  const IPAD_CHROME = 'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0.6723.90 Mobile/15E148 Safari/604.1';
  const ipad = (ua) => ({ ...devices['iPad Pro 11'], userAgent: ua, viewport: { width: 834, height: 1194 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  const combos = [['desk', { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 }], ['phone', { ...devices['iPhone 14'], deviceScaleFactor: 2 }], ['ipad-safari', ipad(IPAD_SAFARI)], ['ipad-chrome', ipad(IPAD_CHROME)]];
  for (const [name, device] of combos) for (const scheme of ['light', 'dark']) if (!ONLY || ONLY.includes(`${name}-${scheme}`)) { console.log(`--- ${name}-${scheme}`); await run(name, device, scheme); }
  for (const scheme of ['light', 'dark']) if (!ONLY || ONLY.includes(`invited-${scheme}`)) { console.log(`--- invited-${scheme}`); await invited(scheme); }
  for (const scheme of ['light', 'dark']) if (!ONLY || ONLY.includes(`admin-${scheme}`)) { console.log(`--- admin-${scheme}`); await funnel(scheme); }
} finally {
  await browser.close();
  for (const id of made) {
    await admin.from('reward_grants').delete().eq('user_id', id);
    await admin.from('referrals').delete().or(`inviter.eq.${id},invitee.eq.${id}`);
    for (const t of ['courses', 'items', 'settings', 'usage_log', 'usage_events', 'read_ledger', 'announcements', 'onboarding_events', 'notification_plan']) await admin.from(t).delete().eq('user_id', id);
    await admin.auth.admin.deleteUser(id);
  }
  console.log(`removed ${made.length} throwaways`);
}
console.log(checks.every(Boolean) ? 'PASS' : 'FAIL');
process.exit(checks.every(Boolean) ? 0 : 1);
