// The market sign-up (George, 2026-10-08): a visitor's phone scans the QR code, lands on haloplus.app/market, which
// opens sign-up with the source remembered; a brand-new account, the free week running; the gift; then "Finish setup
// on your laptop" with the email queued; "Got it" lands on Now. A second visitor without a laptop takes "Set up on this
// phone" into the phone steps. On the server: profiles.signup_source = 'market', one market_setup row in the outbox,
// and Admin's Growth counts them. Real backend, throwaway accounts (made through the real sign-up form), removed after.
//   KEYS_ENV=... [BASE=http://localhost:4174/school-dashboard/] node scripts/e2e-market.mjs
import { mkdirSync, readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { chromium, devices } from 'playwright-core';
import { personaKit } from './lib/personas.mjs';

const env = Object.fromEntries(readFileSync(process.env.KEYS_ENV, 'utf8').split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]));
const BASE = process.env.BASE ?? 'http://localhost:4174/school-dashboard/';
const OUT = 'docs/screens/market';
mkdirSync(OUT, { recursive: true });
const ref = new URL(env.VITE_SUPABASE_URL).hostname.split('.')[0];
const db = createClient(env.VITE_SUPABASE_URL, env.SERVICE_ROLE, { auth: { persistSession: false } });
const kit = personaKit(env);
const checks = [];
const check = (ok, line) => { checks.push(ok); console.log(`${ok ? 'ok  ' : 'FAIL'} ${line}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const text = async (p, sel) => (await p.locator(sel).first().innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
const made = [];
const removeMade = async () => {
  let n = 0;
  for (const email of made) {
    const { data } = await db.auth.admin.listUsers({ page: 1, perPage: 200 });
    const u = data?.users?.find((x) => x.email === email);
    if (!u) continue;
    for (const t of ['email_outbox', 'onboarding_events', 'settings', 'courses', 'items', 'usage_events', 'notification_prefs', 'notification_plan']) await db.from(t).delete().eq('user_id', u.id);
    await db.auth.admin.deleteUser(u.id);
    n++;
  }
  return n;
};

/** The whole phone sign-up, from the QR address to the hand-off screen. */
async function signUp(browser, device, tag) {
  const email = `e2e-audit-market-${Date.now()}-${tag}@example.invalid`;
  made.push(email);
  const ctx = await browser.newContext({ ...device, colorScheme: 'light' });
  await ctx.route('**/functions/v1/report', (r) => r.fulfill({ status: 200, body: '{}' }));
  const p = await ctx.newPage();
  // The QR code: /market → #/start?src=market.
  await p.goto(`${BASE}market/`, { waitUntil: 'load' });
  await p.waitForURL(/#\/start\?src=market/, { timeout: 15000 });
  await p.waitForSelector('.signin[data-step="email"]', { timeout: 30000 });
  const t0 = Date.now();
  await p.fill('.signin input[name="email"]', email);
  await p.click('.signin button[type="submit"]');
  await p.waitForSelector('.signin[data-step="password"]', { timeout: 15000 });
  await p.fill('.signin input[name="password"]', 'market-pass-2026');
  await p.click('.signin button[type="submit"]');
  await p.waitForSelector('.gift', { timeout: 30000 });
  const gift = await text(p, '.gift');
  await p.click('.gift .offer-go');
  await p.waitForSelector('.market-handoff', { timeout: 30000 });
  const secs = (Date.now() - t0) / 1000;
  return { ctx, p, email, gift, secs };
}

const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  // Visitor 1: an iPhone, with a laptop at home.
  {
    const { ctx, p, email, gift, secs } = await signUp(browser, devices['iPhone 14'], 'a');
    check(/Max free for 7 days/.test(gift), `the gift, no card: "${gift.slice(0, 60)}…"`);
    const hand = await text(p, '.market-handoff');
    check(/Finish setup on your laptop\./.test(hand) && /haloplus\.app/.test(hand) && /add the extension/.test(hand), `the hand-off: "${hand.slice(0, 120)}…"`);
    check(new RegExp(`We emailed you the link at ${email.replace(/\./g, '\\.')}`).test(hand), 'says the email went to their address');
    check(secs < 20, `email to hand-off in ${secs.toFixed(1)} s (under 20)`);
    await sleep(1500);
    await p.screenshot({ path: `${OUT}/1-handoff-phone.png` });
    await sleep(1500);
    const { data: u } = await db.auth.admin.listUsers({ page: 1, perPage: 200 });
    const user = u.users.find((x) => x.email === email);
    const { data: prof } = await db.from('profiles').select('signup_source, trial_started_at, trial_ends_at').eq('user_id', user.id).single();
    check(prof?.signup_source === 'market', `profile: source = ${prof?.signup_source}`);
    check(!!prof?.trial_ends_at && Date.parse(prof.trial_ends_at) > Date.now() + 6 * 864e5, `the free week is running (ends ${prof?.trial_ends_at?.slice(0, 10)})`);
    const { data: box } = await db.from('email_outbox').select('kind, to_email, sent_at').eq('user_id', user.id);
    check(box?.length === 1 && box[0].kind === 'market_setup' && box[0].to_email === email, `one market_setup email queued for ${box?.[0]?.to_email}`);
    await p.click('.market-handoff button:has-text("Got it")');
    await p.waitForSelector('.now, .connect-halo', { timeout: 30000 });
    await sleep(1500);
    check(/#\/now/.test(p.url()) && (await p.locator('.onboard').count()) === 0, 'Got it: on Now, onboarding closed');
    await p.screenshot({ path: `${OUT}/2-now-after-phone.png` });
    await ctx.close();
  }
  // Visitor 2: an Android phone, no laptop nearby.
  {
    const { ctx, p } = await signUp(browser, devices['Pixel 7'], 'b');
    await p.click('.market-handoff .market-here');
    await p.waitForSelector('.onboard [aria-label="Copy the bookmark"], .onboard-step', { timeout: 15000 });
    await sleep(800);
    const ob = await text(p, '.onboard');
    check(/Copy|bookmark/i.test(ob) && (await p.locator('.market-handoff').count()) === 0, `no laptop: the phone's own sync steps ("${ob.slice(0, 80)}…")`);
    await p.screenshot({ path: `${OUT}/3-phone-steps.png` });
    await ctx.close();
  }
  // A laptop scanning the same address: no hand-off, the extension setup as usual.
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } });
    await ctx.route('**/functions/v1/report', (r) => r.fulfill({ status: 200, body: '{}' }));
    const p = await ctx.newPage();
    const email = `e2e-audit-market-${Date.now()}-c@example.invalid`;
    made.push(email);
    await p.goto(`${BASE}market/`, { waitUntil: 'load' });
    await p.waitForSelector('.signin[data-step="email"]', { timeout: 30000 });
    await p.fill('.signin input[name="email"]', email);
    await p.click('.signin button[type="submit"]');
    await p.waitForSelector('.signin[data-step="password"]', { timeout: 15000 });
    await p.fill('.signin input[name="password"]', 'market-pass-2026');
    await p.click('.signin button[type="submit"]');
    await p.waitForSelector('.gift', { timeout: 30000 });
    await p.click('.gift .offer-go');
    await sleep(2000);
    check((await p.locator('.market-handoff').count()) === 0 && /Connect Halo|Add to Chrome|bookmark/i.test(await text(p, '.onboard')), 'a laptop: straight to its own Halo setup, no hand-off');
    await ctx.close();
  }
  // Admin's Growth counts them (the throwaways are test accounts, so the count comes from the function's own query).
  {
    const admin = await kit.persona('admin');
    const { data: g } = await db.rpc('admin_growth').then(async () => ({ data: null })).catch(() => ({ data: null }));
    void g;
    const c = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
    await c.auth.setSession({ access_token: admin.session.access_token, refresh_token: admin.session.refresh_token });
    const { data: growth, error } = await c.rpc('admin_growth');
    check(!error && growth?.market && typeof growth.market.total === 'number' && typeof growth.market.emails_waiting === 'number', `admin_growth carries the market block: ${JSON.stringify(growth?.market ?? error?.message)}`);
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } });
    await ctx.addInitScript(({ ses, key }) => { if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(ses)); }, { ses: admin.session, key: `sb-${ref}-auth-token` });
    await ctx.route('**/functions/v1/report', (r) => r.fulfill({ status: 200, body: '{}' }));
    const p = await ctx.newPage();
    await p.goto(`${BASE}#/admin`, { waitUntil: 'load' });
    await p.waitForSelector('.growth-market', { timeout: 30000 });
    check(/From the market \(QR code\): \d+ students?, \d+ this week · laptop emails: \d+ sent/.test(await text(p, '.growth-market')), `Admin: "${await text(p, '.growth-market')}"`);
    await p.locator('.admin-growth').screenshot({ path: `${OUT}/4-admin-growth.png` });
    await ctx.close();
  }
} finally {
  await browser.close();
  console.log(`removed ${await removeMade()} sign-ups and ${await kit.cleanup()} throwaways`);
}
console.log(checks.every(Boolean) ? 'PASS' : 'FAIL');
