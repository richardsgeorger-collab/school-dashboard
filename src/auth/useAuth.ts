import { useCallback, useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { isConfigured, supabase } from './client';

/**
 * Who is signed in. Email magic link or Google; never a password, and never anything to do with a GCU login. When
 * the build has no Supabase connection (a local checkout), `configured` is false and the app runs on this device
 * only, exactly as it did before accounts existed.
 */
export interface AuthState {
  configured: boolean;
  loading: boolean;
  session: Session | null;
  userId: string | null;
  email: string | null;
  signInWithEmail: (email: string) => Promise<{ ok: true } | { ok: false; error: string }>;
  signInWithGoogle: () => Promise<{ ok: true } | { ok: false; error: string }>;
  signOut: () => Promise<void>;
}

export function useAuth(): AuthState {
  const configured = isConfigured();
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(configured);

  useEffect(() => {
    const c = supabase();
    if (!c) return;
    void c.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data: sub } = c.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  const redirectTo = () => `${window.location.origin}${import.meta.env.BASE_URL}`;

  const signInWithEmail = useCallback(async (email: string) => {
    const c = supabase();
    if (!c) return { ok: false as const, error: 'Accounts are not set up on this build.' };
    const { error } = await c.auth.signInWithOtp({ email, options: { emailRedirectTo: redirectTo() } });
    return error ? { ok: false as const, error: error.message } : { ok: true as const };
  }, []);

  const signInWithGoogle = useCallback(async () => {
    const c = supabase();
    if (!c) return { ok: false as const, error: 'Accounts are not set up on this build.' };
    const { error } = await c.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: redirectTo() } });
    return error ? { ok: false as const, error: error.message } : { ok: true as const };
  }, []);

  const signOut = useCallback(async () => {
    await supabase()?.auth.signOut();
  }, []);

  return { configured, loading, session, userId: session?.user.id ?? null, email: session?.user.email ?? null, signInWithEmail, signInWithGoogle, signOut };
}
