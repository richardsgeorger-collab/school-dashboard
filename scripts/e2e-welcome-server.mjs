// The welcome gift and queued referral rewards (2026-09-29), on the real backend with throwaway accounts and a Stripe
// TEST subscription. New accounts get Max for 7 days from sign-up; friend links are unchanged; a referral gives both
// sides 30 days of Plus, each queued after what they already have; a paying inviter's billing pauses 30 days instead.
//   KEYS_ENV=/path/to/keys.env node scripts/e2e-welcome-server.mjs   (needs the Stripe CLI on the sandbox key)
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';
const env = Object.fromEntries(readFileSync(process.env.KEYS_ENV, 'utf8').split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]));
const tiers = readFileSync('src/config/tiers.ts', 'utf8');
const PLUS_MONTH = tiers.match(/plus: \{ month: '(price_[A-Za-z0-9]+)'/)[1];
const stripe = (args) => { const out = JSON.parse(execFileSync('stripe', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })); if (out.livemode) throw new Error('LIVE MODE: stopping'); return out; };
const admin = createClient(env.VITE_SUPABASE_URL, env.SERVICE_ROLE, { auth: { persistSession: false } });
const checks = [];
const check = (ok, line) => { checks.push(ok); console.log(`${ok ? 'ok  ' : 'FAIL'} ${line}`); };
const made = [];
const customers = [];
const DAY = 86_400_000;
const near = (a, b, ms = 5 * 60_000) => Math.abs(new Date(a).getTime() - new Date(b).getTime()) < ms;
const user = async (tag) => {
  const email = `e2e-welcome-${tag}-${Date.now()}@example.invalid`;
  const { data } = await admin.auth.admin.createUser({ email, email_confirm: true });
  made.push(data.user.id);
  const { data: link } = await admin.auth.admin.generateLink({ type: 'magiclink', email });
  const c = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data: s } = await c.auth.verifyOtp({ token_hash: link.properties.hashed_token, type: 'magiclink' });
  return { id: data.user.id, email, c, session: s.session };
};
const profile = async (id) => (await admin.from('profiles').select('*').eq('user_id', id).single()).data;
const grants = async (id) => (await admin.from('reward_grants').select('*').eq('user_id', id).order('starts_at')).data ?? [];
try {
  // 1. The gift.
  const a = await user('new');
  const pa = await profile(a.id);
  check(near(pa.trial_started_at, new Date()) && near(pa.trial_ends_at, Date.now() + 7 * DAY), 'every new account gets Max for 7 days from sign-up, no button');
  check((await a.c.rpc('my_plan')).data === 'max', 'the plan says max at once');
  // 2. Friend links, unchanged.
  const george = await user('admin');
  await admin.from('profiles').update({ is_admin: true }).eq('user_id', george.id);
  const { data: code } = await george.c.rpc('create_friend_link', { p_label: 'e2e', p_max_uses: 1, p_until: '2026-12-21T06:59:00.000Z', p_from_name: 'George' });
  const f = await user('friend');
  await f.c.rpc('claim_friend_link', { p_code: code });
  const pf = await profile(f.id);
  check(pf.reward_tier === 'max' && new Date(pf.trial_ends_at).getTime() <= Date.now() + 60_000 && (await f.c.rpc('my_plan')).data === 'max', 'a friend-link account: the free week ends, Max through the link, as before');
  // 3. Referral between a new student (on the gift) and an inviter whose gift is over.
  const inv = await user('inviter');
  await admin.from('profiles').update({ trial_ends_at: new Date(Date.now() - DAY).toISOString() }).eq('user_id', inv.id);
  const invCode = (await profile(inv.id)).referral_code;
  const b = await user('invitee');
  const claim = (await b.c.rpc('claim_referral', { p_code: invCode })).data;
  const pb = await profile(b.id);
  const gb = await grants(b.id);
  check(claim?.ok && gb.length === 1 && near(gb[0].starts_at, pb.trial_ends_at) && near(gb[0].ends_at, new Date(pb.trial_ends_at).getTime() + 30 * DAY), `the friend gets the 7-day Max gift, then 30 days of Plus from ${gb[0]?.starts_at?.slice(0, 10)}`);
  check((await b.c.rpc('my_plan')).data === 'max', 'and is on Max now (the gift), not Plus');
  const gi = await grants(inv.id);
  check(gi.length === 1 && near(gi[0].starts_at, new Date()) && (await inv.c.rpc('my_plan')).data === 'plus', 'the inviter, gift over, gets Plus now for 30 days');
  // 4. A second friend: the inviter's second month queues after the first.
  const b2 = await user('invitee2');
  await b2.c.rpc('claim_referral', { p_code: invCode });
  const gi2 = await grants(inv.id);
  check(gi2.length === 2 && near(gi2[1].starts_at, gi2[0].ends_at), 'a second friend: the next 30 days start when the first 30 end, none wasted');
  const mine = (await inv.c.rpc('my_referrals')).data;
  check(mine.joined === 2 && mine.days === 60, `progress: ${mine.joined} friends joined, ${mine.days} days of Plus earned`);
  // 5. An inviter still in their free week: the month waits for it to end.
  const onTrial = await user('trialinviter');
  const b3 = await user('invitee3');
  await b3.c.rpc('claim_referral', { p_code: (await profile(onTrial.id)).referral_code });
  const gt = await grants(onTrial.id);
  check(gt.length === 1 && near(gt[0].starts_at, (await profile(onTrial.id)).trial_ends_at), 'an inviter on the free week: their Plus starts when it ends');
  // 6. A paying inviter: billing pauses 30 days (Stripe test mode).
  const payer = await user('payer');
  const cust = stripe(['customers', 'create', '--email', payer.email, '-d', `metadata[user_id]=${payer.id}`]);
  customers.push(cust.id);
  const pm = stripe(['payment_methods', 'attach', 'pm_card_visa', '--customer', cust.id]);
  stripe(['customers', 'update', cust.id, '-d', `invoice_settings[default_payment_method]=${pm.id}`]);
  const sub = stripe(['subscriptions', 'create', '--customer', cust.id, '-d', `items[0][price]=${PLUS_MONTH}`]);
  const periodEnd = sub.items.data[0].current_period_end ?? sub.current_period_end;
  await admin.from('profiles').update({ stripe_customer_id: cust.id, tier: 'plus', trial_ends_at: new Date(Date.now() - DAY).toISOString() }).eq('user_id', payer.id);
  await admin.from('subscriptions').upsert({ user_id: payer.id, stripe_subscription_id: sub.id, tier: 'plus', interval: 'month', status: 'active', current_period_end: new Date(periodEnd * 1000).toISOString(), cancel_at_period_end: false });
  const b4 = await user('invitee4');
  await b4.c.rpc('claim_referral', { p_code: (await profile(payer.id)).referral_code });
  const r = await fetch(`${env.VITE_SUPABASE_URL}/functions/v1/referral-credit`, { method: 'POST', headers: { authorization: `Bearer ${b4.session.access_token}`, apikey: env.VITE_SUPABASE_ANON_KEY, 'content-type': 'application/json' }, body: '{}' }).then((x) => x.json());
  const after = stripe(['subscriptions', 'retrieve', sub.id]);
  check(r.ok && after.trial_end && Math.abs(after.trial_end - (periodEnd + 30 * 86400)) < 120 && (await grants(payer.id)).length === 0, `a paying inviter: billing pauses 30 days past the period end (next charge ${new Date(after.trial_end * 1000).toISOString().slice(0, 10)}), no Plus month wasted under a paid plan`);
  const again = await fetch(`${env.VITE_SUPABASE_URL}/functions/v1/referral-credit`, { method: 'POST', headers: { authorization: `Bearer ${b4.session.access_token}`, apikey: env.VITE_SUPABASE_ANON_KEY, 'content-type': 'application/json' }, body: '{}' }).then((x) => x.json());
  check(again.nothing === true, 'and only once');
  // 7. The funnel.
  const fun = (await george.c.rpc('admin_funnel', { p_days: 30 })).data;
  check(typeof fun?.signed_up === 'number' && 'from_referrals' in fun && 'day7' in fun && 'chose_plan' in fun, `the Admin funnel answers: ${JSON.stringify(fun)}`);
  const denied = await a.c.rpc('admin_funnel', { p_days: 30 });
  check(!!denied.error, 'and only for admins');
} finally {
  for (const c of customers) try { stripe(['customers', 'delete', c]); } catch { /* already gone */ }
  for (const id of made) {
    await admin.from('reward_grants').delete().eq('user_id', id);
    await admin.from('referrals').delete().or(`inviter.eq.${id},invitee.eq.${id}`);
    await admin.from('subscriptions').delete().eq('user_id', id);
    await admin.from('friend_links').delete().eq('created_by', id);
    await admin.auth.admin.deleteUser(id);
  }
  console.log(`removed ${made.length} throwaways and ${customers.length} sandbox customer`);
}
console.log(checks.every(Boolean) ? 'PASS' : 'FAIL');
process.exit(checks.every(Boolean) ? 0 : 1);
