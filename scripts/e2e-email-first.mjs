// Email-first sign up and log in (George, 2026-10-01): GCU blocks Google sign-in for school accounts, so a GCU
// address must never reach a Google button. Every sign-up and log-in surface (onboarding, the log-in page, a friend
// link, an invite link, You), on desktop, phone and iPad, light and dark, with a GCU address, a Gmail and another
// address. Only the log-in page is submitted, with a made-up GCU address that has no account (nothing is created).
//   [BASE=http://localhost:4174/school-dashboard/] node scripts/e2e-email-first.mjs
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright-core';

const BASE = process.env.BASE ?? 'http://localhost:4174/school-dashboard/';
const OUT = 'docs/screens/email-first';
mkdirSync(OUT, { recursive: true });
const checks = [];
const check = (ok, line) => { checks.push(ok); if (!ok || process.env.VERBOSE) console.log(`${ok ? 'ok  ' : 'FAIL'} ${line}`); };
const DEVICES = {
  desk: { viewport: { width: 1280, height: 860 } },
  phone: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
  ipad: { viewport: { width: 820, height: 1180 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
};
const EMAILS = { gcu: 'jsmith-e2e-nobody@my.gcu.edu', gmail: 'jsmith.e2e.nobody@gmail.com', other: 'jsmith-e2e-nobody@icloud.com' };
const googleButtons = (p) => p.locator('button:has-text("Continue with Google")').count();

async function toEmail(p, email) {
  await p.fill('form.signin[data-step="email"] input[name="email"]', email);
  await p.click('form.signin[data-step="email"] button[type="submit"]');
  await p.waitForSelector('.signin[data-step]:not([data-step="email"])', { timeout: 5000 });
}
async function back(p) {
  await p.click('.signin button:has-text("Change email")');
  await p.waitForSelector('form.signin[data-step="email"]', { timeout: 5000 });
}

const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  for (const [dev, opts] of Object.entries(DEVICES)) for (const scheme of ['light', 'dark']) {
    const ctx = await browser.newContext({ ...opts, colorScheme: scheme });
    await ctx.route('**/functions/v1/report', (r) => r.fulfill({ status: 200, body: '{}' }));
    // Google is never actually opened: the OAuth start is stopped at the network.
    await ctx.route('**/auth/v1/authorize**', (r) => r.fulfill({ status: 200, body: 'google' }));
    const tag = `${dev} ${scheme}`;
    for (const [surface, path, mode] of [['signup', '#/start', 'Sign up'], ['login', '#/login', 'Log in'], ['friend', '#/start?friend=e2etest1', 'Sign up'], ['invite', '#/now?ref=e2etest1', null]]) {
      const p = await ctx.newPage();
      await p.goto(`${BASE}${path}`, { waitUntil: 'load' });
      if (surface === 'invite') {
        // An invite link lands on the landing page; its Sign up goes to the same onboarding form.
        await p.waitForSelector('a.btn.primary[href="#/start"]', { timeout: 15000 }).catch(() => undefined);
        if (await p.$('a.btn.primary[href="#/start"]')) await p.click('a.btn.primary[href="#/start"]');
      }
      const ok = await p.waitForSelector('form.signin[data-step="email"]', { timeout: 15000 }).then(() => true, () => false);
      check(ok, `${tag} ${surface}: opens on the email screen`);
      if (!ok) { await p.screenshot({ path: `${OUT}/broken-${surface}-${dev}-${scheme}.png` }); await p.close(); continue; }
      await p.waitForTimeout(400);
      // Screen 1: one field, Continue, and the switch line. No Google, no password.
      check((await googleButtons(p)) === 0 && !(await p.$('input[type="password"]')) && (await p.locator('form.signin label:has-text("What\'s your email?")').count()) === 1, `${tag} ${surface}: screen 1 is the email only`);
      check(/Have an account\? Log in|New here\? Sign up/.test(await p.locator('.signin-switch').innerText()), `${tag} ${surface}: the switch line is there`);
      const wide = await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
      check(!wide, `${tag} ${surface}: no sideways scroll`);
      const full = surface === 'signup' || surface === 'login';
      if (full) await p.screenshot({ path: `${OUT}/${surface}-1-email-${dev}-${scheme}.png` });

      // GCU: a password, never Google, and the one line.
      await toEmail(p, EMAILS.gcu);
      check((await p.$('.signin[data-step="gcu"]')) && (await googleButtons(p)) === 0, `${tag} ${surface}: a GCU address gets no Google button anywhere`);
      check(!!(await p.$('form.signin input[name="password"]')) && (await p.locator('form.signin button[type=submit]').innerText()).trim() === (mode ?? 'Sign up'), `${tag} ${surface}: a GCU address gets a password and ${mode ?? 'Sign up'}`);
      check(/GCU accounts use a password here/.test(await p.locator('form.signin').innerText()), `${tag} ${surface}: the GCU line`);
      check((await p.locator('.signin-who-email').innerText()) === EMAILS.gcu, `${tag} ${surface}: shows the address with Change email`);
      if (full) await p.screenshot({ path: `${OUT}/${surface}-2-gcu-${dev}-${scheme}.png` });
      for (const alt of ['someone@gcu.edu', 'Someone@MY.GCU.EDU']) {
        await back(p);
        await toEmail(p, alt);
        check((await googleButtons(p)) === 0 && !!(await p.$('.signin[data-step="gcu"]')), `${tag} ${surface}: ${alt} gets no Google button`);
      }

      // Gmail: Google big, a smaller way to a password.
      await back(p);
      check((await p.inputValue('form.signin[data-step="email"] input[name="email"]')) === 'Someone@MY.GCU.EDU', `${tag} ${surface}: Change email keeps what was typed`);
      await toEmail(p, EMAILS.gmail);
      const g = p.locator('button.signin-google');
      check((await googleButtons(p)) === 1 && (await g.isVisible()) && !(await p.$('input[type="password"]')), `${tag} ${surface}: Gmail gets Continue with Google first`);
      const gh = (await g.boundingBox())?.height ?? 0;
      check(gh >= 48, `${tag} ${surface}: the Google button is big (${Math.round(gh)}px)`);
      check(await p.locator('button:has-text("Or use a password instead")').isVisible(), `${tag} ${surface}: "Or use a password instead"`);
      if (full) await p.screenshot({ path: `${OUT}/${surface}-3-gmail-${dev}-${scheme}.png` });
      await p.click('button:has-text("Or use a password instead")');
      check(!!(await p.$('form.signin[data-step="password"] input[name="password"]')) && (await googleButtons(p)) === 0, `${tag} ${surface}: Gmail can use a password instead`);
      if (full && dev === 'desk') await p.screenshot({ path: `${OUT}/${surface}-4-gmail-password-${dev}-${scheme}.png` });

      // Anything else: password only.
      await back(p);
      await toEmail(p, EMAILS.other);
      check(!!(await p.$('form.signin[data-step="password"] input[name="password"]')) && (await googleButtons(p)) === 0, `${tag} ${surface}: another address gets a password only`);
      if (full) await p.screenshot({ path: `${OUT}/${surface}-5-other-${dev}-${scheme}.png` });

      // Log in with a GCU address that has no password: said plainly, with Set a password.
      if (surface === 'login') {
        await back(p);
        await toEmail(p, EMAILS.gcu);
        await p.fill('form.signin input[name="password"]', 'not-the-password-1');
        await p.click('form.signin button[type=submit]');
        await p.waitForSelector('.signin-error', { timeout: 15000 }).catch(() => undefined);
        const msg = await p.locator('.signin-error').innerText().catch(() => '');
        check(/no password yet/.test(msg) && !/Google/.test(msg), `${tag} login: a GCU address with no password is told so plainly: "${msg}"`);
        const set = p.locator('.signin-error-box button:has-text("Set a password")');
        check(await set.isVisible(), `${tag} login: offers Set a password`);
        await p.screenshot({ path: `${OUT}/login-6-gcu-no-password-${dev}-${scheme}.png` });
        await set.click();
        await p.waitForTimeout(800);
        const title = (await p.locator('form.signin .section-title').textContent())?.trim();
        check(title === 'Set a password' && (await p.inputValue('form.signin input[type=email]')) === EMAILS.gcu, `${tag} login: Set a password opens with the address filled in`);
        if (dev === 'desk') await p.screenshot({ path: `${OUT}/login-7-set-a-password-${dev}-${scheme}.png` });
      }
      await p.close();
    }
    await ctx.close();
  }
} finally {
  await browser.close();
}
console.log(`${checks.filter(Boolean).length}/${checks.length} checks`);
console.log(checks.every(Boolean) ? 'PASS' : 'FAIL');
