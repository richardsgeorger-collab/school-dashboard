// Stripe's customer portal: change the card, switch plans, cancel. Only for a customer that exists.
import Stripe from 'npm:stripe@17';
import { admin, json, userFromRequest } from '../_shared/admin.ts';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', { httpClient: Stripe.createFetchHttpClient() });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return json(204, {});
  if (req.method !== 'POST') return json(405, { error: 'POST only' });
  if (!Deno.env.get('STRIPE_SECRET_KEY')) return json(503, { error: 'Billing is not switched on yet.' });
  const user = await userFromRequest(req);
  if (!user) return json(401, { error: 'Sign in first.' });
  const body = (await req.json().catch(() => ({}))) as { returnTo?: string };
  const returnTo = typeof body.returnTo === 'string' && body.returnTo.startsWith('http') ? body.returnTo : '';
  const { data: profile } = await admin().from('profiles').select('stripe_customer_id').eq('user_id', user.id).maybeSingle();
  const customer = profile?.stripe_customer_id as string | null;
  if (!customer) return json(404, { error: 'No plan to manage yet.' });
  const session = await stripe.billingPortal.sessions.create({ customer, return_url: `${returnTo}#/you?s=plan` });
  return json(200, { url: session.url });
});
