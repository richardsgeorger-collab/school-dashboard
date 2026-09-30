// A real password reset on the LIVE site (2026-09-30): Supabase sends through Resend from noreply@haloplus.app to a
// throwaway mail.tm inbox; the link opens haloplus.app on "Set a new password"; the new password signs in. With
// --switch-on, it then turns on "Password reset emails" from the Admin page (as a throwaway admin) and checks that
// Forgot password on haloplus.app sends a second email by itself. Every account it makes is deleted after.
//   KEYS_ENV=... node scripts/e2e-reset-email-live.mjs [--switch-on]
import { mkdirSync, readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { chromium } from 'playwright-core';
const env = Object.fromEntries(readFileSync(process.env.KEYS_ENV, 'utf8').split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]));
const SITE = 'https://haloplus.app/';
const OUT = 'docs/screens/reset-email';
mkdirSync(OUT, { recursive: true });
const SWITCH = process.argv.includes('--switch-on');
const admin = createClient(env.VITE_SUPABASE_URL, env.SERVICE_ROLE, { auth: { persistSession: false } });
const anon = () => createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
const checks = [];
const check = (ok, line) => { checks.push(ok); console.log(`${ok ? 'ok  ' : 'FAIL'} ${line}`); };
const made = [];
const MT = 'https://api.mail.tm';
const mt = async (path, opts = {}) => { const r = await fetch(MT + path, { ...opts, headers: { 'content-type': 'application/json', ...(opts.headers ?? {}) } }); return r.status === 204 ? null : r.json(); };
const domain = (await mt('/domains'))['hydra:member'][0].domain;
const address = `haloplus-reset-${Date.now()}@${domain}`;
const mtPass = `Mt-${Math.random().toString(36).slice(2)}-${Date.now()}`;
const mbox = await mt('/accounts', { method: 'POST', body: JSON.stringify({ address, password: mtPass }) });
const { token } = await mt('/token', { method: 'POST', body: JSON.stringify({ address, password: mtPass }) });
const auth = { authorization: `Bearer ${token}` };
const waitMail = async (seen, ms = 150_000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const list = (await mt('/messages', { headers: auth }))['hydra:member'] ?? [];
    const fresh = list.find((m) => !seen.has(m.id));
    if (fresh) { seen.add(fresh.id); return mt(`/messages/${fresh.id}`, { headers: auth }); }
    await new Promise((r) => setTimeout(r, 4000));
  }
  return null;
};
const linkOf = (msg) => (msg?.html?.join?.('') ?? msg?.html ?? msg?.text ?? '').match(/https:\/\/[^"'\s<>]+\/auth\/v1\/verify[^"'\s<>]+/)?.[0]?.replace(/&amp;/g, '&');
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const seen = new Set();
try {
  const { data: u } = await admin.auth.admin.createUser({ email: address, password: 'Old-pass-2026!', email_confirm: true });
  made.push(u.user.id);
  const t0 = Date.now();
  const { error } = await anon().auth.resetPasswordForEmail(address, { redirectTo: SITE });
  check(!error, `Supabase accepted the reset request${error ? `: ${error.message}` : ''}`);
  const msg = await waitMail(seen);
  check(!!msg, `the email arrived${msg ? ` in ${Math.round((Date.now() - t0) / 1000)} s` : ' (not within 150 s)'}`);
  if (msg) {
    check(msg.from?.address === 'noreply@haloplus.app' && /Halo\+/.test(msg.from?.name ?? ''), `from ${msg.from?.name} <${msg.from?.address}>`);
    console.log(`     subject: "${msg.subject}"`);
    const link = linkOf(msg);
    const redirect = link ? new URL(link).searchParams.get('redirect_to') : null;
    check(!!link && redirect === SITE, `the link goes through Supabase and back to ${redirect}`);
    const ctx = await browser.newContext({ viewport: { width: 1100, height: 850 } });
    const page = await ctx.newPage();
    await page.goto(link, { waitUntil: 'load' });
    await page.waitForSelector('[aria-label="Set a new password"]', { timeout: 20000 }).catch(() => undefined);
    await page.screenshot({ path: `${OUT}/1-set-new-password.png` });
    check(/^https:\/\/haloplus\.app\//.test(page.url()) && !!(await page.$('[aria-label="Set a new password"]')), `the link opens haloplus.app on "Set a new password" (${page.url().split('#')[0]})`);
    await page.fill('[aria-label="Set a new password"] input[type=password]', 'New-pass-2026!');
    await page.click('[aria-label="Set a new password"] button[type=submit]');
    await page.waitForSelector('[aria-label="Set a new password"]', { state: 'detached', timeout: 15000 }).catch(() => undefined);
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${OUT}/2-after.png` });
    await ctx.close();
    const { error: e1 } = await anon().auth.signInWithPassword({ email: address, password: 'New-pass-2026!' });
    const { error: e2 } = await anon().auth.signInWithPassword({ email: address, password: 'Old-pass-2026!' });
    check(!e1 && !!e2, `the new password signs in and the old one no longer does${e1 ? ` (${e1.message})` : ''}`);
  }
  if (SWITCH && checks.every(Boolean)) {
    // Turn it on as an admin (Admin → Password reset emails → Turn on).
    const { data: g } = await admin.auth.admin.createUser({ email: `e2e-reset-admin-${Date.now()}@example.invalid`, email_confirm: true });
    made.push(g.user.id);
    await admin.from('profiles').update({ is_admin: true }).eq('user_id', g.user.id);
    const { data: link } = await admin.auth.admin.generateLink({ type: 'magiclink', email: g.user.email });
    const { data: s } = await anon().auth.verifyOtp({ token_hash: link.properties.hashed_token, type: 'magiclink' });
    // The call the Admin page's Turn on button makes, as that admin.
    const signed = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false }, global: { headers: { authorization: `Bearer ${s.session.access_token}` } } });
    const { error: se } = await signed.rpc('admin_set_switch', { switch_name: 'reset_email', on_off: true });
    if (se) console.log('switch:', se.message);
    const { data: ready } = await anon().rpc('reset_email_ready');
    check(ready === true, 'Password reset emails is on (reset_email_ready says true)');
    // Forgot password on the site, as a student would (Supabase allows one email per address a minute).
    await new Promise((r) => setTimeout(r, 62_000));
    const c2 = await browser.newContext({ viewport: { width: 1100, height: 850 } });
    const q = await c2.newPage();
    await q.goto(`${SITE}#/login`, { waitUntil: 'load' });
    await q.waitForTimeout(2500);
    await q.click('button:has-text("Forgot password")');
    await q.waitForTimeout(1500);
    await q.fill('[aria-label="Reset your password"] input[type=email]', address);
    await q.click('[aria-label="Reset your password"] button[type=submit]');
    await q.waitForTimeout(2500);
    await q.screenshot({ path: `${OUT}/4-forgot-sent.png` });
    const said = await q.$eval('[aria-label="Reset your password"]', (e) => e.innerText.replace(/\s+/g, ' ')).catch(() => '');
    check(/a link to set a new password is on its way/.test(said) && !/Contact George/.test(said), `Forgot password on haloplus.app: "${said.slice(0, 110)}"`);
    await c2.close();
    const second = await waitMail(seen);
    check(!!second && !!linkOf(second), 'and the second email arrived with its link');
  }
} finally {
  await browser.close();
  for (const id of made) {
    for (const t of ['courses', 'items', 'settings', 'usage_log', 'usage_events', 'onboarding_events', 'notification_plan']) await admin.from(t).delete().eq('user_id', id);
    await admin.auth.admin.deleteUser(id);
  }
  await mt(`/accounts/${mbox.id}`, { method: 'DELETE', headers: auth }).catch(() => undefined);
  console.log(`removed ${made.length} throwaways and the inbox`);
}
console.log(checks.every(Boolean) ? 'PASS' : 'FAIL');
process.exit(checks.every(Boolean) ? 0 : 1);
