// One-click cancel on the real backend, in Stripe TEST mode: a throwaway account gets a real sandbox subscription to
// Plus (test card), the You page shows "Cancel plan", and one click lands on Stripe's cancel confirmation for exactly
// that subscription. Confirming there (as a student would) sets it to end at the period end. Everything is removed.
//   KEYS_ENV=/path/to/keys.env BASE=http://localhost:4174/school-dashboard/ node scripts/e2e-cancel.mjs   (needs the Stripe CLI on the sandbox key)
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';
import { chromium } from 'playwright-core';
const env = Object.fromEntries(readFileSync(process.env.KEYS_ENV, 'utf8').split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]));
const BASE = process.env.BASE ?? 'http://localhost:4174/school-dashboard/';
const tiers = readFileSync('src/config/tiers.ts', 'utf8');
const PLUS_MONTH = tiers.match(/plus: \{ month: '(price_[A-Za-z0-9]+)'/)[1];
const stripe = (args) => { const out = JSON.parse(execFileSync('stripe', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })); if (out.livemode) throw new Error('LIVE MODE: stopping'); return out; };
const ref = new URL(env.VITE_SUPABASE_URL).hostname.split('.')[0];
const admin = createClient(env.VITE_SUPABASE_URL, env.SERVICE_ROLE, { auth: { persistSession: false } });
const email = `e2e-cancel-${Date.now()}@example.invalid`;
const { data: created } = await admin.auth.admin.createUser({ email, email_confirm: true });
const userId = created.user.id;
const checks = [];
const check = (ok, line) => { checks.push(ok); console.log(`${ok ? 'ok  ' : 'FAIL'} ${line}`); };
let customer = null;
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  customer = stripe(['customers', 'create', '--email', email, '-d', `metadata[user_id]=${userId}`]);
  const pm = stripe(['payment_methods', 'attach', 'pm_card_visa', '--customer', customer.id]);
  stripe(['customers', 'update', customer.id, '-d', `invoice_settings[default_payment_method]=${pm.id}`]);
  const sub = stripe(['subscriptions', 'create', '--customer', customer.id, '-d', `items[0][price]=${PLUS_MONTH}`]);
  check(sub.status === 'active' && sub.items.data[0].price.unit_amount === 499, `sandbox subscription: ${sub.id} ${sub.status} $${(sub.items.data[0].price.unit_amount / 100).toFixed(2)}/${sub.items.data[0].price.recurring.interval}`);
  // What the webhook writes, written here so the check does not depend on webhook delivery to this machine.
  await admin.from('profiles').update({ stripe_customer_id: customer.id, tier: 'plus' }).eq('user_id', userId);
  const periodEnd = sub.items.data[0].current_period_end ?? sub.current_period_end;
  await admin.from('subscriptions').upsert({ user_id: userId, stripe_subscription_id: sub.id, tier: 'plus', interval: 'month', status: 'active', current_period_end: new Date(periodEnd * 1000).toISOString(), cancel_at_period_end: false });
  const { data: link } = await admin.auth.admin.generateLink({ type: 'magiclink', email });
  const c = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data: s } = await c.auth.verifyOtp({ token_hash: link.properties.hashed_token, type: 'magiclink' });
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
  await page.goto(`${BASE}#/you`, { waitUntil: 'networkidle' });
  await page.evaluate(({ s, key }) => { localStorage.setItem(key, JSON.stringify(s)); const d = JSON.parse(localStorage.getItem('school-dashboard:v1') ?? 'null'); if (d) { d.settings.onboarding = { startedAt: 'x', step: 'done', doneAt: 'x', skippedAt: null, tourDoneAt: 'x' }; localStorage.setItem('school-dashboard:v1', JSON.stringify(d)); } }, { s: s.session, key: `sb-${ref}-auth-token` });
  await page.goto(`${BASE}#/you`, { waitUntil: 'networkidle' }); await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(3000);
  // The one-time welcome to the new plan comes first for a student who just paid.
  await page.click('.upgrade button:has-text("Skip"), .upgrade button:has-text("Maybe later"), .upgrade button:has-text("Later")', { timeout: 4000 }).catch(() => undefined);
  await page.waitForTimeout(800);
  await page.goto(`${BASE}#/you`, { waitUntil: 'load' }); await page.waitForTimeout(1500);
  const btn = await page.$('button:has-text("Cancel plan")');
  check(!!btn, 'You shows "Cancel plan" beside Manage plan');
  await page.screenshot({ path: 'docs/screens/frozen/you-cancel.png' });
  const [url] = await Promise.all([page.waitForURL(/billing\.stripe\.com/, { timeout: 20000 }).then(() => page.url()).catch(() => null), btn?.click()]);
  check(!!url, `one click opens Stripe's portal: ${url?.slice(0, 60)}`);
  await page.waitForTimeout(4000);
  const text = await page.evaluate(() => document.body.innerText.replace(/\s+/g, ' ')).catch(() => '');
  check(/cancel/i.test(text) && /4\.99/.test(text), `it opens on the cancel confirmation for Plus ($4.99): ${text.slice(0, 140)}`);
  const confirm = await page.$('button:has-text("Cancel subscription"), button:has-text("Cancel plan"), [data-testid="confirm"]');
  if (confirm) {
    await confirm.click();
    // Stripe answers on its own page, then redirects back to You.
    await page.waitForURL((u) => !String(u).includes('billing.stripe.com'), { timeout: 20000 }).catch(() => undefined);
    await page.waitForTimeout(2000);
    const after = stripe(['subscriptions', 'retrieve', sub.id]);
    // Newer API versions record a cancel at the period end as cancel_at (a date) rather than the old flag.
    const scheduled = after.cancel_at_period_end === true || (!!after.cancel_at && after.status === 'active');
    check(scheduled, `confirmed: runs to the period end, then stops (status ${after.status}, cancel_at ${after.cancel_at ? new Date(after.cancel_at * 1000).toISOString().slice(0, 10) : null}, cancel_at_period_end ${after.cancel_at_period_end}); back on ${page.url().slice(0, 60)}`);
  } else check(false, 'no confirm button on the cancel page');
} finally {
  await browser.close();
  if (customer) try { stripe(['customers', 'delete', customer.id]); } catch { /* already gone */ }
  for (const t of ['subscriptions', 'courses', 'items', 'settings', 'usage_log', 'usage_events', 'read_ledger', 'announcements']) await admin.from(t).delete().eq('user_id', userId);
  const { error } = await admin.auth.admin.deleteUser(userId);
  console.log('throwaway and sandbox customer removed:', error ? error.message : 'ok');
}
console.log(checks.every(Boolean) ? 'PASS' : 'FAIL');
