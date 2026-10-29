// Stripe Checkout for Max (2026-10-29: Max at $0.99 a month; Plus and the intro offers are gone). The key in the
// environment decides test or live; the price is the active one with Max's lookup key in that mode, so the code went
// live before the price was made. Stripe Checkout (Managed Payments: Stripe is the seller of record) shows Apple Pay
// and Google Pay at the top on a device that has them, with the student's email filled in. The browser only ever gets
// the Checkout URL.
//
// Fast (George: it took about 30 seconds): one Stripe call on most presses. The price is found once per warm server;
// the customer is made once per account (never looked up on every press); no coupon calls. The app asks for the
// session as soon as the Max card is on screen, so the press only opens it. Each answer says how long its steps took.
import Stripe from 'npm:stripe@18';
import { admin, json, guard, userFromRequest } from '../_shared/admin.ts';
import { MAX_PRICE_LOOKUP_KEY } from '../_shared/tiers.ts';

// Created per request, after the key check: constructing it with no key set throws and takes the function down.
const stripeClient = () => new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', { httpClient: Stripe.createFetchHttpClient() });

/** Max's price in this mode, found by its lookup key, kept for ten minutes per warm server. */
let priceCache: { id: string; at: number; live: boolean } | null = null;
async function maxPrice(stripe: Stripe, live: boolean): Promise<string | null> {
  if (priceCache && priceCache.live === live && Date.now() - priceCache.at < 10 * 60_000) return priceCache.id;
  const list = await stripe.prices.list({ lookup_keys: [MAX_PRICE_LOOKUP_KEY], active: true, limit: 1 });
  const id = list.data[0]?.id ?? null;
  priceCache = id ? { id, at: Date.now(), live } : null;
  return id;
}

/** Where a student may be sent back to: Halo+ itself, or the Halo page they paid from (the extension). */
const okReturn = (u: string) => /^https:\/\/(haloplus\.app|richardsgeorger-collab\.github\.io|halo\.gcu\.edu)(\/|$)/.test(u) || /^http:\/\/localhost(:\d+)?(\/|$)/.test(u);

Deno.serve(guard(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization, apikey, content-type, x-client-info', 'access-control-allow-methods': 'POST, OPTIONS', 'access-control-max-age': '86400' } });
  if (req.method !== 'POST') return json(405, { error: 'POST only' });
  const key = Deno.env.get('STRIPE_SECRET_KEY') ?? '';
  if (!key) return json(503, { error: 'Checkout is not switched on yet.' });
  const t0 = Date.now();
  const ms: Record<string, number> = {};
  const lap = (name: string, from: number) => (ms[name] = Date.now() - from);
  const body = (await req.json().catch(() => ({}))) as { tier?: string; returnTo?: string; next?: string; source?: string; warm?: boolean };
  // A warm-up (the Max card coming on screen before the student is signed in, or just waking the server).
  if (body.warm) return json(200, { warm: true });
  const user = await userFromRequest(req);
  lap('user', t0);
  if (!user) return json(401, { error: 'Sign in first.' });
  if ((body.tier ?? 'max') !== 'max') return json(400, { error: 'No such plan.' });

  const stripe = stripeClient();
  const live = /^(sk|rk)_live_/.test(key);
  const t1 = Date.now();
  const price = await maxPrice(stripe, live);
  lap('price', t1);
  if (!price) return json(503, { error: 'Max checkout is being updated. Try again in a few minutes.' });

  const returnTo = typeof body.returnTo === 'string' && okReturn(body.returnTo) ? body.returnTo : '';
  if (!returnTo) return json(400, { error: 'Missing return address.' });
  const source = body.source === 'halo' || body.source === 'popup' ? body.source : 'app';
  const onHalo = returnTo.startsWith('https://halo.gcu.edu');
  // Where to land after paying: the Halo page they paid from, or a route inside Halo+.
  const next = typeof body.next === 'string' && /^\/(practice|now|study|you|inbox)(\?[A-Za-z0-9=&_.-]*)?$/.test(body.next) ? body.next : '/you?s=plan';
  const success = onHalo ? `${returnTo}${returnTo.includes('#') ? '&' : '#'}haloplus-max=on` : `${returnTo}#${next}${next.includes('?') ? '&' : '?'}checkout=success`;
  const cancel = onHalo ? returnTo : `${returnTo}#/you?s=plan&checkout=cancel`;

  const db = admin();
  const t2 = Date.now();
  const { data: profile } = await db.from('profiles').select('stripe_customer_id').eq('user_id', user.id).maybeSingle();
  let customer = (profile?.stripe_customer_id as string | null) ?? null;
  const makeCustomer = async () => {
    const created = await stripe.customers.create({ email: user.email ?? undefined, metadata: { user_id: user.id } });
    await db.from('profiles').update({ stripe_customer_id: created.id }).eq('user_id', user.id);
    return created.id;
  };
  if (!customer) customer = await makeCustomer();
  lap('customer', t2);

  const create = (c: string) =>
    stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: c,
      line_items: [{ price, quantity: 1 }],
      allow_promotion_codes: true,
      success_url: success,
      cancel_url: cancel,
      metadata: { user_id: user.id, source },
      subscription_data: { metadata: { user_id: user.id, source } },
    });
  const t3 = Date.now();
  let session: Stripe.Checkout.Session;
  try {
    session = await create(customer);
  } catch (e) {
    // A customer made in test mode does not exist in live mode (and one can be deleted): a new one, once.
    if (!/No such customer/i.test(e instanceof Error ? e.message : String(e))) throw e;
    customer = await makeCustomer();
    session = await create(customer);
  }
  lap('session', t3);
  lap('total', t0);
  return json(200, { url: session.url, ms });
}, 'stripe-checkout'));
