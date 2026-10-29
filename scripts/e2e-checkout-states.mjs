// The checkout button's states (George, 2026-10-09: Choose Plus took ~30 s with no sign anything was happening; since
// 2026-10-29 the one plan sold is Max, $0.99 a month, and its checkout is made ready as soon as the button is on screen).
// A throwaway whose trial just ended sees the two-card end of trial; the checkout function is mocked here (never
// Stripe): slow, then failing, then succeeding with a local address. The function is woken as the cards appear and Max's
// checkout is asked for at once; a press while that is still on its way waits for it (no second call). Pressed: spinner
// and "Opening secure checkout…"; past 10 s "Still working, almost there…"; on failure a clear error with Try again and a
// report to Admin > Errors; on success the browser leaves for the address the function gave. Once the checkout is ready,
// the press opens it with no call at all. One Max button, $0.99 a month, no first-month offer anywhere, no Plus.
//   KEYS_ENV=... [BASE=http://localhost:4174/school-dashboard/] node scripts/e2e-checkout-states.mjs
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright-core';
import { personaKit } from './lib/personas.mjs';

const env = Object.fromEntries(readFileSync(process.env.KEYS_ENV, 'utf8').split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]));
const BASE = process.env.BASE ?? 'http://localhost:4174/school-dashboard/';
const ref = new URL(env.VITE_SUPABASE_URL).hostname.split('.')[0];
const kit = personaKit(env);
const checks = [];
const check = (ok, line) => { checks.push(!!ok); console.log(`${ok ? 'ok  ' : 'FAIL'} ${line}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms, every = 100) => { const end = Date.now() + ms; for (;;) { const v = await fn(); if (v || Date.now() > end) return v; await sleep(every); } };
const SLOW_MS = 14000;
const KEEP = 'Keep Max · $0.99/mo';
// Keep Max's checkouts: no landing of their own. (The Now page under the screen may make one ready for a study tool,
// with its own next; that one is its own and is left alone.)
const keep = (bs) => bs.filter((b) => !b.next);

const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const who = await kit.persona('ended');
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 700 } });
  await ctx.addInitScript(({ ses, key }) => { if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(ses)); }, { ses: who.session, key: `sb-${ref}-auth-token` });
  const reports = [];
  await ctx.route('**/functions/v1/report', async (r) => { try { reports.push(JSON.parse(r.request().postData() || '{}')); } catch { /* ignore */ } return r.fulfill({ status: 200, body: '{}' }); });
  let mode = 'slow-fail';
  let warmups = 0;
  const bodies = [];
  await ctx.route('**/functions/v1/stripe-checkout', async (r) => {
    if (r.request().method() === 'OPTIONS') return r.fulfill({ status: 204 });
    let body = {};
    try { body = JSON.parse(r.request().postData() || '{}'); } catch { /* ignore */ }
    // The wake-up call (billing/client.ts warmCheckout): no checkout is made from it.
    if (body.warm) { warmups += 1; return r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }); }
    bodies.push({ ...body, at: Date.now() });
    if (mode === 'slow-fail') { await sleep(SLOW_MS); return r.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'Stripe could not be reached.' }) }); }
    return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ url: `${BASE}#/you?s=plan&checkout=mocked` }) });
  });
  const p = await ctx.newPage();
  await p.goto(`${BASE}#/now`, { waitUntil: 'load' });
  const max = p.locator(`.trial-end-max button:has-text("${KEEP}")`);
  await max.waitFor({ timeout: 30000 });
  // Pressed at once, while the checkout asked for on screen is still on its way.
  await until(() => keep(bodies).length >= 1, 10000);
  const tAsk = keep(bodies)[0]?.at ?? Date.now();
  const maxBtns = await p.locator('.trial-ended button:has-text("Max")').allInnerTexts();
  const t0 = Date.now();
  await max.click();
  check(maxBtns.length === 1, `one Max button on the screen (${maxBtns.map((t) => t.replace(/\s+/g, ' ').trim()).join(' | ')})`);
  check(warmups >= 1, `the checkout function was woken as the cards appeared (${warmups} wake-up call)`);
  const k0 = keep(bodies);
  check(k0.length === 1 && k0[0].tier === 'max' && k0[0].interval === 'month' && !('offer' in k0[0]) && k0[0].source === 'app', `Max's checkout was asked for as the button appeared, Max monthly with no offer (${JSON.stringify({ ...k0[0], at: undefined, returnTo: undefined })}, pressed ${t0 - tAsk} ms later)`);
  await sleep(600);
  const opening = p.locator('.trial-end-max button.is-opening');
  check((await opening.count()) === 1 && /Opening secure checkout/.test(await opening.innerText()) && (await opening.locator('.spinner').count()) === 1, 'pressed: spinner and "Opening secure checkout…" at once');
  check(await opening.isDisabled(), 'the button cannot be pressed twice meanwhile');
  await sleep(Math.max(0, 10400 - (Date.now() - t0)));
  check(/Still working, almost there/.test(await opening.innerText().catch(() => '')), `past 10 s: "Still working, almost there…" (${Math.round((Date.now() - t0) / 1000)} s after the press)`);
  await p.waitForSelector('.checkout-error', { timeout: 15000 });
  check(keep(bodies).length === 1, `the press waited for the checkout already on its way, no second call (${keep(bodies).length} call)`);
  const err = (await p.locator('.checkout-error').innerText()).replace(/\s+/g, ' ');
  check(/Stripe could not be reached/.test(err) && /Try again/.test(err), `on failure: the error and Try again ("${err}")`);
  check(!(await max.isDisabled()) && (await max.innerText()).trim() === KEEP, 'the button is back');
  await sleep(1500);
  check(reports.some((r) => /Checkout/.test(r.title ?? '') && (r.status === 500 || /500/.test(r.message ?? ''))), `the failure went to Admin > Errors (${reports.map((r) => r.title).join(' | ')})`);
  mode = 'ok';
  await p.locator('.checkout-error button:has-text("Try again")').click();
  await p.waitForURL(/checkout=mocked/, { timeout: 15000 });
  const k1 = keep(bodies);
  check(p.url().includes('checkout=mocked') && k1.length === 2 && k1[1].tier === 'max' && !('offer' in k1[1]), `Try again, success: a new checkout, and the browser leaves for the address it gave (${k1.length} calls)`);

  // A fresh load (a hash-only goto keeps the page and its state): the checkout is ready before the press.
  await p.goto('about:blank');
  await p.goto(`${BASE}#/now`, { waitUntil: 'load' });
  await max.waitFor({ timeout: 30000 });
  await until(() => keep(bodies).length >= 3, 10000);
  await sleep(2500);
  const all = (await p.locator('.trial-ended').innerText()).replace(/\s+/g, ' ');
  const maxCard = (await p.locator('.trial-end-max[data-tier=max]').innerText()).replace(/\s+/g, ' ');
  check(/Max · \$0\.99 a month/.test(maxCard) && /What you have now/i.test(maxCard), `Max shows $0.99 a month ("${maxCard.slice(0, 60)}")`);
  check(!/first month/i.test(all) && !/\bPlus\b/.test(all) && !/\$[1-9]\.99/.test(all) && (await p.locator('.intro-was, .plan-choice[data-tier=plus]').count()) === 0, 'no first-month offer, no Plus, no other price anywhere on the screen');
  const freeCard = (await p.locator('.trial-end-free[data-tier=free]').innerText()).replace(/\s+/g, ' ');
  check(/Free · \$0/.test(freeCard) && (await p.locator('.trial-end-free button.trial-end-stay').innerText()).trim() === 'Stay on Free', 'Stay on Free is still there, a real button');
  await p.screenshot({ path: 'docs/screens/intro-plus/trial-end-offer.png' });
  const before = keep(bodies).length;
  const t1 = Date.now();
  await max.click();
  await p.waitForURL(/checkout=mocked/, { timeout: 15000 });
  check(keep(bodies).length === before, `ready before the press: Keep Max leaves at once with no call (${Date.now() - t1} ms, ${keep(bodies).length - before} calls)`);
  check(bodies.every((b) => b.tier === 'max' && !('offer' in b)), `every checkout asked for Max with no offer (${bodies.length} calls)`);
  await ctx.close();
} finally {
  await browser.close();
  console.log(`removed ${await kit.cleanup()} throwaways`);
}
console.log(checks.every(Boolean) ? 'PASS' : 'FAIL');
process.exit(checks.every(Boolean) ? 0 : 1);
