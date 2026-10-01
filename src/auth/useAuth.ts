import { storedUserId } from './planCache';
import { useCallback, useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { arrivedForRecovery, isConfigured, supabase } from './client';

/**
 * Who is signed in. Email and password, or Google; never anything to do with a GCU login. Accounts made earlier with
 * an email link still work: Google with the same address signs them in, and Forgot password gives them a password. When
 * the build has no Supabase connection (a local checkout), `configured` is false and the app runs on this device
 * only, exactly as it did before accounts existed.
 */
export interface AuthState {
  configured: boolean;
  loading: boolean;
  session: Session | null;
  userId: string | null;
  /** The account signed in on this device: the session's, or while the session is still being checked, the one in storage. For showing the remembered plan only. */
  knownUserId: string | null;
  email: string | null;
  signInWithEmail: (email: string) => Promise<{ ok: true } | { ok: false; error: string }>;
  signInWithGoogle: (hint?: string) => Promise<{ ok: true } | { ok: false; error: string }>;
  /** A new account with a password, signed straight in (no confirmation email). */
  signUpWithPassword: (email: string, password: string) => Promise<{ ok: true } | { ok: false; error: string }>;
  signInWithPassword: (email: string, password: string) => Promise<{ ok: true } | { ok: false; error: string }>;
  /** Sends the reset email; the link lands back here with `recovery` set. */
  sendPasswordReset: (email: string) => Promise<{ ok: true } | { ok: false; error: string }>;
  setPassword: (password: string) => Promise<{ ok: true } | { ok: false; error: string }>;
  /** Arrived from a reset email: ask for the new password. */
  recovery: boolean;
  endRecovery: () => void;
  signOut: () => Promise<void>;
}

/** Supabase's messages, in the app's words. */
export function authMessage(raw: string): string {
  if (/already registered|already been registered|already exists/i.test(raw)) return 'That email already has an account. Log in instead.';
  if (/invalid login credentials/i.test(raw)) return "That email and password don't match. Made your account with an email link? It has no password yet: use Forgot password to set one.";
  if (/email not confirmed/i.test(raw)) return 'That account was never confirmed. Use Forgot password to set a password and get in.';
  if (/rate limit|too many/i.test(raw)) return 'Too many tries. Wait a minute and try again.';
  if (/password should be|weak password/i.test(raw)) return 'Pick a longer password: at least 8 characters.';
  return raw;
}

export function useAuth(): AuthState {
  const configured = isConfigured();
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(configured);
  // Who was signed in here, read straight from storage so the plan this device remembers shows before the auth
  // library has checked the token (2026-09-30).
  const [stored] = useState(() => (configured ? storedUserId() : null));
  const [recovery, setRecovery] = useState(false);

  useEffect(() => {
    const c = supabase();
    if (!c) return;
    if (arrivedForRecovery()) setRecovery(true);
    void c.auth.getSession().then(({ data }) => {
      performance.mark?.('halo:session');
      setSession(data.session);
      setLoading(false);
    });
    const { data: sub } = c.auth.onAuthStateChange((event, s) => {
      setSession(s);
      if (event === 'PASSWORD_RECOVERY') setRecovery(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const redirectTo = () => `${window.location.origin}${import.meta.env.BASE_URL}`;

  const signInWithEmail = useCallback(async (email: string) => {
    const c = supabase();
    if (!c) return { ok: false as const, error: 'Accounts are not set up on this build.' };
    const { error } = await c.auth.signInWithOtp({ email, options: { emailRedirectTo: redirectTo() } });
    return error ? { ok: false as const, error: error.message } : { ok: true as const };
  }, []);

  const signInWithGoogle = useCallback(async (hint?: string) => {
    const c = supabase();
    if (!c) return { ok: false as const, error: 'Accounts are not set up on this build.' };
    // The address typed on the email-first screen goes to Google as a hint, so it opens on that account.
    const { error } = await c.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: redirectTo(), ...(hint ? { queryParams: { login_hint: hint } } : {}) } });
    return error ? { ok: false as const, error: error.message } : { ok: true as const };
  }, []);

  const signUpWithPassword = useCallback(async (email: string, password: string) => {
    const c = supabase();
    if (!c) return { ok: false as const, error: 'Accounts are not set up on this build.' };
    const { data, error } = await c.auth.signUp({ email, password, options: { emailRedirectTo: redirectTo() } });
    if (error) return { ok: false as const, error: authMessage(error.message) };
    // An address that already has an account comes back with no identities and no session, not an error.
    if (!data.session && (data.user?.identities?.length ?? 0) === 0) return { ok: false as const, error: authMessage('already registered') };
    if (!data.session) return { ok: false as const, error: 'Your account was made, but it needs confirming. Log in, or contact George.' };
    return { ok: true as const };
  }, []);

  const signInWithPassword = useCallback(async (email: string, password: string) => {
    const c = supabase();
    if (!c) return { ok: false as const, error: 'Accounts are not set up on this build.' };
    const { error } = await c.auth.signInWithPassword({ email, password });
    return error ? { ok: false as const, error: authMessage(error.message) } : { ok: true as const };
  }, []);

  const sendPasswordReset = useCallback(async (email: string) => {
    const c = supabase();
    if (!c) return { ok: false as const, error: 'Accounts are not set up on this build.' };
    const { error } = await c.auth.resetPasswordForEmail(email, { redirectTo: redirectTo() });
    return error ? { ok: false as const, error: authMessage(error.message) } : { ok: true as const };
  }, []);

  const setPassword = useCallback(async (password: string) => {
    const c = supabase();
    if (!c) return { ok: false as const, error: 'Accounts are not set up on this build.' };
    const { error } = await c.auth.updateUser({ password });
    return error ? { ok: false as const, error: authMessage(error.message) } : { ok: true as const };
  }, []);

  const endRecovery = useCallback(() => setRecovery(false), []);

  const signOut = useCallback(async () => {
    await supabase()?.auth.signOut();
  }, []);

  return { configured, loading, session, userId: session?.user.id ?? null, knownUserId: session?.user.id ?? (loading ? stored : null), email: session?.user.email ?? null, signInWithEmail, signInWithGoogle, signUpWithPassword, signInWithPassword, sendPasswordReset, setPassword, recovery, endRecovery, signOut };
}
