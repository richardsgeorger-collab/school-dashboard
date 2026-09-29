import { useState } from 'react';
import { supabase } from '../auth/client';
import { useResetReady } from '../auth/SignIn';

/**
 * Admin: whether Forgot password sends a real email. Off until the email sender (custom SMTP, e.g. Resend) is set up in
 * Supabase; while off, students see "Contact George to reset your password" instead of a link that silently fails.
 */
export function ResetEmailAdmin() {
  const loaded = useResetReady();
  const [on, setOn] = useState<boolean | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const value = on ?? loaded;
  const flip = async () => {
    const next = !value;
    const r = await supabase()?.rpc('admin_set_switch', { switch_name: 'reset_email', on_off: next });
    if (r?.error) setErr(r.error.message);
    else setOn(next);
  };
  return (
    <section className="card settings-card">
      <h2 className="section-title">Password reset emails</h2>
      <p className="mono">{value === null ? 'Loading…' : value ? 'On: Forgot password emails a reset link.' : 'Off: students see "Contact George to reset your password."'}</p>
      <button type="button" className="btn small" onClick={() => void flip()} disabled={value === null}>
        {value ? 'Turn off' : 'Turn on'}
      </button>
      {err && (
        <p className="hint signin-error" role="alert">
          {err}
        </p>
      )}
      <p className="hint">Turn on only after the email sender is set up in Supabase (Authentication, Emails, SMTP settings) and a test reset arrived.</p>
    </section>
  );
}
