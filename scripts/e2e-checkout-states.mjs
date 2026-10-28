// The checkout button's states (George, 2026-10-09: Choose Plus took ~30 s with no sign anything was happening).
// A throwaway whose trial just ended sees the one-screen end of trial; the checkout function is mocked here (never
// Stripe): slow, then failing, then succeeding with a local address. Pressed: spinner and "Opening secure checkout…",
// the other plan button disabled; past 10 s "Still working, almost there…"; on failure a clear error with Try again
// and a report to Admin > Errors; on success the browser leaves for the address the function gave. The first-month
// offer (Plus $0.99, Max $2.99) shows on both paid cards for an account that may take it, and not once it is used.
//   KEYS_ENV=... [BASE=http://localhost:4174/school-dashboard/] node scripts/e2e-checkout-states.mjs
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright-core';
import { personaKit } from './lib/personas.mjs';

const env = Object.fromEntries(readFileSync(process.env.KEYS_ENV, 'utf8').split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]));
const BASE = process.env.BASE ?? 'http://localhost:4174/school-dashboard/';
const ref = new URL(env.VITE_SUPABASE_URL).hostname.split('.')[0];
const kit = personaKit(env);
const checks = [];
const check = (ok, line) => { checks.push(ok); console.log(`${ok ? 'ok  ' : 'FAIL'} ${line}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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
    if (r.request().method() === 'OPTIONS') { warmups += 1; return r.fulfill({ status: 204 }); }
    try { bodies.push(JSON.parse(r.request().postData() || '{}')); } catch { /* ignore */ }
    if (mode === 'slow-fail') { await sleep(12500); return r.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'Stripe could not be reached.' }) }); }
    return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ url: `${BASE}#/you?s=plan&checkout=mocked` }) });
  });
  const p = await ctx.newPage();
  await p.goto(`${BASE}#/now`, { waitUntil: 'load' });
  await p.waitForSelector('.trial-ended .story-plans', { timeout: 30000 });
  await sleep(2500);
  check(warmups >= 1, `the checkout function was woken as the plans appeared (${warmups} warm-up call)`);
  const plus = p.locator('.story-plans button:has-text("Choose Plus")');
  const max = p.locator('.story-plans button:has-text("Keep Max")');
  const t0 = Date.now();
  await plus.click();
  await sleep(600);
  const opening = p.locator('.story-plans button.is-opening');
  check((await opening.count()) === 1 && /Opening secure checkout/.test(await opening.innerText()) && (await opening.locator('.spinner').count()) === 1, 'pressed: spinner and "Opening secure checkout…" at once');
  check(await max.isDisabled(), 'the other plan button is disabled meanwhile');
  await sleep(10200);
  check(/Still working, almost there/.test(await opening.innerText()), `past 10 s: "Still working, almost there…" (${Math.round((Date.now() - t0) / 1000)} s)`);
  await p.waitForSelector('.checkout-error', { timeout: 15000 });
  const err = (await p.locator('.checkout-error').innerText()).replace(/\s+/g, ' ');
  check(/Stripe could not be reached/.test(err) && /Try again/.test(err), `on failure: the error and Try again ("${err}")`);
  check(!(await max.isDisabled()) && (await plus.innerText()).trim() === 'Choose Plus', 'both buttons are back');
  await sleep(1500);
  check(reports.some((r) => /Checkout/.test(r.title ?? '') && (r.status === 500 || /500/.test(r.message ?? ''))), `the failure went to Admin > Errors (${reports.map((r) => r.title).join(' | ')})`);
  mode = 'ok';
  await p.locator('.checkout-error button:has-text("Try again")').click();
  await p.waitForURL(/checkout=mocked/, { timeout: 15000 });
  check(p.url().includes('checkout=mocked'), 'Try again, success: the browser leaves for the address checkout gave');
  // Both paid plans carry the first-month offer for this account (an ended free trial, never paid); the server decides.
  check(bodies.every((b) => b.tier === 'plus' && b.offer === 'intro'), `Choose Plus asks for Plus with offer:intro (${bodies.length} calls)`);
  const state = (await (await kit.signIn(who.email)).c.rpc('intro_offer_state')).data;
  check(state?.eligible === true, `the account may have the intro offer (${JSON.stringify(state)})`);
  await p.goto('about:blank');
  await p.goto(`${BASE}#/now`, { waitUntil: 'load' });
  await p.waitForSelector('.trial-ended .story-plans', { timeout: 30000 });
  await sleep(2000);
  // The cards since Loop 268 (Plus's offer since 2026-10-27): "Plus · $0.99 the first month / then $4.99 a month",
  // "Max · $2.99 the first month / then $7.99 a month".
  const plusCard = (await p.locator('.plan-choice[data-tier=plus]').innerText()).replace(/\s+/g, ' ');
  check(/Plus · \$0\.99 the first month/.test(plusCard) && /then \$4\.99 a month/.test(plusCard), `Plus shows $0.99 the first month, then $4.99 a month ("${plusCard.slice(0, 80)}")`);
  const maxCard = (await p.locator('.plan-choice[data-tier=max]').innerText()).replace(/\s+/g, ' ');
  check(/Max · \$2\.99 the first month/.test(maxCard) && /then \$7\.99 a month/.test(maxCard), `Max shows $2.99 the first month, then $7.99 a month ("${maxCard.slice(0, 80)}")`);
  const freeCard = (await p.locator('.plan-choice[data-tier=free]').innerText()).replace(/\s+/g, ' ');
  check(/Stay on Free/.test(freeCard), 'Stay on Free is still there, a button like the others');
  await p.screenshot({ path: 'docs/screens/intro-plus/trial-end-offer.png' });
  await max.click();
  await p.waitForURL(/checkout=mocked/, { timeout: 15000 });
  check(bodies[bodies.length - 1]?.tier === 'max' && bodies[bodies.length - 1]?.offer === 'intro', `Keep Max asks for Max with offer:intro (${JSON.stringify(bodies[bodies.length - 1])})`);

  // One intro per account: once it is used (on either plan), both cards show the regular price and ask for no offer.
  await kit.db.from('profiles').update({ intro_offer_at: new Date().toISOString(), intro_offer_tier: 'plus' }).eq('user_id', who.id);
  const used = (await (await kit.signIn(who.email)).c.rpc('intro_offer_state')).data;
  check(used?.eligible === false && used?.why === 'used', `after a Plus intro the account has no more (${JSON.stringify(used)})`);
  // A fresh load (a hash-only goto keeps the page and its state).
  await p.goto('about:blank');
  await p.goto(`${BASE}#/now`, { waitUntil: 'load' });
  await p.waitForSelector('.trial-ended .story-plans', { timeout: 30000 });
  await sleep(2000);
  const plusAfter = (await p.locator('.plan-choice[data-tier=plus]').innerText()).replace(/\s+/g, ' ');
  const maxAfter = (await p.locator('.plan-choice[data-tier=max]').innerText()).replace(/\s+/g, ' ');
  check(/Plus · \$4\.99 a month/.test(plusAfter) && !/first month/.test(plusAfter) && /Max · \$7\.99 a month/.test(maxAfter) && !/first month/.test(maxAfter), `used: regular prices on both ("${plusAfter.slice(0, 40)}" / "${maxAfter.slice(0, 40)}")`);
  const before = bodies.length;
  await p.locator('.story-plans button:has-text("Choose Plus")').click();
  await p.waitForURL(/checkout=mocked/, { timeout: 15000 });
  check(bodies.length === before + 1 && bodies[before].tier === 'plus' && !bodies[before].offer, `used: Choose Plus asks for no offer (${JSON.stringify(bodies[before])})`);
  await ctx.close();
} finally {
  await browser.close();
  console.log(`removed ${await kit.cleanup()} throwaways`);
}
console.log(checks.every(Boolean) ? 'PASS' : 'FAIL');
process.exit(checks.every(Boolean) ? 0 : 1);
