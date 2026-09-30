// Removes every leftover audit throwaway (e2e-audit-*@example.invalid) and its rows, e.g. after a crawl was stopped.
//   KEYS_ENV=... node scripts/audit-cleanup.mjs
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
const env = Object.fromEntries(readFileSync(process.env.KEYS_ENV, 'utf8').split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]));
const db = createClient(env.VITE_SUPABASE_URL, env.SERVICE_ROLE, { auth: { persistSession: false } });
let n = 0;
for (let page = 1; page < 50; page++) {
  const { data } = await db.auth.admin.listUsers({ page, perPage: 200 });
  if (!data.users.length) break;
  for (const u of data.users.filter((x) => /^e2e-audit-.*@example\.invalid$/.test(x.email ?? ''))) {
    for (const t of ['pending_syncs', 'sync_keys', 'reward_grants', 'subscriptions', 'courses', 'items', 'settings', 'announcements', 'read_ledger', 'usage_log', 'usage_events', 'onboarding_events', 'notification_plan', 'notification_prefs', 'push_subscriptions', 'feedback', 'winback_sends']) await db.from(t).delete().eq('user_id', u.id);
    await db.from('referrals').delete().or(`inviter.eq.${u.id},invitee.eq.${u.id}`);
    await db.auth.admin.deleteUser(u.id);
    n++;
  }
}
console.log(`removed ${n} leftover audit accounts`);
