import { useEffect, useState, type FormEvent } from 'react';
import { supabase } from './client';
import type { AuthState } from './useAuth';

export const MIN_PASSWORD = 8;
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** Whether Forgot password can really send an email (George turns this on once the email sender is set up). */
export function useResetReady(): boolean | null {
  const [ready, setReady] = useState<boolean | null>(null);
  useEffect(() => {
    const c = supabase();
    if (!c) return;
    void c.rpc('reset_email_ready').then(({ data, error }) => setReady(!error && data === true));
  }, []);
  return ready;
}

type Mode = 'signup' | 'login' | 'forgot';
type Status = { kind: 'idle' } | { kind: 'busy' } | { kind: 'sent' } | { kind: 'error'; message: string };

/**
 * Email and password, or Google. Nothing to do with a GCU login: this is the account for the planner itself. Sign up
 * signs straight in (no confirmation email). Used inside onboarding (sign up), on the log-in page, and on You.
 */
export function SignIn({ auth, title, note, mode: first = 'signup' }: { auth: AuthState; title?: string; note?: string; mode?: 'signup' | 'login' }) {
  const [mode, setMode] = useState<Mode>(first);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const resetReady = useResetReady();

  if (!auth.configured) {
    return (
      <div className="card">
        <p className="hint">Accounts are not set up on this build. Everything stays on this device.</p>
      </div>
    );
  }

  const busy = status.kind === 'busy';
  const switchTo = (m: Mode) => {
    setMode(m);
    setStatus({ kind: 'idle' });
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const address = email.trim();
    if (!EMAIL.test(address)) return setStatus({ kind: 'error', message: 'That does not look like an email address.' });
    if (mode === 'forgot') {
      setStatus({ kind: 'busy' });
      const r = await auth.sendPasswordReset(address);
      return setStatus(r.ok ? { kind: 'sent' } : { kind: 'error', message: r.error });
    }
    if (mode === 'signup' && password.length < MIN_PASSWORD) return setStatus({ kind: 'error', message: `Pick a password of at least ${MIN_PASSWORD} characters.` });
    if (!password) return setStatus({ kind: 'error', message: 'Type your password.' });
    setStatus({ kind: 'busy' });
    const r = mode === 'signup' ? await auth.signUpWithPassword(address, password) : await auth.signInWithPassword(address, password);
    if (r.ok) return setStatus({ kind: 'idle' });
    if (mode === 'signup' && /already has an account/.test(r.error)) setMode('login');
    setStatus({ kind: 'error', message: r.error });
  };

  const google = async () => {
    setStatus({ kind: 'busy' });
    const r = await auth.signInWithGoogle();
    if (!r.ok) setStatus({ kind: 'error', message: r.error });
  };

  if (mode === 'forgot') {
    return (
      <form className="card signin" onSubmit={submit} aria-label="Reset your password" noValidate>
        <p className="section-title">Reset your password</p>
        {resetReady === false ? (
          <p className="signin-contact" role="status">
            Contact George to reset your password.
          </p>
        ) : status.kind === 'sent' ? (
          <p className="hint" aria-live="polite">
            If <b>{email.trim()}</b> has an account, a link to set a new password is on its way. Open it on this device.
          </p>
        ) : (
          <>
            <p className="hint">We'll email you a link to set a new password. Made your account with an email link? This is how you give it a password.</p>
            <label className="field">
              <span>Email</span>
              <input type="email" autoComplete="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} disabled={busy} />
            </label>
            <button type="submit" className="btn primary" disabled={busy || !email.trim() || resetReady === null}>
              {busy ? 'Sending…' : 'Email me a reset link'}
            </button>
          </>
        )}
        {status.kind === 'error' && (
          <p className="hint signin-error" role="alert">
            {status.message}
          </p>
        )}
        <button type="button" className="hero-inline" onClick={() => switchTo('login')}>
          Back to log in
        </button>
      </form>
    );
  }

  const signup = mode === 'signup';
  return (
    <form className="card signin" onSubmit={submit} aria-label={signup ? 'Sign up' : 'Log in'} noValidate>
      <p className="section-title">{title ?? (signup ? 'Make your account' : 'Log in')}</p>
      {note && <p className="hint">{note}</p>}
      <button type="button" className="btn" onClick={google} disabled={busy}>
        Continue with Google
      </button>
      <p className="muted signin-or">or</p>
      <label className="field">
        <span>Email</span>
        <input type="email" name="email" autoComplete={signup ? 'email' : 'username'} inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@my.gcu.edu or any email" disabled={busy} />
      </label>
      <label className="field">
        <span>Password</span>
        <span className="signin-pass">
          <input type={show ? 'text' : 'password'} name="password" autoComplete={signup ? 'new-password' : 'current-password'} minLength={signup ? MIN_PASSWORD : undefined} value={password} onChange={(e) => setPassword(e.target.value)} disabled={busy} />
          <button type="button" className="hero-inline" onClick={() => setShow(!show)} aria-pressed={show}>
            {show ? 'Hide' : 'Show'}
          </button>
        </span>
        {signup && <small className="hint">At least {MIN_PASSWORD} characters. Not your GCU password.</small>}
      </label>
      <button type="submit" className="btn primary" disabled={busy || !email.trim() || !password}>
        {busy ? (signup ? 'Making your account…' : 'Logging in…') : signup ? 'Sign up' : 'Log in'}
      </button>
      {status.kind === 'error' && (
        <p className="hint signin-error" role="alert">
          {status.message}
        </p>
      )}
      <p className="hint signin-switch">
        {signup ? (
          <>
            Have an account?{' '}
            <button type="button" className="hero-inline" onClick={() => switchTo('login')}>
              Log in
            </button>
          </>
        ) : (
          <>
            New here?{' '}
            <button type="button" className="hero-inline" onClick={() => switchTo('signup')}>
              Sign up
            </button>
            {' · '}
            <button type="button" className="hero-inline" onClick={() => switchTo('forgot')}>
              Forgot password
            </button>
          </>
        )}
      </p>
    </form>
  );
}

/** Back from a reset email: one field, the new password, then in. */
export function SetNewPassword({ auth }: { auth: AuthState }) {
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  if (!auth.recovery) return null;
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (password.length < MIN_PASSWORD) return setStatus({ kind: 'error', message: `At least ${MIN_PASSWORD} characters.` });
    setStatus({ kind: 'busy' });
    const r = await auth.setPassword(password);
    if (r.ok) auth.endRecovery();
    else setStatus({ kind: 'error', message: r.error });
  };
  return (
    <div className="modal-backdrop signin-recovery">
      <form className="card signin" role="dialog" aria-label="Set a new password" onSubmit={submit} noValidate>
        <p className="section-title">Set a new password</p>
        <label className="field">
          <span>New password</span>
          <input type="password" autoComplete="new-password" minLength={MIN_PASSWORD} value={password} onChange={(e) => setPassword(e.target.value)} autoFocus />
          <small className="hint">At least {MIN_PASSWORD} characters. From now on you log in with your email and this password.</small>
        </label>
        <button type="submit" className="btn primary" disabled={status.kind === 'busy' || !password}>
          {status.kind === 'busy' ? 'Saving…' : 'Save password'}
        </button>
        {status.kind === 'error' && (
          <p className="hint signin-error" role="alert">
            {status.message}
          </p>
        )}
      </form>
    </div>
  );
}
