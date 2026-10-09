// The trial funnel on real accounts (George, 2026-10-09): signed up > synced > active 3+ days > saw end-of-trial >
// clicked a plan > reached checkout > paid. Read only. Test accounts (e2e personas, admins, test overrides) are out.
//   KEYS_ENV=... node scripts/funnel.mjs
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
const env = Object.fromEntries(readFileSync(process.env.KEYS_ENV, 'utf8').split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]));
const db = createClient(env.VITE_SUPABASE_URL, env.SERVICE_ROLE, { auth: { persistSession: false } });
const users = (await db.auth.admin.listUsers({ perPage: 1000 })).data.users;
const profiles = (await db.from('profiles').select('*')).data ?? [];
const settings = (await db.from('settings').select('user_id, data')).data ?? [];
const usage = (await db.from('usage_events').select('user_id, day, key, n')).data ?? [];
const subsProbe = await db.from('subscriptions').select('*').limit(1);
const subs = subsProbe.error ? [] : ((await db.from('subscriptions').select('*')).data ?? []);
const testEmail = (e) => /example\.invalid|e2e-|\+test|test@|throwaway/i.test(e ?? '');
const real = users.filter((u) => !testEmail(u.email)).map((u) => ({ u, p: profiles.find((p) => p.user_id === u.id) })).filter((x) => x.p && !x.p.is_admin && !x.p.test_override);
const byUser = (uid) => settings.find((s) => s.user_id === uid)?.data ?? {};
const daysActive = (uid) => new Set(usage.filter((e) => e.user_id === uid).map((e) => e.day)).size;
const rows = real.map(({ u, p }) => {
  const s = byUser(u.id);
  const sub = subs.find((x) => x.user_id === u.id);
  return {
    id: u.id.slice(0, 8), created: u.created_at.slice(0, 10), src: p.signup_source ?? '-', tier: p.tier,
    trial: !!p.trial_started_at, trialEnded: !!p.trial_ends_at && p.trial_ends_at < new Date().toISOString(),
    synced: !!s.lastPull?.at, syncedAt: s.lastPull?.at?.slice(0, 10) ?? '', days: daysActive(u.id),
    sawEnd: !!s.trialEndSeen, rated: s.trialRating !== undefined,
    clickedPlan: usage.some((e) => e.user_id === u.id && /^(winback:upgrade|plan:click|checkout:open)/.test(e.key)),
    reachedCheckout: !!p.stripe_customer_id, paid: !!sub && /active|trialing|past_due/.test(sub.status ?? '') || p.tier === 'plus' && !!p.stripe_customer_id && !p.trial_ends_at,
    sub: sub ? `${sub.status ?? '?'} ${sub.tier ?? sub.plan ?? ''}` : '',
  };
});
const n = (f) => rows.filter(f).length;
console.log(`real accounts: ${rows.length} (of ${users.length} users; test/admin/override excluded)`);
console.log('subscriptions columns:', subsProbe.error ? 'no table' : Object.keys(subsProbe.data?.[0] ?? {}).join(',') || '(empty table)');
console.log('\nFUNNEL');
console.log(`signed up            ${rows.length}`);
console.log(`started trial        ${n((r) => r.trial)}`);
console.log(`synced Halo          ${n((r) => r.synced)}`);
console.log(`active 3+ days       ${n((r) => r.days >= 3)}`);
console.log(`trial ended          ${n((r) => r.trialEnded)}`);
console.log(`saw end-of-trial     ${n((r) => r.sawEnd)}`);
console.log(`clicked a plan       ${n((r) => r.clickedPlan)}   (only win-back clicks were counted until today)`);
console.log(`reached checkout     ${n((r) => r.reachedCheckout)}   (a Stripe customer exists)`);
console.log(`paid                 ${n((r) => r.paid)}`);
console.log('\nPER ACCOUNT');
console.log('id       created    src       tier  trial ended synced     days saw click chk paid sub');
for (const r of rows.sort((a, b) => a.created.localeCompare(b.created))) console.log(`${r.id} ${r.created} ${String(r.src).padEnd(9)} ${String(r.tier).padEnd(5)} ${r.trial ? 'y' : '-'}     ${r.trialEnded ? 'y' : '-'}     ${(r.syncedAt || '-').padEnd(10)} ${String(r.days).padStart(4)} ${r.sawEnd ? 'y' : '-'}   ${r.clickedPlan ? 'y' : '-'}     ${r.reachedCheckout ? 'y' : '-'}   ${r.paid ? 'y' : '-'}    ${r.sub}`);
