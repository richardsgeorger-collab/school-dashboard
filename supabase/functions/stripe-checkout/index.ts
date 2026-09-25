// Stripe Checkout for one plan. TEST MODE until launch: the key in the environment decides, and placeholder price
// ids refuse to run at all. The browser only ever gets the Checkout URL.
import Stripe from 'npm:stripe@18';
import { admin, json, guard, userFromRequest } from '../_shared/admin.ts';
import { STRIPE_PRICE_IDS } from '../_shared/tiers.ts';

// Created per request, after the key check: constructing it with no key set throws and takes the function down.
const stripeClient = () => new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', { httpClient: Stripe.createFetchHttpClient() });

Deno.serve(guard(async (req) => {
  if (req.method === 'OPTIONS') return json(204, {});
  if (req.method !== 'POST') return json(405, { error: 'POST only' });
  if (!Deno.env.get('STRIPE_SECRET_KEY')) return json(503, { error: 'Checkout is not switched on yet.' });
  const stripe = stripeClient();
  const user = await userFromRequest(req);
  if (!user) return json(401, { error: 'Sign in first.' });

  const body = (await req.json().catch(() => ({}))) as { tier?: string; interval?: string; returnTo?: string };
  const tier = body.tier as keyof typeof STRIPE_PRICE_IDS;
  const interval = body.interval === 'year' ? 'year' : 'month';
  const price = STRIPE_PRICE_IDS[tier]?.[interval];
  if (!price) return json(400, { error: 'No such plan.' });
  if (price.includes('PLACEHOLDER')) return json(503, { error: 'Checkout is not switched on yet.' });
  const returnTo = typeof body.returnTo === 'string' && body.returnTo.startsWith('http') ? body.returnTo : '';
  if (!returnTo) return json(400, { error: 'Missing return address.' });

  const db = admin();
  const { data: profile } = await db.from('profiles').select('stripe_customer_id').eq('user_id', user.id).maybeSingle();
  let customer = profile?.stripe_customer_id as string | null;
  if (!customer) {
    const created = await stripe.customers.create({ email: user.email ?? undefined, metadata: { user_id: user.id } });
    customer = created.id;
    await db.from('profiles').update({ stripe_customer_id: customer }).eq('user_id', user.id);
  }

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer,
    line_items: [{ price, quantity: 1 }],
    allow_promotion_codes: true,
    success_url: `${returnTo}#/you?s=plan&checkout=success`,
    cancel_url: `${returnTo}#/you?s=plan&checkout=cancel`,
    metadata: { user_id: user.id },
    subscription_data: { metadata: { user_id: user.id } },
  });
  return json(200, { url: session.url });
}));
