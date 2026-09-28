// Stripe's customer portal: change the card, switch plans, cancel. Only for a customer that exists.
import Stripe from 'npm:stripe@18';
import { admin, json, guard, userFromRequest } from '../_shared/admin.ts';

// Created per request, after the key check: constructing it with no key set throws and takes the function down.
const stripeClient = () => new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', { httpClient: Stripe.createFetchHttpClient() });

Deno.serve(guard(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization, apikey, content-type, x-client-info', 'access-control-allow-methods': 'POST, OPTIONS', 'access-control-max-age': '86400' } });
  if (req.method !== 'POST') return json(405, { error: 'POST only' });
  if (!Deno.env.get('STRIPE_SECRET_KEY')) return json(503, { error: 'Billing is not switched on yet.' });
  const stripe = stripeClient();
  const user = await userFromRequest(req);
  if (!user) return json(401, { error: 'Sign in first.' });
  const body = (await req.json().catch(() => ({}))) as { returnTo?: string; flow?: string };
  const returnTo = typeof body.returnTo === 'string' && body.returnTo.startsWith('http') ? body.returnTo : '';
  const { data: profile } = await admin().from('profiles').select('stripe_customer_id').eq('user_id', user.id).maybeSingle();
  const customer = profile?.stripe_customer_id as string | null;
  if (!customer) return json(404, { error: 'No plan to manage yet.' });
  const return_url = `${returnTo}#/you?s=plan`;
  // Cancel is one click from You: the portal opens on the cancel confirmation for this plan and comes back after.
  if (body.flow === 'cancel') {
    const { data: sub } = await admin().from('subscriptions').select('stripe_subscription_id, status, cancel_at_period_end').eq('user_id', user.id).maybeSingle();
    if (sub?.stripe_subscription_id && !sub.cancel_at_period_end && ['active', 'trialing', 'past_due'].includes(sub.status)) {
      const session = await stripe.billingPortal.sessions.create({
        customer,
        return_url,
        flow_data: { type: 'subscription_cancel', subscription_cancel: { subscription: sub.stripe_subscription_id }, after_completion: { type: 'redirect', redirect: { return_url } } },
      });
      return json(200, { url: session.url });
    }
  }
  const session = await stripe.billingPortal.sessions.create({ customer, return_url });
  return json(200, { url: session.url });
}));
