import { useEffect, useRef, useState, type FormEvent } from 'react';
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

/**
 * Which way in an address gets (George, 2026-10-01: email first). GCU blocks Google sign-in for school accounts
 * ("Access blocked … Error 400: access_not_configured" on Google's own page, which never comes back here), and a
 * warning beside the Google button was skimmed past. So the email comes first and a GCU address never sees Google.
 */
export type EmailKind = 'gcu' | 'google' | 'other';
export function emailKind(email: string): EmailKind {
  const e = email.trim().toLowerCase();
  if (/@(my\.)?gcu\.edu$/.test(e)) return 'gcu';
  if (/@(gmail|googlemail)\.com$/.test(e)) return 'google';
  return 'other';
}

type Mode = 'signup' | 'login' | 'forgot';
type Status = { kind: 'idle' } | { kind: 'busy' } | { kind: 'sent' } | { kind: 'error'; message: string; setPassword?: boolean };

/**
 * Email and password, or Google. Nothing to do with a GCU login: this is the account for the planner itself. Sign up
 * signs straight in (no confirmation email). Used inside onboarding (sign up), on the log-in page, and on You.
 */
export function SignIn({ auth, title, note, mode: first = 'signup', signupHref }: { auth: AuthState; title?: string; note?: string; mode?: 'signup' | 'login'; /** Where "Sign up" goes instead of switching this form (the Log in page sends it to the real sign-up). */ signupHref?: string }) {
  const [mode, setMode] = useState<Mode>(first);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  // Email first: the address decides what comes next (emailKind). `step` is which screen; a Google address can still
  // choose a password instead.
  const [step, setStep] = useState<'email' | 'next'>('email');
  const [passwordInstead, setPasswordInstead] = useState(false);
  // Set a password (no password yet) uses the reset email, under its own name.
  const [setting, setSetting] = useState(false);
  const resetReady = useResetReady();
  const passwordRef = useRef<HTMLInputElement>(null);
  const googleRef = useRef<HTMLButtonElement>(null);
  const kind = emailKind(email);
  const withGoogle = kind === 'google' && !passwordInstead;
  useEffect(() => {
    if (step !== 'next') return;
    (withGoogle ? googleRef.current : passwordRef.current)?.focus();
  }, [step, withGoogle]);

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
    setSetting(false);
    setStatus({ kind: 'idle' });
  };
  const changeEmail = () => {
    setStep('email');
    setPassword('');
    setPasswordInstead(false);
    setStatus({ kind: 'idle' });
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const address = email.trim();
    if (!EMAIL.test(address)) return setStatus({ kind: 'error', message: 'That does not look like an email address.' });
    if (mode !== 'forgot' && step === 'email') {
      setStatus({ kind: 'idle' });
      return setStep('next');
    }
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
    // No match on log in: say plainly that an account made with an email link has no password yet, and offer one.
    if (mode === 'login' && /don't match/.test(r.error))
      return setStatus({
        kind: 'error',
        setPassword: true,
        message: "That password doesn't match. If you made this account with an email link, it has no password yet: set one below." + (kind === 'google' ? ' Or change email and use Continue with Google.' : ''),
      });
    setStatus({ kind: 'error', message: r.error });
  };

  const google = async () => {
    setStatus({ kind: 'busy' });
    const r = await auth.signInWithGoogle(email.trim());
    if (!r.ok) setStatus({ kind: 'error', message: r.error });
  };

  if (mode === 'forgot') {
    return (
      <form className="card signin" onSubmit={submit} aria-label={setting ? 'Set a password' : 'Reset your password'} noValidate>
        <p className="section-title">{setting ? 'Set a password' : 'Reset your password'}</p>
        {resetReady === false ? (
          <p className="signin-contact" role="status">
            Contact George to reset your password.
          </p>
        ) : status.kind === 'sent' ? (
          <p className="hint" aria-live="polite">
            If <b>{email.trim()}</b> has an account, a link to {setting ? 'set its password' : 'set a new password'} is on its way. Open it on this device.
          </p>
        ) : (
          <>
            <p className="hint">{setting ? "We'll email you a link to set a password for this account. Open it on this device." : "We'll email you a link to set a new password. Made your account with an email link? This is how you give it a password."}</p>
            <label className="field">
              <span>Email</span>
              <input type="email" autoComplete="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} disabled={busy} />
            </label>
            <button type="submit" className="btn primary" disabled={busy || !email.trim() || resetReady === null}>
              {busy ? 'Sending…' : setting ? 'Email me a link to set it' : 'Email me a reset link'}
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
  const action = signup ? 'Sign up' : 'Log in';
  const switchLine = (
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
          {signupHref ? (
            <a className="hero-inline" href={signupHref}>
              Sign up
            </a>
          ) : (
            <button type="button" className="hero-inline" onClick={() => switchTo('signup')}>
              Sign up
            </button>
          )}
        </>
      )}
    </p>
  );
  const error = status.kind === 'error' && (
    <div className="signin-error-box" role="alert">
      <p className="hint signin-error">{status.message}</p>
      {status.setPassword && (
        <button
          type="button"
          className="btn"
          onClick={() => {
            setMode('forgot');
            setSetting(true);
            setStatus({ kind: 'idle' });
          }}
        >
          Set a password
        </button>
      )}
    </div>
  );
  const heading = <p className="section-title">{mode === first && title ? title : signup ? 'Make your account' : 'Log in'}</p>;

  // Screen 1: the email, and nothing else.
  if (step === 'email') {
    return (
      <form className="card signin" onSubmit={submit} aria-label={action} noValidate data-step="email">
        {heading}
        {note && <p className="hint">{note}</p>}
        <label className="field">
          <span>What's your email?</span>
          <input type="email" name="email" autoComplete={signup ? 'email' : 'username'} inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@my.gcu.edu" />
        </label>
        <button type="submit" className="btn primary" disabled={!email.trim()}>
          Continue
        </button>
        {error}
        {switchLine}
      </form>
    );
  }

  // Screen 2, by address: a GCU address gets a password and never a Google button; Gmail gets Google first.
  const changeLine = (
    <p className="signin-who">
      <span className="signin-who-email">{email.trim()}</span>
      <button type="button" className="hero-inline" onClick={changeEmail}>
        Change email
      </button>
    </p>
  );
  if (withGoogle) {
    return (
      <div className="card signin" aria-label={action} data-step="google">
        {heading}
        {changeLine}
        <button type="button" ref={googleRef} className="btn primary signin-google" onClick={google} disabled={busy}>
          {busy ? 'Opening Google…' : 'Continue with Google'}
        </button>
        <button type="button" className="hero-inline signin-instead" onClick={() => setPasswordInstead(true)}>
          Or use a password instead
        </button>
        {error}
      </div>
    );
  }
  return (
    <form className="card signin" onSubmit={submit} aria-label={action} noValidate data-step={kind === 'gcu' ? 'gcu' : 'password'}>
      {heading}
      {changeLine}
      {/* The address again, for password managers to save with the password. */}
      <input className="visually-hidden" type="email" name="email" autoComplete="username" value={email} readOnly tabIndex={-1} aria-hidden />
      <label className="field">
        <span>{signup ? 'Make a password' : 'Password'}</span>
        <span className="signin-pass">
          <input ref={passwordRef} type={show ? 'text' : 'password'} name="password" autoComplete={signup ? 'new-password' : 'current-password'} minLength={signup ? MIN_PASSWORD : undefined} value={password} onChange={(e) => setPassword(e.target.value)} disabled={busy} />
          <button type="button" className="hero-inline" onClick={() => setShow(!show)} aria-pressed={show}>
            {show ? 'Hide' : 'Show'}
          </button>
        </span>
        {(kind === 'gcu' || signup) && (
          <small className="hint">
            {kind === 'gcu'
              ? signup
                ? `GCU accounts use a password here. Not your GCU password, make a new one (at least ${MIN_PASSWORD} characters).`
                : 'GCU accounts use a password here: the one you made for Halo+, not your GCU password.'
              : `At least ${MIN_PASSWORD} characters. Not your GCU password.`}
          </small>
        )}
      </label>
      <button type="submit" className="btn primary" disabled={busy || !password}>
        {busy ? (signup ? 'Making your account…' : 'Logging in…') : action}
      </button>
      {error}
      {!signup && (
        <p className="hint signin-switch">
          <button type="button" className="hero-inline" onClick={() => switchTo('forgot')}>
            Forgot password
          </button>
        </p>
      )}
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
