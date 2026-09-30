// A paying student never sees Free while the plan loads (George, 2026-09-30: "on every reload it takes about 30
// seconds to realise I'm on Max"). Every account request is held back 20 seconds, as on a slow token refresh, and the
// first seconds are checked: with the plan remembered on this device (a returning student) it shows Max at once;
// on a brand-new device nothing locks, upsells or says Free while it waits. Real backend, throwaway Max account.
//   KEYS_ENV=... BASE=http://localhost:4174/school-dashboard/ node scripts/e2e-plan-instant.mjs
import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { chromium } from 'playwright-core';
const env = Object.fromEntries(readFileSync(process.env.KEYS_ENV, 'utf8').split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]));
const BASE = process.env.BASE ?? 'http://localhost:4174/school-dashboard/';
const OUT = 'docs/screens/plan-instant';
mkdirSync(OUT, { recursive: true });
const ref = new URL(env.VITE_SUPABASE_URL).hostname.split('.')[0];
const admin = createClient(env.VITE_SUPABASE_URL, env.SERVICE_ROLE, { auth: { persistSession: false } });
const checks = [];
const check = (ok, line) => { checks.push(ok); console.log(`${ok ? 'ok  ' : 'FAIL'} ${line}`); };
const email = `e2e-instant-${Date.now()}@example.invalid`;
const { data } = await admin.auth.admin.createUser({ email, email_confirm: true });
const uid = data.user.id;
try {
  const { data: link } = await admin.auth.admin.generateLink({ type: 'magiclink', email });
  const c = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data: s } = await c.auth.verifyOtp({ token_hash: link.properties.hashed_token, type: 'magiclink' });
  const now = new Date().toISOString();
  const cid = randomUUID();
  await admin.from('courses').insert({ id: cid, user_id: uid, updated_at: now, data: { id: cid, code: 'CHM-113', name: 'General Chemistry I-Lecture', color: '#D95D39', credits: 3, instructors: [], meetings: [], online: false, haloClassId: 'hc', haloSlugId: 'CHM-113-WF700A-20260908', termStart: '2026-09-08', termEnd: '2026-12-20', updatedAt: now } });
  const settings = { timezone: 'America/Phoenix', lastPull: { at: now }, onboarding: { startedAt: 'x', step: 'done', doneAt: 'x', skippedAt: null, tourDoneAt: 'x' }, upgradeSeen: { plus: 'x', max: 'x' }, notifyAsk: { askedAt: 'x', answer: 'no' } };
  await admin.from('settings').upsert({ user_id: uid, updated_at: now, data: settings });
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const look = async (p) => p.evaluate(() => {
    const t = document.body.innerText;
    return { chip: document.querySelector('.trial-chip')?.innerText ?? null, locks: document.querySelectorAll('.locked:not(.locked-wait), .lock-tag, .plan-wall').length, frozen: !!document.querySelector('.frozen-banner'), signIn: /Save your planner to an account|Sign in to get your invite link/.test(t), freeWords: /Halo sync paused|part of (Plus|Max)|Upgrade to|You're on Free/i.test(t) };
  });
  const scenario = async (label, remembered) => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    // An expired token forces the refresh a returning student's browser often does.
    await ctx.addInitScript(({ s, key, settings }) => { if (localStorage.getItem(key)) return; localStorage.setItem(key, JSON.stringify(s)); localStorage.setItem('school-dashboard:v1', JSON.stringify({ courses: [], items: [], settings })); }, { s: { ...s.session, expires_at: Math.floor(Date.now() / 1000) - 60 }, key: `sb-${ref}-auth-token`, settings });
    const p = await ctx.newPage();
    if (remembered) {
      // A visit that completed normally: the device now remembers the plan.
      await p.goto(`${BASE}#/study`, { waitUntil: 'load' });
      await p.waitForTimeout(6000);
    }
    let slow = true;
    await ctx.route(/supabase\.co\/(auth\/v1\/token|rest\/v1\/rpc\/my_plan|rest\/v1\/profiles)/, async (route) => { if (slow) await new Promise((r) => setTimeout(r, 20_000)); return route.continue(); });
    await p.goto(`${BASE}#/study`, { waitUntil: 'load' });
    if (remembered) await p.reload({ waitUntil: 'load' });
    const seen = [];
    for (const t of [700, 2000, 6000]) {
      await p.waitForTimeout(t - (seen.length ? [700, 2000, 6000][seen.length - 1] : 0));
      seen.push({ t, ...(await look(p)) });
    }
    await p.screenshot({ path: `${OUT}/${label}-while-loading.png` });
    for (const x of seen) console.log(`   ${label} ${x.t}ms: ${JSON.stringify(x)}`);
    slow = false;
    await ctx.close();
    return seen;
  };
  const back = await scenario('returning', true);
  check(/^Max · 7 days/.test(back[0].chip ?? '') && back.every((x) => x.locks === 0 && !x.frozen && !x.signIn && !x.freeWords), 'returning student, account requests held 20s: Max from the first 0.7s, no locks, no paused sync, no sign-in prompt, no Free wording');
  const fresh = await scenario('new-device', false);
  check(fresh.every((x) => x.locks === 0 && !x.frozen && !x.signIn && !x.freeWords), 'brand-new device, account requests held 20s: nothing locks, upsells or says Free while it waits');
  await browser.close();
} finally {
  for (const t of ['courses', 'items', 'settings', 'usage_events', 'onboarding_events', 'notification_plan']) await admin.from(t).delete().eq('user_id', uid);
  await admin.auth.admin.deleteUser(uid);
}
console.log(checks.every(Boolean) ? 'PASS' : 'FAIL');
process.exit(checks.every(Boolean) ? 0 : 1);
