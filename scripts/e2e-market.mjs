// The market sign-up (George, 2026-10-08; setup as it is since Loop 245): a visitor's phone scans the QR code, lands on
// haloplus.app/market, which opens sign-up with the source remembered; a brand-new account; the phone's step is "Finish
// on your laptop in 2 minutes" with Email me the link (one email, to their address) and the phone's own setup one tap
// away. A laptop goes straight to Connect Halo. On the server: profiles.signup_source = 'market', and Admin's Growth
// counts them. Real backend, throwaway accounts (made through the real sign-up form), removed after.
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
const hard = setTimeout(() => { console.log('HARD TIMEOUT'); process.exit(3); }, 480000);
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
  await p.waitForSelector('.onboard', { timeout: 30000 });
  await p.waitForFunction(() => /Finish on your laptop|Connect Halo/.test(document.querySelector('.onboard')?.innerText ?? ''), null, { timeout: 30000 }).catch(() => undefined);
  const secs = (Date.now() - t0) / 1000;
  if (process.env.TRACE) console.log('  form:', await text(p, '.signin'), '| error:', await text(p, '.signin-error'));
  return { ctx, p, email, secs };
}

const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  // Visitor 1: an iPhone, with a laptop at home.
  {
    const { ctx, p, email, secs } = await signUp(browser, devices['iPhone 14'], 'a');
    const step = await text(p, '.onboard');
    check(/Finish on your laptop in 2 minutes\./.test(step) && /Email me the link/.test(step) && /Set up on this phone instead/.test(step), `the phone's step: "${step.slice(0, 120)}…"`);
    check(!/\$\d|free trial|No card/i.test(step), 'no price or trial talk before the first sync');
    check(secs < 25, `email to the laptop step in ${secs.toFixed(1)} s`);
    await p.screenshot({ path: `${OUT}/1-handoff-phone.png` });
    await p.locator('.onboard button:has-text("Email me the link")').click();
    await sleep(3000);
    const { data: u } = await db.auth.admin.listUsers({ page: 1, perPage: 200 });
    const user = u.users.find((x) => x.email === email);
    const { data: prof } = await db.from('profiles').select('signup_source').eq('user_id', user.id).single();
    check(prof?.signup_source === 'market', `profile: source = ${prof?.signup_source}`);
    const { data: box } = await db.from('email_outbox').select('kind, to_email').eq('user_id', user.id);
    check(box?.length === 1 && box[0].to_email === email, `one email with the link, to ${box?.[0]?.to_email} (${box?.[0]?.kind})`);
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
    await p.waitForSelector('.onboard', { timeout: 30000 });
    await sleep(2000);
    check(/Connect Halo|Add to Chrome|bookmark/i.test(await text(p, '.onboard')) && !/Finish on your laptop/.test(await text(p, '.onboard')), 'a laptop: straight to its own Halo setup, no hand-off');
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
} catch (e) {
  checks.push(false);
  console.log('ERROR', e.message.split('\n')[0]);
} finally {
  await browser.close();
  console.log(`removed ${await removeMade()} sign-ups and ${await kit.cleanup()} throwaways`);
}
clearTimeout(hard);
console.log(checks.every(Boolean) ? 'PASS' : 'FAIL');
process.exit(checks.every(Boolean) ? 0 : 1);
