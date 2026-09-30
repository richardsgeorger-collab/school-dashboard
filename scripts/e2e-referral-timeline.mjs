// Referral rewards on the real backend, as timelines (George, 2026-09-30). Fresh throwaway accounts only; every one is
// removed at the end. For each inviter situation a fresh friend signs up (the welcome week starts at sign-up, as for
// everyone) and claims the inviter's code through the real claim_referral, then each account's plan windows are read
// back: the free week, the 30-day Plus credits, and what the plan is today (my_plan, the app's own call).
//   1. friend: 7 days of Max first, Plus the moment the Max week ends; Max today, never Plus instead
//   2. inviter on the free week: Plus after it   3. a second friend: another 30 days after the first (60)
//   4. inviter whose week ended long ago: Plus from now   5. inviter with Max from a friend link: after it
//   6. inviter whose paid plan is set to end: after the paid period   7. inviter paying and renewing: billing pause
//      recorded (the referral-credit function moves Stripe's next charge; not called here: it would touch live Stripe)
//   8. the same code again, and one's own code: refused
//   KEYS_ENV=... node scripts/e2e-referral-timeline.mjs
import { readFileSync } from 'node:fs';
import { mkdirSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { chromium } from 'playwright-core';
const env = Object.fromEntries(readFileSync(process.env.KEYS_ENV, 'utf8').split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]));
const admin = createClient(env.VITE_SUPABASE_URL, env.SERVICE_ROLE, { auth: { persistSession: false } });
const DAY = 86_400_000;
const BASE = process.env.BASE ?? 'http://localhost:4174/school-dashboard/';
const OUT = 'docs/screens/referral';
mkdirSync(OUT, { recursive: true });
const ref = new URL(env.VITE_SUPABASE_URL).hostname.split('.')[0];
let browser = null;
/** The student's own screens: the You page's account card and, on the free week, the trial chip's sheet. */
const screens = async (u, name) => {
  browser ??= await chromium.launch({ channel: 'chrome', headless: true });
  const { data: s } = await u.c.auth.getSession();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1, reducedMotion: 'reduce' });
  const settings = { timezone: tz, onboarding: { startedAt: 'x', step: 'done', doneAt: 'x', skippedAt: null, tourDoneAt: 'x' }, maxOnboarding: { startedAt: 'x', step: 'done', doneAt: 'x' }, upgradeSeen: { plus: 'x', max: 'x' }, notifyAsk: { askedAt: 'x', answer: 'no' } };
  await ctx.addInitScript(({ s, key, settings }) => { if (localStorage.getItem(key)) return; localStorage.setItem(key, JSON.stringify(s)); localStorage.setItem('school-dashboard:v1', JSON.stringify({ courses: [], items: [], settings })); }, { s: s.session, key: `sb-${ref}-auth-token`, settings });
  const page = await ctx.newPage();
  await page.goto(`${BASE}#/you`, { waitUntil: 'load' });
  await page.waitForTimeout(5000);
  const you = await page.$eval('[aria-label="Account"]', (e) => e.innerText.replace(/\s+/g, ' ')).catch(() => '');
  await page.screenshot({ path: `${OUT}/timeline-${name}-you.png` });
  let sheet = '';
  if (await page.$('.trial-chip')) {
    await page.click('.trial-chip');
    await page.waitForTimeout(800);
    sheet = await page.$eval('.trial-sheet', (e) => e.innerText.replace(/\s+/g, ' ')).catch(() => '');
    await page.screenshot({ path: `${OUT}/timeline-${name}-sheet.png` });
  }
  const all = await page.evaluate(() => document.body.innerText.replace(/\s+/g, ' '));
  await ctx.close();
  return { you, sheet, all };
};
const made = [];
const checks = [];
const check = (ok, line) => { checks.push(ok); console.log(`${ok ? 'ok  ' : 'FAIL'} ${line}`); };
const tz = 'America/Phoenix';
const d = (iso) => (iso ? new Date(iso).toLocaleString('en-US', { timeZone: tz, month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—');
const days = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / DAY * 100) / 100;
const user = async (tag) => {
  const email = `e2e-reftl-${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 5)}@example.invalid`;
  const { data } = await admin.auth.admin.createUser({ email, email_confirm: true });
  made.push(data.user.id);
  const { data: link } = await admin.auth.admin.generateLink({ type: 'magiclink', email });
  const c = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  await c.auth.verifyOtp({ token_hash: link.properties.hashed_token, type: 'magiclink' });
  const { data: p } = await admin.from('profiles').select('referral_code').eq('user_id', data.user.id).single();
  return { id: data.user.id, c, code: p.referral_code, tag };
};
const profile = async (u) => (await admin.from('profiles').select('tier, trial_started_at, trial_ends_at, reward_tier, reward_until, referred_by').eq('user_id', u.id).single()).data;
const grants = async (u) => ((await admin.from('reward_grants').select('tier, starts_at, ends_at, source').eq('user_id', u.id).order('starts_at')).data ?? []);
const plan = async (u) => (await u.c.rpc('my_plan')).data;
const timeline = async (u, label) => {
  const p = await profile(u);
  const g = await grants(u);
  const sub = (await admin.from('subscriptions').select('tier, status, current_period_end, cancel_at_period_end').eq('user_id', u.id).maybeSingle()).data;
  console.log(`\n  ${label}   (plan today: ${await plan(u)})`);
  if (p.trial_ends_at) console.log(`    Max free week     ${d(p.trial_started_at)} → ${d(p.trial_ends_at)}`);
  if (p.reward_tier && p.reward_until) console.log(`    ${p.reward_tier === 'max' ? 'Max' : 'Plus'} (friend link)   until ${d(p.reward_until)}`);
  if (sub) console.log(`    Paid ${sub.tier}          ${sub.status}, period ends ${d(sub.current_period_end)}${sub.cancel_at_period_end ? ' (set to end)' : ' (renews)'}`);
  for (const x of g) console.log(`    Plus credit       ${d(x.starts_at)} → ${d(x.ends_at)}  (${days(x.starts_at, x.ends_at)} days, ${x.source})`);
  return { p, g, sub };
};
const claim = async (friend, code) => (await friend.c.rpc('claim_referral', { p_code: code })).data;

try {
  console.log('=== 1-3. inviter on the free week, two friends');
  const inviter = await user('inviter');
  const f1 = await user('friend1');
  const r1 = await claim(f1, inviter.code);
  const t1 = await timeline(f1, 'Friend 1 (signed up through the link)');
  const g1 = t1.g.find((x) => x.source === 'referral:invitee');
  check(r1?.ok, 'friend 1 claimed the invite');
  check(days(t1.p.trial_started_at, t1.p.trial_ends_at) === 7 && (await plan(f1)) === 'max', 'friend 1 has 7 days of Max first, and is on Max today (not Plus)');
  check(!!g1 && Math.abs(Date.parse(g1.starts_at) - Date.parse(t1.p.trial_ends_at)) < 1000 && days(g1.starts_at, g1.ends_at) === 30, 'friend 1: Plus starts the moment the Max week ends, 30 days');
  const f2 = await user('friend2');
  await claim(f2, inviter.code);
  const ti = await timeline(inviter, 'Inviter (on their own free week, 2 friends joined)');
  const [a, b] = ti.g.filter((x) => x.source === 'referral:inviter');
  check(!!a && Math.abs(Date.parse(a.starts_at) - Date.parse(ti.p.trial_ends_at)) < 1000, 'inviter: the first 30 days start when their own Max week ends');
  check(!!b && Math.abs(Date.parse(b.starts_at) - Date.parse(a.ends_at)) < 1000 && days(a.starts_at, b.ends_at) === 60, 'inviter: the second friend adds 30 more right after (60 days, no overlap)');
  await timeline(f2, 'Friend 2');

  console.log('\n=== 4b. what they see');
  const sf = await screens(f1, 'friend');
  const line = /Plus credit: 30 days, starts [A-Z][a-z]{2} \d{1,2} when your Max week ends\./;
  check(line.test(sf.you) && /From your friend's invite/.test(sf.you), `friend, You: "${sf.you.match(/Plus credit:[^.]*\./)?.[0]}"`);
  check(line.test(sf.sheet), `friend, trial sheet: "${sf.sheet.match(/Plus credit:[^.]*\./)?.[0]}"`);
  check(!/go back to Free|only Plus|Plus instead/i.test(sf.all), 'nothing on the friend\'s screens says they only get Plus or go back to Free');
  const si = await screens(inviter, 'inviter');
  check(/Plus credit: 60 days, starts [A-Z][a-z]{2} \d{1,2} when your Max week ends, through [A-Z][a-z]{2} \d{1,2}\./.test(si.you) && /For the friends you invited/.test(si.you), `inviter, You: "${si.you.match(/Plus credit:[^.]*\./)?.[0]}"`);
  check(/Plus credit: 60 days/.test(si.sheet) && /From the friends you invited/.test(si.sheet), `inviter, trial sheet: "${si.sheet.match(/Plus credit:[^.]*\./)?.[0]}"`);

  console.log('\n=== 4. inviter whose free week ended long ago (on Free)');
  const old = await user('old');
  await admin.from('profiles').update({ trial_started_at: new Date(Date.now() - 40 * DAY).toISOString(), trial_ends_at: new Date(Date.now() - 33 * DAY).toISOString() }).eq('user_id', old.id);
  await claim(await user('friend-old'), old.code);
  const to = await timeline(old, 'Inviter on Free');
  const go = to.g.find((x) => x.source === 'referral:inviter');
  check(!!go && Math.abs(Date.parse(go.starts_at) - Date.now()) < 120_000 && (await plan(old)) === 'plus', 'inviter on Free: Plus starts now, and they are on Plus today');
  const so = await screens(old, 'inviter-on-free');
  check(/Plus credit: on now, 30 days left, until [A-Z][a-z]{2} \d{1,2}\./.test(so.you), `inviter on Free, You: "${so.you.match(/Plus credit:[^.]*\./)?.[0]}"`);

  console.log('\n=== 5. inviter with Max from a friend link');
  const gifted = await user('gifted');
  await admin.from('profiles').update({ reward_tier: 'max', reward_until: new Date(Date.now() + 20 * DAY).toISOString(), trial_ends_at: new Date().toISOString() }).eq('user_id', gifted.id);
  await claim(await user('friend-gift'), gifted.code);
  const tg = await timeline(gifted, 'Inviter on a friend link (Max)');
  const gg = tg.g.find((x) => x.source === 'referral:inviter');
  check(!!gg && Math.abs(Date.parse(gg.starts_at) - Date.parse(tg.p.reward_until)) < 1000, 'friend-link inviter: Plus starts when their Max ends, not under it');

  console.log('\n=== 6. inviter whose paid plan is set to end');
  const leaving = await user('leaving');
  const periodEnd = new Date(Date.now() + 12 * DAY).toISOString();
  await admin.from('subscriptions').insert({ user_id: leaving.id, stripe_subscription_id: `sub_test_${Date.now()}_a`, tier: 'max', interval: 'month', status: 'active', current_period_end: periodEnd, cancel_at_period_end: true });
  await admin.from('profiles').update({ tier: 'max', trial_started_at: new Date(Date.now() - 27 * DAY).toISOString(), trial_ends_at: new Date(Date.now() - 20 * DAY).toISOString() }).eq('user_id', leaving.id);
  await claim(await user('friend-leaving'), leaving.code);
  const tl = await timeline(leaving, 'Inviter paying, plan set to end');
  const gl = tl.g.find((x) => x.source === 'referral:inviter');
  check(!!gl && Math.abs(Date.parse(gl.starts_at) - Date.parse(periodEnd)) < 1000, 'inviter whose paid plan ends: Plus starts when the paid period ends');

  console.log('\n=== 7. inviter paying and renewing');
  const paying = await user('paying');
  await admin.from('subscriptions').insert({ user_id: paying.id, stripe_subscription_id: `sub_test_${Date.now()}_b`, tier: 'plus', interval: 'month', status: 'active', current_period_end: new Date(Date.now() + 12 * DAY).toISOString(), cancel_at_period_end: false });
  await admin.from('profiles').update({ tier: 'plus', trial_started_at: new Date(Date.now() - 27 * DAY).toISOString(), trial_ends_at: new Date(Date.now() - 20 * DAY).toISOString() }).eq('user_id', paying.id);
  const fp = await user('friend-paying');
  await claim(fp, paying.code);
  const tp = await timeline(paying, 'Inviter paying, renewing');
  const ref = (await admin.from('referrals').select('inviter_reward').eq('invitee', fp.id).single()).data;
  console.log(`    referral reward: ${ref?.inviter_reward} (the next charge moves 30 days later at Stripe)`);
  check(ref?.inviter_reward === 'stripe_pause' && tp.g.length === 0, 'renewing payer: no Plus grant under a plan they pay for; a 30-day billing pause is recorded instead');

  console.log('\n=== 8. refusals');
  check((await claim(f1, inviter.code))?.ok === false, 'the same account cannot claim twice');
  check((await claim(inviter, inviter.code))?.ok === false, 'nobody can claim their own code');
} finally {
  await browser?.close();
  for (const id of made.reverse()) {
    for (const t of ['reward_grants', 'referrals', 'subscriptions']) await admin.from(t).delete().or(t === 'referrals' ? `inviter.eq.${id},invitee.eq.${id}` : `user_id.eq.${id}`);
    await admin.auth.admin.deleteUser(id);
  }
  console.log(`\nremoved ${made.length} throwaways`);
}
console.log(checks.every(Boolean) ? 'PASS' : 'FAIL');
