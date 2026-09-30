// A paying inviter's referral month (2026-09-29): instead of a Plus month they would not notice under a plan they
// pay for, billing pauses for 30 days. Stripe's way to say "no charge until then" on a running subscription is to
// move its trial end past the current period; nothing is refunded, charged or changed otherwise. Called by the
// invitee's app right after claim_referral; it acts only on that invitee's own referral, once.
import Stripe from 'npm:stripe@18';
import { admin, json, guard, userFromRequest } from '../_shared/admin.ts';

const stripeClient = () => new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', { httpClient: Stripe.createFetchHttpClient() });
const DAY = 86_400;

Deno.serve(guard(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization, apikey, content-type, x-client-info', 'access-control-allow-methods': 'POST, OPTIONS', 'access-control-max-age': '86400' } });
  if (req.method !== 'POST') return json(405, { error: 'POST only' });
  const user = await userFromRequest(req);
  if (!user) return json(401, { error: 'Sign in first.' });
  const db = admin();
  const { data: ref } = await db.from('referrals').select('id, inviter, inviter_reward, inviter_applied_at').eq('invitee', user.id).maybeSingle();
  if (!ref || ref.inviter_reward !== 'stripe_pause' || ref.inviter_applied_at) return json(200, { ok: true, nothing: true });
  if (!Deno.env.get('STRIPE_SECRET_KEY')) return json(503, { error: 'Billing is not switched on yet.' });
  const { data: sub } = await db.from('subscriptions').select('stripe_subscription_id, status, cancel_at_period_end, current_period_end').eq('user_id', ref.inviter).maybeSingle();
  const stripe = stripeClient();
  if (!sub?.stripe_subscription_id || sub.cancel_at_period_end || !['active', 'trialing', 'past_due'].includes(sub.status)) {
    // No longer paying: the month is a queued Plus grant after whatever they have, like anyone else's.
    const { data: start } = await db.rpc('reward_start', { uid: ref.inviter });
    const starts = new Date(start as string);
    await db.from('reward_grants').insert({ user_id: ref.inviter, tier: 'plus', starts_at: starts.toISOString(), ends_at: new Date(starts.getTime() + 30 * DAY * 1000).toISOString(), source: 'referral:inviter', referral: ref.id });
    await db.from('referrals').update({ inviter_reward: 'grant', inviter_applied_at: new Date().toISOString() }).eq('id', ref.id);
    return json(200, { ok: true, granted: true });
  }
  const live = await stripe.subscriptions.retrieve(sub.stripe_subscription_id);
  const periodEnd = (live.items?.data?.[0] as unknown as { current_period_end?: number })?.current_period_end ?? (live as unknown as { current_period_end?: number }).current_period_end ?? Math.floor(Date.now() / 1000);
  const from = Math.max(periodEnd, live.trial_end ?? 0, Math.floor(Date.now() / 1000));
  const until = from + 30 * DAY;
  await stripe.subscriptions.update(sub.stripe_subscription_id, { trial_end: until, proration_behavior: 'none' });
  await db.from('referrals').update({ inviter_reward: 'stripe_paused', inviter_applied_at: new Date().toISOString() }).eq('id', ref.id);
  return json(200, { ok: true, paused_until: new Date(until * 1000).toISOString() });
}, 'referral-credit'));
