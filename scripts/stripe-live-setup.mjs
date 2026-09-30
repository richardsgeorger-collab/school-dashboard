// Switches Halo+ billing to Stripe LIVE mode (2026-09-30). Run by George after his Stripe account is activated.
// The live key is read from the macOS keychain (service "Stripe live secret key") and never printed or written to
// the repo. Idempotent: running it again finds what it made before instead of making it twice.
//   node scripts/stripe-live-setup.mjs          # dry run: says what it would do, changes nothing
//   node scripts/stripe-live-setup.mjs --go     # does it
// What --go does, in live mode:
//   1. Products "Plus" and "Max" (metadata tier) and monthly USD prices $4.99 and $7.99 (lookup keys plus_month,
//      max_month). Prices are never changed or deleted by this script.
//   2. The webhook endpoint to the stripe-webhook function with the five events the function handles.
//   3. The customer portal: cancel at period end, card update, invoices, email; privacy and terms on haloplus.app.
//   4. Writes the live price ids into src/config/tiers.ts and supabase/functions/_shared/tiers.ts.
//   5. Sets STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET on Supabase (through a temp file that is deleted after).
// It does not deploy: after it, run the tests, commit, and deploy stripe-checkout, stripe-portal, stripe-webhook and
// referral-credit (the order in docs/STRIPE-LIVE.md).
import { execFileSync } from 'node:child_process';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const GO = process.argv.includes('--go');
const REF = 'kiacmspgvntzwngijibr';
const WEBHOOK_URL = `https://${REF}.supabase.co/functions/v1/stripe-webhook`;
const EVENTS = ['checkout.session.completed', 'customer.subscription.created', 'customer.subscription.updated', 'customer.subscription.deleted', 'invoice.payment_failed'];
const PLANS = [
  { tier: 'plus', name: 'Plus', amount: 499, lookup: 'plus_month' },
  { tier: 'max', name: 'Max', amount: 799, lookup: 'max_month' },
];

let KEY;
try {
  KEY = execFileSync('security', ['find-generic-password', '-s', 'Stripe live secret key', '-w'], { encoding: 'utf8' }).trim();
} catch {
  console.error('No key in the keychain. Add it first (it asks for the key without echoing it):\n  security add-generic-password -s "Stripe live secret key" -a haloplus -w');
  process.exit(1);
}
if (!/^(sk|rk)_live_/.test(KEY)) {
  console.error('The keychain entry is not a live key (it should start with sk_live_ or rk_live_).');
  process.exit(1);
}

const form = (obj, prefix = '', out = new URLSearchParams()) => {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}[${k}]` : k;
    if (v === undefined) continue;
    if (Array.isArray(v)) v.forEach((x, i) => (typeof x === 'object' ? form(x, `${key}[${i}]`, out) : out.append(`${key}[${i}]`, String(x))));
    else if (v && typeof v === 'object') form(v, key, out);
    else out.append(key, String(v));
  }
  return out;
};
const api = async (method, path, body) => {
  const r = await fetch(`https://api.stripe.com/v1/${path}`, { method, headers: { authorization: `Bearer ${KEY}`, 'content-type': 'application/x-www-form-urlencoded' }, ...(method === 'GET' ? {} : { body: form(body ?? {}) }) });
  const j = await r.json();
  if (!r.ok) throw new Error(`${method} ${path}: ${j.error?.message ?? r.status}`);
  return j;
};
const say = (s) => console.log(`${GO ? '' : '[dry run] '}${s}`);

const account = await api('GET', 'account');
console.log(`Stripe account: ${account.settings?.dashboard?.display_name ?? account.id} · charges ${account.charges_enabled ? 'enabled' : 'NOT enabled yet'} · payouts ${account.payouts_enabled ? 'enabled' : 'NOT enabled yet'}`);
if (!account.charges_enabled) console.log('Stripe will not take payments until the account is activated (Dashboard → Activate payments).');

// 1. Products and prices.
const ids = {};
const existing = (await api('GET', `prices?lookup_keys[]=plus_month&lookup_keys[]=max_month&active=true&limit=10`)).data;
for (const p of PLANS) {
  const found = existing.find((x) => x.lookup_key === p.lookup);
  if (found) {
    if (found.unit_amount !== p.amount) throw new Error(`Live price ${p.lookup} is ${found.unit_amount} cents, expected ${p.amount}. Not touching it; fix by hand.`);
    ids[p.tier] = found.id;
    say(`${p.name}: live price already there (${found.id}, $${(p.amount / 100).toFixed(2)}/month)`);
    continue;
  }
  say(`${p.name}: create product and $${(p.amount / 100).toFixed(2)}/month price`);
  if (!GO) continue;
  const products = (await api('GET', 'products/search?query=' + encodeURIComponent(`metadata['tier']:'${p.tier}' AND active:'true'`))).data;
  const product = products[0] ?? (await api('POST', 'products', { name: p.name, metadata: { tier: p.tier } }));
  const price = await api('POST', 'prices', { product: product.id, currency: 'usd', unit_amount: p.amount, recurring: { interval: 'month' }, lookup_key: p.lookup, metadata: { tier: p.tier, interval: 'month' } });
  ids[p.tier] = price.id;
}

// 2. Webhook.
let webhookSecret = null;
const hooks = (await api('GET', 'webhook_endpoints?limit=100')).data.filter((h) => h.url === WEBHOOK_URL);
if (hooks.length) {
  say(`webhook to stripe-webhook already exists (${hooks[0].id}); its signing secret is only shown once, so it is not changed here`);
  const missing = EVENTS.filter((e) => !hooks[0].enabled_events.includes(e) && !hooks[0].enabled_events.includes('*'));
  if (missing.length) { say(`adding events: ${missing.join(', ')}`); if (GO) await api('POST', `webhook_endpoints/${hooks[0].id}`, { enabled_events: [...new Set([...hooks[0].enabled_events, ...EVENTS])] }); }
} else {
  say(`create the webhook → ${WEBHOOK_URL} (${EVENTS.length} events)`);
  if (GO) webhookSecret = (await api('POST', 'webhook_endpoints', { url: WEBHOOK_URL, enabled_events: EVENTS, description: 'Halo+ plans' })).secret;
}

// 3. Customer portal.
const portal = { business_profile: { headline: 'Manage your Halo+ plan', privacy_policy_url: 'https://haloplus.app/privacy.html', terms_of_service_url: 'https://haloplus.app/terms.html' }, default_return_url: 'https://haloplus.app/#/you?s=plan',
  features: { customer_update: { enabled: true, allowed_updates: ['email'] }, invoice_history: { enabled: true }, payment_method_update: { enabled: true }, subscription_cancel: { enabled: true, mode: 'at_period_end', proration_behavior: 'none' }, subscription_update: { enabled: false } } };
const configs = (await api('GET', 'billing_portal/configurations?is_default=true&limit=1')).data;
say(configs.length ? `update the default customer portal (${configs[0].id})` : 'create the default customer portal');
if (GO) await api('POST', configs.length ? `billing_portal/configurations/${configs[0].id}` : 'billing_portal/configurations', portal);

// 4. Price ids into the code.
if (GO) {
  for (const f of ['src/config/tiers.ts', 'supabase/functions/_shared/tiers.ts']) {
    let s = readFileSync(f, 'utf8');
    // Only the placeholders are replaced; a second run finds the ids already written.
    s = s.replace("'PLACEHOLDER_LIVE_PLUS_MONTH'", `'${ids.plus}'`).replace("'PLACEHOLDER_LIVE_MAX_MONTH'", `'${ids.max}'`);
    writeFileSync(f, s);
  }
  console.log(`live price ids written to both tiers.ts: plus ${ids.plus}, max ${ids.max}`);
} else say('write the live price ids into src/config/tiers.ts and supabase/functions/_shared/tiers.ts');

// 5. Secrets on Supabase.
say(`set STRIPE_SECRET_KEY${webhookSecret || !GO ? ' and STRIPE_WEBHOOK_SECRET' : ''} on Supabase`);
if (GO) {
  const tmp = join(tmpdir(), `stripe-live-${process.pid}.env`);
  writeFileSync(tmp, `STRIPE_SECRET_KEY=${KEY}\n${webhookSecret ? `STRIPE_WEBHOOK_SECRET=${webhookSecret}\n` : ''}`, { mode: 0o600 });
  try {
    const token = execFileSync('security', ['find-generic-password', '-s', 'Supabase CLI', '-w'], { encoding: 'utf8' }).trim();
    execFileSync('npx', ['supabase', 'secrets', 'set', '--env-file', tmp, '--project-ref', REF], { env: { ...process.env, SUPABASE_ACCESS_TOKEN: token }, stdio: 'inherit' });
  } finally {
    rmSync(tmp, { force: true });
  }
  if (!webhookSecret && hooks.length) console.log('The webhook already existed, so STRIPE_WEBHOOK_SECRET was left as it is: if it is still the test one, roll the live secret in the Dashboard (Developers → Webhooks → the endpoint → Roll secret) and set it.');
}
console.log(GO ? 'Done. Next: tests, commit, deploy the four billing functions (docs/STRIPE-LIVE.md).' : 'Nothing changed. Run with --go to do it.');
