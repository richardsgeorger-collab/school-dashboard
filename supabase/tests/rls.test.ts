import { createClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';

/**
 * One student can never see another's rows. Runs against a real project when the env is set; skipped otherwise, and
 * the launch checklist says to run it before going live. Needs two throwaway accounts with passwords enabled in the
 * project's auth settings (the product itself never uses passwords).
 *
 *   SUPABASE_URL=… SUPABASE_ANON_KEY=… RLS_USER_A=a@x RLS_PASS_A=… RLS_USER_B=b@x RLS_PASS_B=… npx vitest run supabase/tests
 */
const env = process.env;
const ready = !!(env.SUPABASE_URL && env.SUPABASE_ANON_KEY && env.RLS_USER_A && env.RLS_PASS_A && env.RLS_USER_B && env.RLS_PASS_B);

describe.skipIf(!ready)('row-level security', () => {
  const client = () => createClient(env.SUPABASE_URL!, env.SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
  const signIn = async (email: string, password: string) => {
    const c = client();
    const { data, error } = await c.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return { c, id: data.user!.id };
  };

  it('a student sees only their own items, and cannot write into someone else’s', async () => {
    const a = await signIn(env.RLS_USER_A!, env.RLS_PASS_A!);
    const b = await signIn(env.RLS_USER_B!, env.RLS_PASS_B!);
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const { error: writeErr } = await a.c.from('items').upsert({ id, user_id: a.id, data: { id, title: 'A only' }, updated_at: now, deleted_at: null });
    expect(writeErr).toBeNull();

    const { data: seenByB } = await b.c.from('items').select('id').eq('id', id);
    expect(seenByB).toEqual([]);

    // B cannot plant a row under A's id.
    const { error: forged } = await b.c.from('items').upsert({ id: crypto.randomUUID(), user_id: a.id, data: {}, updated_at: now, deleted_at: null });
    expect(forged).not.toBeNull();

    // B cannot promote themselves.
    const { data: before } = await b.c.from('profiles').select('tier').eq('user_id', b.id).maybeSingle();
    await b.c.from('profiles').update({ tier: 'max' }).eq('user_id', b.id);
    const { data: after } = await b.c.from('profiles').select('tier').eq('user_id', b.id).maybeSingle();
    expect(after?.tier).toBe(before?.tier);

    // B cannot read A's usage or subscription.
    const { data: usage } = await b.c.from('usage_log').select('id').eq('user_id', a.id);
    expect(usage).toEqual([]);

    await a.c.from('items').delete().eq('id', id);
  });

  it('every student table is closed to other students, and the admin functions refuse non-admins', async () => {
    const a = await signIn(env.RLS_USER_A!, env.RLS_PASS_A!);
    const b = await signIn(env.RLS_USER_B!, env.RLS_PASS_B!);
    const now = new Date().toISOString();
    const cid = crypto.randomUUID();
    // A writes one row into every table a student may write to.
    const writes: [string, Record<string, unknown>][] = [
      ['courses', { id: cid, data: { code: 'RLS-101' }, updated_at: now }],
      ['settings', { data: { timezone: 'UTC' }, updated_at: now }],
      ['terms', { id: crypto.randomUUID(), name: 'RLS', start_date: '2026-01-01', end_date: '2026-02-01', weeks: 8 }],
      ['announcements', { id: `rls-${cid}`, course_id: cid, data: {} }],
      ['read_ledger', { post_id: `rls-${cid}`, hash: 'h' }],
      ['push_subscriptions', { endpoint: `https://push.invalid/${cid}`, keys: {} }],
      ['notification_prefs', {}],
      ['notification_plan', { send_at: now, kind: 'morning', title: 't', body: 'b' }],
      ['onboarding_events', { step: 'welcome', event: 'enter' }],
      ['feedback', { text: 'rls probe' }],
      ['recordings', { id: crypto.randomUUID(), course_id: cid, data: {} }],
    ];
    for (const [table, row] of writes) {
      const { error } = await a.c.from(table).upsert({ ...row, user_id: a.id });
      expect(error, `A writes ${table}`).toBeNull();
    }
    // B sees none of it, cannot change it, cannot delete it.
    for (const [table] of [...writes, ['profiles', {}], ['usage_log', {}], ['subscriptions', {}], ['referrals', {}]] as [string, unknown][]) {
      const col = table === 'referrals' ? 'inviter' : 'user_id';
      const { data } = await b.c.from(table).select('*').eq(col, a.id);
      expect(data ?? [], `B reads A's ${table}`).toEqual([]);
      const { data: changed } = await b.c.from(table).update({ updated_at: now }).eq(col, a.id).select();
      expect(changed ?? [], `B updates A's ${table}`).toEqual([]);
    }
    const { data: gone } = await b.c.from('courses').delete().eq('id', cid).select();
    expect(gone ?? []).toEqual([]);
    const { data: still } = await a.c.from('courses').select('id').eq('id', cid);
    expect(still).toHaveLength(1);
    // Neither is an admin: the admin functions refuse both.
    expect((await b.c.rpc('admin_stats')).error).not.toBeNull();
    expect((await b.c.rpc('admin_resolve_feedback', { p_id: crypto.randomUUID() })).error).not.toBeNull();
    // Clean up A's probe rows.
    for (const [table, row] of writes) {
      if (table === 'feedback' || table === 'onboarding_events' || table === 'settings' || table === 'notification_prefs') continue;
      const key = 'id' in row ? 'id' : table === 'read_ledger' ? 'post_id' : 'endpoint';
      await a.c.from(table).delete().eq(key, (row as Record<string, string>)[key]);
    }
  });
});

describe('row-level security (local)', () => {
  it.skipIf(ready)('is skipped without a configured project; LAUNCH_CHECKLIST.md says to run it before launch', () => {
    expect(ready).toBe(false);
  });
});
