// Email and password accounts (2026-09-28), on the real backend: sign up in onboarding (8 characters, no confirmation
// email, signed straight in), log out and back in, a wrong password, Forgot password while the reset email is off
// ("Contact George"), and an old email-link account: its password log-in explains itself, and a reset link lets it set
// a password and log in with it. Screens light and dark. Throwaways removed.
//   KEYS_ENV=... BASE=http://localhost:4174/school-dashboard/ node scripts/e2e-password.mjs
import { mkdirSync, readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { chromium } from 'playwright-core';
import { fillSignIn } from './lib/signin.mjs';
const env = Object.fromEntries(readFileSync(process.env.KEYS_ENV, 'utf8').split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]));
const BASE = process.env.BASE ?? 'http://localhost:4174/school-dashboard/';
const OUT = 'docs/screens/password';
mkdirSync(OUT, { recursive: true });
const admin = createClient(env.VITE_SUPABASE_URL, env.SERVICE_ROLE, { auth: { persistSession: false } });
const checks = [];
const check = (ok, line) => { checks.push(ok); console.log(`${ok ? 'ok  ' : 'FAIL'} ${line}`); };
const emails = [];
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const text = (p, sel) => p.$eval(sel, (e) => e.innerText.replace(/\s+/g, ' ').trim()).catch(() => '');
try {
  for (const scheme of ['light', 'dark']) {
    const email = `e2e-pass-${scheme}-${Date.now()}@example.invalid`;
    emails.push(email);
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 }, deviceScaleFactor: 2, colorScheme: scheme });
    let p = await ctx.newPage();
    await p.goto(`${BASE}#/start`, { waitUntil: 'load' });
    await p.waitForSelector('form.signin', { timeout: 15000 });
    await p.waitForTimeout(600);
    await p.screenshot({ path: `${OUT}/1-sign-up-${scheme}.png` });
    if (scheme === 'light') {
      check(!!(await p.$('form.signin[data-step="email"]')) && !(await p.$('form.signin input[type="password"]')) && !/Continue with Google/.test(await text(p, 'form.signin')), 'sign up asks for the email first, and nothing else');
      await fillSignIn(p, email, 'short7!');
      await p.click('form.signin button[type="submit"]');
      await p.waitForTimeout(400);
      check(/at least 8 characters/.test(await text(p, '.signin-error')), `under 8 characters is refused: "${await text(p, '.signin-error')}"`);
    }
    await fillSignIn(p, email, 'correct-horse-9');
    await p.click('form.signin button[type="submit"]');
    await p.waitForFunction(() => !document.querySelector('form.signin'), null, { timeout: 20000 }).catch(() => undefined);
    await p.waitForTimeout(1200);
    const signedIn = await p.evaluate(() => Object.keys(localStorage).some((k) => /^sb-.*-auth-token$/.test(k)));
    if (scheme === 'light') check(signedIn && !(await p.$('form.signin')), 'signed straight in, no confirmation email, and onboarding moved on');
    const { data: list } = await admin.auth.admin.listUsers({ perPage: 1000 });
    const u = list.users.find((x) => x.email === email);
    if (scheme === 'light') check(!!u?.email_confirmed_at, 'the account is confirmed without an email');
    // A new device: the log-in page.
    await ctx.close();
    const ctx2 = await browser.newContext({ viewport: { width: 1280, height: 860 }, deviceScaleFactor: 2, colorScheme: scheme });
    p = await ctx2.newPage();
    await p.goto(`${BASE}#/login`, { waitUntil: 'load' });
    await p.waitForSelector('form.signin', { timeout: 15000 });
    await p.waitForTimeout(500);
    await p.screenshot({ path: `${OUT}/2-log-in-${scheme}.png` });
    await fillSignIn(p, email, 'wrong-password-1');
    await p.click('form.signin button[type="submit"]');
    await p.waitForSelector('.signin-error', { timeout: 15000 }).catch(() => undefined);
    await p.screenshot({ path: `${OUT}/3-wrong-password-${scheme}.png` });
    if (scheme === 'light') check(/doesn't match/.test(await text(p, '.signin-error')), `a wrong password says so: "${await text(p, '.signin-error')}"`);
    await p.click('form.signin button:has-text("Forgot password")');
    await p.waitForTimeout(1500);
    await p.screenshot({ path: `${OUT}/4-forgot-off-${scheme}.png` });
    // Reset emails are on in production (2026-09-30); with them off this says Contact George instead.
    const contact = await p.$('.signin-contact');
    if (scheme === 'light') check(contact ? (await text(p, '.signin-contact')) === 'Contact George to reset your password.' && !(await p.$('form.signin button[type="submit"]')) : /Email me a reset link/.test(await text(p, 'form.signin button[type="submit"]')), `Forgot password offers ${contact ? 'Contact George' : 'a reset link'}, matching whether reset emails are on`);
    await p.click('form.signin button:has-text("Back to log in")');
    await fillSignIn(p, email, 'correct-horse-9');
    await p.click('form.signin button[type="submit"]');
    await p.waitForFunction(() => Object.keys(localStorage).some((k) => /^sb-.*-auth-token$/.test(k)), null, { timeout: 20000 }).catch(() => undefined);
    if (scheme === 'light') check(await p.evaluate(() => Object.keys(localStorage).some((k) => /^sb-.*-auth-token$/.test(k))), 'logs back in with the password');
    await ctx2.close();
  }

  // An account made with the email link: no password.
  const old = `e2e-pass-link-${Date.now()}@example.invalid`;
  emails.push(old);
  await admin.auth.admin.createUser({ email: old, email_confirm: true });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 }, deviceScaleFactor: 2 });
  let p = await ctx.newPage();
  await p.goto(`${BASE}#/login`, { waitUntil: 'load' });
  await p.waitForSelector('form.signin', { timeout: 15000 });
  await fillSignIn(p, old, 'anything-at-all');
  await p.click('form.signin button[type="submit"]');
  await p.waitForSelector('.signin-error', { timeout: 15000 }).catch(() => undefined);
  check(/email link, it has no password yet/.test(await text(p, '.signin-error')) && !!(await p.$('.signin-error-box button:has-text("Set a password")')), 'an email-link account trying a password is told plainly, with Set a password');
  // The reset email's link, followed: the app asks for a new password.
  const { data: link } = await admin.auth.admin.generateLink({ type: 'recovery', email: old });
  const anon = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data: v } = await anon.auth.verifyOtp({ token_hash: link.properties.hashed_token, type: 'recovery' });
  const s = v.session;
  await p.close();
  p = await ctx.newPage();
  await p.goto(`${BASE}#access_token=${s.access_token}&expires_at=${s.expires_at}&expires_in=3600&refresh_token=${s.refresh_token}&token_type=bearer&type=recovery`, { waitUntil: 'load' });
  await p.waitForSelector('.signin-recovery', { timeout: 15000 }).catch(() => undefined);
  await p.screenshot({ path: `${OUT}/5-set-new-password-light.png` });
  check(!!(await p.$('.signin-recovery')), 'back from the reset link, the app asks for a new password');
  await p.fill('.signin-recovery input', 'brand-new-pass-1');
  await p.click('.signin-recovery button[type="submit"]');
  await p.waitForFunction(() => !document.querySelector('.signin-recovery'), null, { timeout: 15000 }).catch(() => undefined);
  const again = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { error: le } = await again.auth.signInWithPassword({ email: old, password: 'brand-new-pass-1' });
  check(!le, `the email-link account now logs in with its new password${le ? `: ${le.message}` : ''}`);
  await ctx.close();
} finally {
  await browser.close();
  const { data: list } = await admin.auth.admin.listUsers({ perPage: 1000 });
  let n = 0;
  for (const u of list.users.filter((x) => emails.includes(x.email))) {
    for (const t of ['courses', 'items', 'settings', 'usage_log', 'usage_events', 'onboarding_events', 'notification_plan']) await admin.from(t).delete().eq('user_id', u.id);
    await admin.auth.admin.deleteUser(u.id);
    n += 1;
  }
  console.log(`removed ${n} throwaways`);
}
console.log(checks.every(Boolean) ? 'PASS' : 'FAIL');
process.exit(checks.every(Boolean) ? 0 : 1);
