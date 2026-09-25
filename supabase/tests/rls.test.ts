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
});

describe('row-level security (local)', () => {
  it.skipIf(ready)('is skipped without a configured project; LAUNCH_CHECKLIST.md says to run it before launch', () => {
    expect(ready).toBe(false);
  });
});
