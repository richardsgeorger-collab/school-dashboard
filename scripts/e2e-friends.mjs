// Friend links on the real backend: an admin makes a link (use limit 2), two friends claim it and get Max through its
// date with no trial countdown, a third is refused (used up), a link turned off refuses, the admin list shows who
// joined, and the friend's screens say "Max, free from …" with no plans or trial. Screenshots to docs/screens/friends/.
// Every throwaway (and its links) is removed at the end.
//   KEYS_ENV=/path/to/keys.env BASE=http://localhost:4174/school-dashboard/ node scripts/e2e-friends.mjs
import { readFileSync, mkdirSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { chromium, devices } from 'playwright-core';
const env = Object.fromEntries(readFileSync(process.env.KEYS_ENV, 'utf8').split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]));
const BASE = process.env.BASE ?? 'http://localhost:4174/school-dashboard/';
const OUT = 'docs/screens/friends';
mkdirSync(OUT, { recursive: true });
const ref = new URL(env.VITE_SUPABASE_URL).hostname.split('.')[0];
const admin = createClient(env.VITE_SUPABASE_URL, env.SERVICE_ROLE, { auth: { persistSession: false } });
const checks = [];
const check = (ok, line) => { checks.push(ok); console.log(`${ok ? 'ok  ' : 'FAIL'} ${line}`); };
const made = [];
const user = async (tag) => {
  const email = `e2e-friends-${tag}-${Date.now()}@example.invalid`;
  const { data } = await admin.auth.admin.createUser({ email, email_confirm: true });
  made.push(data.user.id);
  const { data: link } = await admin.auth.admin.generateLink({ type: 'magiclink', email });
  const c = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data: s } = await c.auth.verifyOtp({ token_hash: link.properties.hashed_token, type: 'magiclink' });
  return { id: data.user.id, email, c, session: s.session };
};
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const george = await user('admin');
  await admin.from('profiles').update({ is_admin: true }).eq('user_id', george.id);
  const until = '2026-12-21T06:59:00.000Z';
  const { data: code, error: mkErr } = await george.c.rpc('create_friend_link', { p_label: 'ESG-162 chat', p_max_uses: 2, p_until: until, p_from_name: 'George' });
  check(!mkErr && typeof code === 'string', `admin made a link: ${code ?? mkErr?.message}`);
  const stranger = await user('stranger');
  const { error: denied } = await stranger.c.rpc('create_friend_link', { p_label: 'x', p_max_uses: 5, p_until: until, p_from_name: 'x' });
  check(!!denied, `a non-admin cannot make one: ${denied?.message}`);

  const a = await user('a');
  const { data: ra } = await a.c.rpc('claim_friend_link', { p_code: code });
  const { data: pa } = await admin.from('profiles').select('reward_tier, reward_until, trial_ends_at, friend_from').eq('user_id', a.id).single();
  check(ra?.ok && pa.reward_tier === 'max' && pa.reward_until.startsWith('2026-12-21') && Date.parse(pa.trial_ends_at) <= Date.now() && pa.friend_from === 'George', `friend A: Max through ${pa.reward_until?.slice(0, 10)}, trial countdown stopped, from ${pa.friend_from}`);
  const b = await user('b');
  const { data: rb } = await b.c.rpc('claim_friend_link', { p_code: code });
  const c3 = await user('c');
  const { data: rc } = await c3.c.rpc('claim_friend_link', { p_code: code });
  check(rb?.ok === true && rc?.ok === false && /used up/.test(rc.why), `use limit 2: B in, C refused (${rc?.why})`);
  await george.c.rpc('set_friend_link_active', { p_code: code, p_active: false });
  const { data: code2 } = await george.c.rpc('create_friend_link', { p_label: 'off test', p_max_uses: 10, p_until: until, p_from_name: 'George' });
  await george.c.rpc('set_friend_link_active', { p_code: code2, p_active: false });
  const { data: rOff } = await c3.c.rpc('claim_friend_link', { p_code: code2 });
  check(rOff?.ok === false && /turned off/.test(rOff.why), `a link turned off refuses: ${rOff?.why}`);
  // A has synced and finished onboarding; B has not.
  await admin.from('onboarding_events').insert([{ user_id: a.id, step: 'sync', event: 'complete', platform: 'desktop' }, { user_id: a.id, step: 'payoff', event: 'complete', platform: 'desktop' }]);
  const { data: list } = await george.c.rpc('list_friend_links');
  const l1 = list.find((x) => x.code === code);
  const mA = l1?.members.find((m) => m.email === a.email);
  const mB = l1?.members.find((m) => m.email === b.email);
  check(l1?.members.length === 2 && mA?.onboarded && mA?.synced && !mB?.onboarded && !mB?.synced && l1.active === false, `admin list: ${l1?.members.length} joined; A onboarded ${mA?.onboarded} synced ${mA?.synced}; B ${mB?.onboarded}/${mB?.synced}; link off`);
  // Friend A, four days in: the one question, the gift line, no plans.
  await admin.from('profiles').update({ friend_joined_at: new Date(Date.now() - 4 * 86_400_000).toISOString() }).eq('user_id', a.id);
  const signIn = async (page, session) => {
    await page.goto(`${BASE}#/now?seed=1`, { waitUntil: 'networkidle' }); await page.waitForTimeout(500);
    await page.evaluate(({ s, key }) => { const d = JSON.parse(localStorage.getItem('school-dashboard:v1')); d.settings.onboarding = { startedAt: 'x', step: 'done', doneAt: 'x', skippedAt: null, tourDoneAt: 'x' }; d.settings.maxOnboarding = { startedAt: 'x', step: 'done', doneAt: 'x' }; d.settings.sundayReview = { skips: 0, lastOffered: null, lastDone: null, off: true }; d.settings.upgradeSeen = { plus: 'x', max: 'x' }; localStorage.setItem('school-dashboard:v1', JSON.stringify(d)); localStorage.setItem(key, JSON.stringify(s)); localStorage.setItem('school-dashboard:seen-level', '99'); }, { s: session, key: `sb-${ref}-auth-token` });
    await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(3500);
  };
  let first = true;
  for (const [vp, device] of [['desk', { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 }], ['phone', { ...devices['iPhone 14'], deviceScaleFactor: 2 }]]) {
    for (const scheme of ['light', 'dark']) {
      const ctx = await browser.newContext({ ...device, colorScheme: scheme, reducedMotion: 'reduce' });
      const page = await ctx.newPage();
      await signIn(page, a.session);
      const ask = await page.$eval('.friend-ask', (e) => e.innerText.replace(/\s+/g, ' ')).catch(() => null);
      if (first) check(!!ask && /Got a suggestion, or something broken\?/.test(ask) && /Tell us/.test(ask), `day-3 question on Now: ${ask?.slice(0, 80)}`);
      await page.screenshot({ path: `${OUT}/friend-ask-${vp}-${scheme}.png` });
      await page.goto(`${BASE}#/you`, { waitUntil: 'networkidle' }); await page.waitForTimeout(1500);
      const txt = await page.evaluate(() => document.querySelector('.main')?.innerText.replace(/\s+/g, ' ') ?? '');
      if (first) check(/Max, free from George through Dec 20/.test(txt) && !/See plans|Try Max|left on your Max trial|\$7\.99/.test(txt), `friend's You: gift line, no plans, no trial, no prices`);
      await page.screenshot({ path: `${OUT}/friend-you-${vp}-${scheme}.png` });
      await ctx.close();
      // The admin panel.
      const ctx2 = await browser.newContext({ ...device, colorScheme: scheme, reducedMotion: 'reduce' });
      const p2 = await ctx2.newPage();
      await signIn(p2, george.session);
      await p2.goto(`${BASE}#/you`, { waitUntil: 'networkidle' }); await p2.waitForTimeout(2000);
      const panel = await p2.$eval('.friend-links', (e) => e.innerText.replace(/\s+/g, ' ')).catch(() => null);
      if (first) check(!!panel && /2 of 2 used/.test(panel) && /Onboarded/.test(panel), `admin panel on You: ${panel?.slice(0, 120)}`);
      await p2.$eval('.friend-links', (e) => e.scrollIntoView()).catch(() => undefined);
      await p2.screenshot({ path: `${OUT}/admin-links-${vp}-${scheme}.png` });
      await ctx2.close();
      first = false;
    }
  }
} finally {
  await browser.close();
  for (const id of made) {
    for (const t of ['courses', 'items', 'settings', 'usage_log', 'usage_events', 'read_ledger', 'announcements', 'onboarding_events']) await admin.from(t).delete().eq('user_id', id);
    await admin.auth.admin.deleteUser(id);
  }
  console.log(`removed ${made.length} throwaways (their links go with the admin)`);
}
console.log(checks.every(Boolean) ? 'PASS' : 'FAIL');
