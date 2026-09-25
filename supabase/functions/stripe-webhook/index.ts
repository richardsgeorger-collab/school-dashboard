// Stripe tells us what happened to a subscription; this is the only thing that ever changes a paid tier. The
// signature is verified before anything is read. The mapping from status to plan is the same pure code the client
// uses (_shared/subscription.ts), so both sides agree on what "past due" means.
import Stripe from 'npm:stripe@17';
import { admin, json } from '../_shared/admin.ts';
import { profilePatch, subscriptionRow } from '../_shared/subscription.ts';

// Created per request, after the key check: constructing it with no key set throws and takes the function down.
const stripeClient = () => new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', { httpClient: Stripe.createFetchHttpClient() });

async function userIdFor(db: ReturnType<typeof admin>, sub: Stripe.Subscription): Promise<string | null> {
  const fromMeta = sub.metadata?.user_id;
  if (fromMeta) return fromMeta;
  const customer = typeof sub.customer === 'string' ? sub.customer : sub.customer.id;
  const { data } = await db.from('profiles').select('user_id').eq('stripe_customer_id', customer).maybeSingle();
  return (data?.user_id as string | undefined) ?? null;
}

async function apply(db: ReturnType<typeof admin>, sub: Stripe.Subscription, now: string) {
  const userId = await userIdFor(db, sub);
  if (!userId) return;
  const item = sub.items.data[0];
  const facts = {
    status: sub.status,
    priceId: item?.price?.id ?? null,
    currentPeriodEnd: item?.current_period_end ? new Date(item.current_period_end * 1000).toISOString() : sub.current_period_end ? new Date(sub.current_period_end * 1000).toISOString() : null,
    cancelAtPeriodEnd: !!sub.cancel_at_period_end,
  };
  const patch = profilePatch(facts, now);
  await db.from('profiles').update({ tier: patch.tier, grace_until: patch.grace_until }).eq('user_id', userId);
  const row = subscriptionRow(facts, userId, sub.id, now);
  if (row) await db.from('subscriptions').upsert(row, { onConflict: 'user_id' });
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'POST only' });
  if (!Deno.env.get('STRIPE_SECRET_KEY') || !Deno.env.get('STRIPE_WEBHOOK_SECRET')) return json(503, { error: 'Billing is not switched on yet.' });
  const stripe = stripeClient();
  const crypto = Stripe.createSubtleCryptoProvider();
  const secret = Deno.env.get('STRIPE_WEBHOOK_SECRET') ?? '';
  const sig = req.headers.get('stripe-signature') ?? '';
  const body = await req.text();
  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(body, sig, secret, undefined, crypto);
  } catch (e) {
    return json(400, { error: `Bad signature: ${e instanceof Error ? e.message : String(e)}` });
  }
  const db = admin();
  const now = new Date().toISOString();
  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session;
      if (typeof session.subscription === 'string') await apply(db, await stripe.subscriptions.retrieve(session.subscription), now);
      break;
    }
    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted':
      await apply(db, event.data.object as Stripe.Subscription, now);
      break;
    case 'invoice.payment_failed': {
      const invoice = event.data.object as Stripe.Invoice;
      const subId = typeof invoice.subscription === 'string' ? invoice.subscription : invoice.subscription?.id;
      if (subId) await apply(db, await stripe.subscriptions.retrieve(subId), now);
      break;
    }
    default:
      break;
  }
  return json(200, { received: true });
});
