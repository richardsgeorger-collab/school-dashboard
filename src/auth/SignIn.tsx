import { useState, type FormEvent } from 'react';
import type { AuthState } from './useAuth';

/**
 * Email link or Google. No passwords, and nothing to do with a GCU login: this is the account for the planner itself.
 * Used inside onboarding and on the You tab when signed out.
 */
export function SignIn({ auth, title = 'Save your planner to an account', note }: { auth: AuthState; title?: string; note?: string }) {
  const [email, setEmail] = useState('');
  const [state, setState] = useState<{ kind: 'idle' } | { kind: 'busy' } | { kind: 'sent' } | { kind: 'error'; message: string }>({ kind: 'idle' });

  if (!auth.configured) {
    return (
      <div className="card">
        <p className="hint">Accounts are not set up on this build. Everything stays on this device.</p>
      </div>
    );
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = email.trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(trimmed)) return setState({ kind: 'error', message: 'That does not look like an email address.' });
    setState({ kind: 'busy' });
    const r = await auth.signInWithEmail(trimmed);
    setState(r.ok ? { kind: 'sent' } : { kind: 'error', message: r.error });
  };

  const google = async () => {
    setState({ kind: 'busy' });
    const r = await auth.signInWithGoogle();
    if (!r.ok) setState({ kind: 'error', message: r.error });
  };

  if (state.kind === 'sent') {
    return (
      <div className="card signin" aria-live="polite">
        <p className="section-title">Check your email</p>
        <p className="hint">
          A sign-in link is on its way to <b>{email.trim()}</b>. Open it on this device and you are in. Nothing to remember.
        </p>
        <button type="button" className="btn small" onClick={() => setState({ kind: 'idle' })}>
          Use a different email
        </button>
      </div>
    );
  }

  return (
    <form className="card signin" onSubmit={submit}>
      <p className="section-title">{title}</p>
      {note && <p className="hint">{note}</p>}
      <button type="button" className="btn" onClick={google} disabled={state.kind === 'busy'}>
        Continue with Google
      </button>
      <p className="muted signin-or">or</p>
      <label className="field">
        <span>Email</span>
        <input type="email" autoComplete="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@my.gcu.edu or any email" disabled={state.kind === 'busy'} />
      </label>
      <button type="submit" className="btn primary" disabled={state.kind === 'busy' || !email.trim()}>
        {state.kind === 'busy' ? 'Sending…' : 'Email me a sign-in link'}
      </button>
      {state.kind === 'error' && (
        <p className="hint signin-error" role="alert">
          {state.message}
        </p>
      )}
      <p className="hint muted">No password. Never your GCU login: this account is only for the planner.</p>
    </form>
  );
}
