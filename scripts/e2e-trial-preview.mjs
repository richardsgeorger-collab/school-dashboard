// The admin preview of the end-of-trial screen (George, 2026-10-01), on the real backend: a throwaway admin with a
// real week behind them opens it from Admin, sees their own numbers, presses everything (rating and comment, Keep Max,
// Choose Plus, Invite, both variants, Close) and the account is exactly as before: no rating, no feedback, no
// checkout, no trial change, nothing marked seen. A non-admin with the same address sees nothing. Throwaways removed.
//   KEYS_ENV=... [BASE=http://localhost:4174/school-dashboard/] node scripts/e2e-trial-preview.mjs
import { mkdirSync, readFileSync } from 'node:fs';
import { chromium } from 'playwright-core';
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
  const [{ data: prof }, { data: set }, { count: ratings }, { count: feedback }] = await Promise.all([
    db.from('profiles').select('tier, trial_started_at, trial_ends_at, reward_tier, reward_until').eq('user_id', id).single(),
    db.from('settings').select('data').eq('user_id', id).single(),
    db.from('trial_ratings').select('user_id', { count: 'exact', head: true }).eq('user_id', id),
    db.from('feedback').select('id', { count: 'exact', head: true }).eq('user_id', id),
  ]);
  return { prof, trialEndSeen: set?.data?.trialEndSeen ?? null, trialRating: set?.data?.trialRating ?? null, ratings, feedback };
};

const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const boss = await kit.persona('admin');
  await db.from('usage_log').insert([...Array.from({ length: 3 }, () => ({ user_id: boss.id, day: ago(2).slice(0, 10), kind: 'tutor', model: 'claude-haiku-4-5', created_at: ago(2) })), { user_id: boss.id, day: ago(1).slice(0, 10), kind: 'quiz', model: 'claude-haiku-4-5', created_at: ago(1) }]);
  await db.from('read_ledger').insert([0, 1, 2].map((i) => ({ user_id: boss.id, post_id: `prev-${i}`, hash: 'h', read_at: ago(3), action_count: 1 })));
  const before = await state(boss.id);
  let checkout = 0;
  for (const dev of ['desk', 'phone']) for (const scheme of ['light', 'dark']) {
    const ctx = await browser.newContext({ ...DEVICES[dev], colorScheme: scheme });
    await ctx.addInitScript(({ ses, key }) => { if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(ses)); }, { ses: boss.session, key: `sb-${ref}-auth-token` });
    await ctx.route('**/functions/v1/report', (r) => r.fulfill({ status: 200, body: '{}' }));
    await ctx.route('**/functions/v1/stripe-checkout', (r) => { if (r.request().method() === 'POST') checkout += 1; return r.fulfill({ status: r.request().method() === 'POST' ? 500 : 204, body: '{}' }); });
    await ctx.route('**/rest/v1/rpc/rate_trial', (r) => { checkout += 1000; return r.continue(); });
    const p = await ctx.newPage();
    await p.goto(`${BASE}#/admin`, { waitUntil: 'load' });
    await p.click('a:has-text("Preview the end-of-trial screen")', { timeout: 20000 });
    await p.waitForSelector('.trial-ended .trial-preview-bar', { timeout: 10000 });
    await p.waitForSelector('.story-line', { timeout: 15000 }).catch(() => undefined);
    await p.waitForTimeout(4500);
    if (dev === 'desk' && scheme === 'light') {
      const lines = (await p.locator('.story-line').allInnerTexts()).map((l) => l.replace(/\s+/g, ' ').trim());
      check(lines.some((l) => /^Answered 3 questions about your classes\.$/.test(l)) && lines.some((l) => /^Built 1 study plan or practice set/.test(l)) && lines.length <= 4, `the admin's own last 7 days: ${lines.join(' | ')}`);
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
    await ctx.route('**/functions/v1/stripe-checkout', (r) => { if (r.request().method() === 'POST') checkout += 1; return r.fulfill({ status: r.request().method() === 'POST' ? 500 : 204, body: '{}' }); });
    await ctx.route('**/rest/v1/rpc/rate_trial', (r) => { checkout += 1000; return r.continue(); });
    await ctx.addInitScript(() => { navigator.share = async () => { window.__shared = true; }; });
    const p = await ctx.newPage();
    await p.goto(`${BASE}#/admin?preview=trial-end`, { waitUntil: 'load' });
    await p.waitForSelector('.trial-preview-bar', { timeout: 20000 });
    await p.waitForSelector('.story-plans', { timeout: 15000 });
    await p.waitForTimeout(2500);
    check((await p.locator('.trial-rating').count()) === 0 && (await p.locator('.story-continue').count()) === 0, 'one screen: no rating, no Continue (2026-10-09)');
    await p.click('button:has-text("Keep Max")');
    await p.click('button:has-text("Choose Plus")');
    await p.click('.gcbc-invite-line button:has-text("Invite a friend")');
    await p.waitForTimeout(800);
    check(p.url().includes('#/admin') && !(await p.evaluate(() => window.__shared === true)), 'Keep Max, Choose Plus and Invite do nothing in the preview');
    await p.click('.trial-preview-bar button:has-text("Plus from a friend")');
    await p.waitForTimeout(2600);
    check(/Free until .+, from your friend's invite\./.test(await p.locator('.plan-choices').innerText()) && (await p.locator('.gcbc-free-link').innerText()) === 'Continue with Plus free' && p.url().includes('preview=trial-end-gift'), 'the friend-invite version: Plus covered, "Continue with Plus free"');
    await shotAll(p, `${OUT}/preview-gift-desk-light.png`);
    await p.goto(`${BASE}#/admin?preview=trial-end`, { waitUntil: 'load' });
    await p.reload({ waitUntil: 'load' });
    await p.waitForSelector('.story-plans', { timeout: 20000 });
    await p.click('.gcbc-free-link');
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
  check(checkout === 0, `no checkout and no rating sent (${checkout})`);
  check(JSON.stringify(after.prof) === JSON.stringify(before.prof), 'the plan and trial dates are unchanged');
  check(after.trialEndSeen === before.trialEndSeen && after.trialRating === before.trialRating, 'nothing marked seen or rated in settings');
  check(after.ratings === 0 && after.feedback === before.feedback, 'no rating and no feedback saved');
  // Not an admin: the same address shows nothing.
  const plus = await kit.persona('plus');
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
