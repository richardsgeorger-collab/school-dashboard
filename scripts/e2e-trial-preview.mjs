// The admin preview of the end-of-trial screen (George, 2026-10-01), on the real backend: a throwaway admin with a
// real week behind them opens it from Admin, sees their own numbers on the two cards (2026-10-29: Max $0.99 a month and
// Free), presses everything (Keep Max with the checkout mocked, Invite, Stay on Free, Close) and the account is exactly
// as before: no checkout asked for, no feedback, no trial change, nothing marked seen. A non-admin with the same address
// sees nothing. Throwaways removed.
//   KEYS_ENV=... [BASE=http://localhost:4174/school-dashboard/] node scripts/e2e-trial-preview.mjs
import { mkdirSync, readFileSync } from 'node:fs';
import { chromium } from 'playwright-core';
import { createClient } from '@supabase/supabase-js';
import { personaKit } from './lib/personas.mjs';

const env = Object.fromEntries(readFileSync(process.env.KEYS_ENV, 'utf8').split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]));
const BASE = process.env.BASE ?? 'http://localhost:4174/school-dashboard/';
const OUT = 'docs/screens/trial-preview';
mkdirSync(OUT, { recursive: true });
const ref = new URL(env.VITE_SUPABASE_URL).hostname.split('.')[0];
const kit = personaKit(env);
const db = kit.db;
const checks = [];
const check = (ok, line) => { checks.push(ok); console.log(`${ok ? 'ok  ' : 'FAIL'} ${line}`); };
const ago = (d) => new Date(Date.now() - d * 86_400_000).toISOString();
const DEVICES = { desk: { viewport: { width: 1280, height: 900 } }, phone: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } };

async function shotAll(p, path) {
  await p.evaluate(() => {
    const el = document.querySelector('.trial-ended');
    const style = document.createElement('style');
    style.textContent = '#root{display:none!important}.trial-ended{position:static!important;height:auto!important;max-height:none!important;overflow:visible!important}.trial-ended .onboard-inner{height:auto!important;max-height:none!important;overflow:visible!important}.trial-ended *{animation:none!important}';
    document.head.appendChild(style);
    document.body.appendChild(el);
  });
  await p.waitForTimeout(300);
  await p.screenshot({ path, fullPage: true });
}
const state = async (id) => {
  const [{ data: prof }, { data: set }, { count: feedback }] = await Promise.all([
    db.from('profiles').select('tier, trial_started_at, trial_ends_at, reward_tier, reward_until').eq('user_id', id).single(),
    db.from('settings').select('data').eq('user_id', id).single(),
    db.from('feedback').select('id', { count: 'exact', head: true }).eq('user_id', id),
  ]);
  return { prof, trialEndSeen: set?.data?.trialEndSeen ?? null, feedback };
};

const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const boss = await kit.persona('admin');
  // The seeded admin is on a trial that has not started its days of use: the first open would start them (trial_sync_started)
  // and move trial_ends_at, which is the app working, not the preview changing anything. Start them first.
  {
    const c = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
    await c.auth.setSession({ access_token: boss.session.access_token, refresh_token: boss.session.refresh_token });
    console.log('     trial days started first:', JSON.stringify((await c.rpc('trial_sync_started')).data));
  }
  await db.from('usage_log').insert([...Array.from({ length: 3 }, () => ({ user_id: boss.id, day: ago(2).slice(0, 10), kind: 'tutor', model: 'claude-haiku-4-5', created_at: ago(2) })), { user_id: boss.id, day: ago(1).slice(0, 10), kind: 'quiz', model: 'claude-haiku-4-5', created_at: ago(1) }]);
  await db.from('read_ledger').insert([0, 1, 2].map((i) => ({ user_id: boss.id, post_id: `prev-${i}`, hash: 'h', read_at: ago(3), action_count: 1 })));
  const before = await state(boss.id);
  // Checkout asked for (the wake-up call, {"warm":true}, makes no checkout and is not one). Mocked: never Stripe.
  const asked = [];
  const mockCheckout = (r) => {
    if (r.request().method() !== 'POST') return r.fulfill({ status: 204, body: '' });
    let body = {};
    try { body = JSON.parse(r.request().postData() || '{}'); } catch { /* ignore */ }
    if (body.warm) return r.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    asked.push(body);
    return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ url: `${BASE}#/you?s=plan&checkout=mocked` }) });
  };
  for (const dev of ['desk', 'phone']) for (const scheme of ['light', 'dark']) {
    const ctx = await browser.newContext({ ...DEVICES[dev], colorScheme: scheme });
    await ctx.addInitScript(({ ses, key }) => { if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(ses)); }, { ses: boss.session, key: `sb-${ref}-auth-token` });
    await ctx.route('**/functions/v1/report', (r) => r.fulfill({ status: 200, body: '{}' }));
    await ctx.route('**/functions/v1/stripe-checkout', mockCheckout);
    const p = await ctx.newPage();
    await p.goto(`${BASE}#/admin`, { waitUntil: 'load' });
    // The Admin page loads several cards from the server first; the ratings card (with this link) is one of them.
    await p.waitForSelector('a:has-text("Preview the end-of-trial screen")', { timeout: 60000 });
    await p.click('a:has-text("Preview the end-of-trial screen")', { timeout: 20000 });
    await p.waitForSelector('.trial-ended .trial-preview-bar', { timeout: 10000 });
    await p.waitForSelector('.story-line', { timeout: 15000 }).catch(() => undefined);
    await p.waitForTimeout(4500);
    if (dev === 'desk' && scheme === 'light') {
      const lines = (await p.locator('.story-line').allInnerTexts()).map((l) => l.replace(/\s+/g, ' ').trim());
      // The server's count (one practice set) shows; the three AI answers do not: Ask is gone (2026-10-29), so no "Answered N questions".
      // Only Max's own work, real counts, never a zero (2026-10-29: the Max lines; Ask is gone).
      check(lines.some((l) => /^1 practice set built from your classes$/.test(l)) && !lines.some((l) => /^Answered|checked off|^0\b/.test(l)) && lines.length >= 1, `the admin's own last 7 days on the Max card: only Max lines, nothing about questions answered, no zeros: ${lines.join(' | ')}`);
      check(/Preview, admin only/.test(await p.locator('.trial-preview-bar').innerText()), 'it says plainly it is a preview');
    }
    await shotAll(p, `${OUT}/preview-page1-${dev}-${scheme}.png`);
    await ctx.close();
  }
  // Press everything, then check nothing changed.
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await ctx.addInitScript(({ ses, key }) => { if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(ses)); }, { ses: boss.session, key: `sb-${ref}-auth-token` });
    await ctx.route('**/functions/v1/report', (r) => r.fulfill({ status: 200, body: '{}' }));
    await ctx.route('**/functions/v1/stripe-checkout', mockCheckout);
    await ctx.addInitScript(() => { navigator.share = async () => { window.__shared = true; }; });
    const p = await ctx.newPage();
    await p.goto(`${BASE}#/admin?preview=trial-end`, { waitUntil: 'load' });
    await p.waitForSelector('.trial-preview-bar', { timeout: 20000 });
    await p.waitForSelector('.trial-end-two', { timeout: 15000 });
    await p.waitForTimeout(2500);
    const bar = await p.locator('.trial-preview-bar button').allInnerTexts();
    check(bar.length === 1 && bar[0].trim() === 'Close preview' && (await p.locator('.story-continue').count()) === 0, `one screen, one version: the preview bar has only Close preview (${bar.join(' | ')})`);
    const order = await p.evaluate(() => [...document.querySelectorAll('.trial-end-two > div')].map((d) => d.dataset.tier).join(','));
    const maxCard = (await p.locator('.trial-end-max[data-tier=max]').innerText()).replace(/\s+/g, ' ');
    const all = (await p.locator('.trial-ended').innerText()).replace(/\s+/g, ' ');
    check(order === 'max,free' && /What you have now/i.test(maxCard) && /Max · \$0\.99 a month/.test(maxCard) && (await p.locator('.trial-end-max button.btn').innerText()).trim() === 'Keep Max · $0.99/mo', `two cards, Max first: "What you have now", $0.99 a month, Keep Max · $0.99/mo (${order})`);
    check(!/first month/i.test(all) && !/\bPlus\b/.test(all) && !/\$[1-9]\.99/.test(all), 'no intro offer, no Plus, no old prices in the preview');
    await p.click('.trial-end-max button:has-text("Keep Max")');
    await p.click('.gcbc-invite-line button:has-text("Invite a friend")');
    await p.waitForTimeout(1500);
    check(p.url().includes('#/admin') && !p.url().includes('checkout=mocked') && !(await p.evaluate(() => window.__shared === true)) && (await p.locator('.trial-ended').count()) === 1, 'Keep Max and Invite do nothing in the preview (no checkout opened, nothing shared)');
    await p.click('.trial-end-free button.trial-end-stay');
    await p.waitForTimeout(800);
    check((await p.locator('.trial-ended').count()) === 0, 'Stay on Free in the preview just closes it');
    await p.goto(`${BASE}#/admin?preview=trial-end`, { waitUntil: 'load' });
    await p.reload({ waitUntil: 'load' });
    await p.waitForSelector('.trial-preview-bar', { timeout: 20000 });
    await p.click('.trial-preview-bar button:has-text("Close preview")');
    await p.waitForTimeout(800);
    check((await p.locator('.trial-ended').count()) === 0 && (await p.locator('.admin-ratings').isVisible()), 'Close preview goes back to Admin');
    await ctx.close();
  }
  await new Promise((r) => setTimeout(r, 2500));
  const after = await state(boss.id);
  check(asked.length === 0, `no checkout asked for (${asked.length}${asked.length ? `: ${JSON.stringify(asked)}` : ''})`);
  const changed = Object.keys({ ...before.prof, ...after.prof }).filter((k) => JSON.stringify(before.prof?.[k]) !== JSON.stringify(after.prof?.[k]));
  check(changed.length === 0, `the plan and trial dates are unchanged${changed.length ? ` (changed: ${changed.map((k) => `${k} ${JSON.stringify(before.prof?.[k])} → ${JSON.stringify(after.prof?.[k])}`).join(', ')})` : ''}`);
  check(after.trialEndSeen === before.trialEndSeen, 'nothing marked seen in settings');
  check(after.feedback === before.feedback, 'no feedback saved');
  // Not an admin: the same address shows nothing.
  const plus = await kit.persona('max');
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await ctx.addInitScript(({ ses, key }) => { if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(ses)); }, { ses: plus.session, key: `sb-${ref}-auth-token` });
    await ctx.route('**/functions/v1/report', (r) => r.fulfill({ status: 200, body: '{}' }));
    const p = await ctx.newPage();
    await p.goto(`${BASE}#/now?preview=trial-end`, { waitUntil: 'load' });
    await p.waitForTimeout(5000);
    check((await p.locator('.trial-ended').count()) === 0, 'a student who is not an admin never sees it');
    await ctx.close();
  }
} finally {
  await browser.close();
  console.log(`removed ${await kit.cleanup()} throwaways`);
}
console.log(checks.every(Boolean) ? 'PASS' : 'FAIL');
