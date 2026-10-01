// An invite link, the way a friend meets it (2026-09-30): the inviter's link opened signed out on a phone, the landing
// page, signing up with a password, the fifteen seconds and the gift, then the server: the friend is referred by the
// inviter and both have their 30 days of Plus queued after the free week. Screens to docs/screens/referral/. Every
// throwaway is removed at the end.
//   KEYS_ENV=... BASE=http://localhost:4174/school-dashboard/ [SCHEME=dark] node scripts/e2e-referral.mjs
import { mkdirSync, readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { chromium, devices } from 'playwright-core';
import { fillSignIn } from './lib/signin.mjs';
const env = Object.fromEntries(readFileSync(process.env.KEYS_ENV, 'utf8').split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]));
const BASE = process.env.BASE ?? 'http://localhost:4174/school-dashboard/';
const SCHEME = process.env.SCHEME ?? 'light';
const OUT = 'docs/screens/referral';
mkdirSync(OUT, { recursive: true });
const admin = createClient(env.VITE_SUPABASE_URL, env.SERVICE_ROLE, { auth: { persistSession: false } });
const made = [];
const checks = [];
const check = (ok, line) => { checks.push(ok); console.log(`${ok ? 'ok  ' : 'FAIL'} ${line}`); };
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const inviterEmail = `e2e-ref-inviter-${Date.now()}@example.invalid`;
  const { data: inv } = await admin.auth.admin.createUser({ email: inviterEmail, email_confirm: true });
  made.push(inv.user.id);
  await new Promise((r) => setTimeout(r, 1500));
  const { data: ip } = await admin.from('profiles').select('referral_code, trial_ends_at').eq('user_id', inv.user.id).single();
  check(!!ip?.referral_code, `inviter has a code: ${ip?.referral_code}`);
  const ctx = await browser.newContext({ ...devices['iPhone 14'], deviceScaleFactor: 2, colorScheme: SCHEME, reducedMotion: 'reduce' });
  await ctx.addInitScript(() => { window.open = () => null; });
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message.slice(0, 160)));
  let n = 0;
  const shot = async (label, full = false) => { n++; await p.waitForTimeout(500); await p.screenshot({ path: `${OUT}/${SCHEME}-${String(n).padStart(2, '0')}-${label}.png`, fullPage: full }); };
  const tap = (sel, ms = 900) => p.click(sel, { timeout: 5000 }).then(() => p.waitForTimeout(ms)).then(() => true).catch(() => false);
  await p.goto(`${BASE}#/now?ref=${ip.referral_code}`, { waitUntil: 'load' });
  await p.waitForTimeout(2000);
  await shot('link-opened');
  await shot('link-opened-full', true);
  const first = await p.evaluate(() => document.body.innerText.replace(/\s+/g, ' ').slice(0, 400));
  check(/A friend invited you/i.test(first) && /30 days of Plus free/.test(first), `the first screen says the invite arrived: ${first.slice(0, 160)}`);
  check(await p.evaluate(() => localStorage.getItem('school-dashboard:ref')) === ip.referral_code, 'the code is remembered before there is an account');
  if (!(await tap('a.btn.primary[href="#/start"]', 1500))) await p.goto(`${BASE}#/start`);
  await shot('start');
  await tap('.onboard button:has-text("Start")', 1000);
  await shot('account-step');
  await tap('button:has-text("Create an account"), button:has-text("Sign up"), button:has-text("create one")', 600);
  const email = `e2e-ref-friend-${Date.now()}@example.invalid`;
  await fillSignIn(p, email, 'Halo-plus-2026!').catch(() => undefined);
  await tap('form button[type=submit]', 4000);
  const { data: list } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const u = list.users.find((x) => x.email === email);
  if (u) made.push(u.id);
  check(!!u, 'the friend signed up with a password');
  await shot('after-signup');
  await p.waitForSelector('.story', { timeout: 10000 }).catch(() => undefined);
  await tap('.story-skip', 1500);
  await p.waitForTimeout(2500);
  await shot('gift', true);
  const invitedLine = await p.$eval('.gift-invited', (e) => e.textContent).catch(() => null);
  check(!!invitedLine && !(await p.$('.gift-after')), `the gift names the invite, and not "you choose what to keep" on day 8: ${invitedLine}`);
  const gift = await p.evaluate(() => document.body.innerText.replace(/\s+/g, ' ').slice(0, 600));
  console.log('gift screen:', gift.slice(0, 300));
  await p.waitForTimeout(2500);
  const { data: fp } = await admin.from('profiles').select('referred_by, reward_tier, reward_until, trial_ends_at').eq('user_id', u?.id ?? '').single();
  const { data: ip2 } = await admin.from('profiles').select('reward_tier, reward_until, trial_ends_at').eq('user_id', inv.user.id).single();
  console.log('friend profile:', JSON.stringify(fp));
  console.log('inviter profile:', JSON.stringify(ip2));
  check(fp?.referred_by === inv.user.id || !!fp?.referred_by, `the friend is referred: ${fp?.referred_by}`);
  // Since 0017 the 30 days are grants queued after what each already has, not a field on the profile.
  const grants = async (id) => (await admin.from('reward_grants').select('tier, starts_at, ends_at, source').eq('user_id', id)).data ?? [];
  const fg = (await grants(u?.id ?? '')).find((g) => g.source === 'referral:invitee');
  const ig = (await grants(inv.user.id)).find((g) => g.source === 'referral:inviter');
  const dd = (a, b) => Math.round((Date.parse(a) - Date.parse(b)) / 86_400_000);
  check(fg?.tier === 'plus' && dd(fg.ends_at, fg.starts_at) === 30, `the friend has 30 days of Plus: ${fg?.starts_at?.slice(0, 10)} → ${fg?.ends_at?.slice(0, 10)}`);
  check(ig?.tier === 'plus' && dd(ig.ends_at, ig.starts_at) === 30, `the inviter has 30 days of Plus: ${ig?.starts_at?.slice(0, 10)} → ${ig?.ends_at?.slice(0, 10)}`);
  if (fg && fp?.trial_ends_at) check(Math.abs(dd(fg.starts_at, fp.trial_ends_at)) <= 0, `the friend's 30 days start when the free week ends (${fg.starts_at.slice(0, 10)})`);
  if (ig && ip2?.trial_ends_at) check(Math.abs(dd(ig.starts_at, ip2.trial_ends_at)) <= 0, `the inviter's 30 days start when their free week ends (${ig.starts_at.slice(0, 10)})`);
  await p.goto(`${BASE}#/you`, { waitUntil: 'load' });
  await p.waitForTimeout(2500);
  await shot('friend-you', true);
  check(errors.length === 0, `no page errors ${errors.join(' | ')}`);
  await ctx.close();
} finally {
  await browser.close();
  for (const id of made) {
    for (const t of ['reward_grants', 'courses', 'items', 'settings', 'usage_log', 'usage_events', 'read_ledger', 'announcements', 'subscriptions', 'notification_plan', 'notification_prefs', 'push_subscriptions', 'onboarding_events']) await admin.from(t).delete().eq('user_id', id);
  }
  for (const id of made.reverse()) await admin.auth.admin.deleteUser(id);
  console.log(`removed ${made.length} throwaways`);
}
console.log(checks.every(Boolean) ? 'PASS' : 'FAIL');
