import { useState } from 'react';
import { supabase } from '../auth/client';

/** Ends a test account's free week now, so the end-of-trial screen and the $2.99 checkout can be tried for real (2026-10-10). */
export function AdminEndTrial() {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const go = async () => {
    setBusy(true);
    setNote(null);
    const { data, error } = (await supabase()?.rpc('admin_end_trial', { p_email: email.trim() })) ?? { data: null, error: { message: 'No account connection.' } };
    setBusy(false);
    if (error) return setNote(error.message);
    const r = data as { ok: boolean; why?: string };
    setNote(r.ok ? `Done. ${email.trim()}'s free week ended a minute ago: sign in as it and the end-of-trial screen shows, with the $2.99 offer if it never paid.` : r.why ?? 'Could not end it.');
  };
  return (
    <section className="card settings-card admin-end-trial" aria-label="End a test account's trial">
      <h2 className="section-title">End a test account's free week now</h2>
      <p className="hint">Only an account marked Test (Accounts, above). Ends its free week a minute ago; the account must then sign in to see the screen.</p>
      <div className="field-row">
        <input className="field-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="test account's email" aria-label="Test account's email" disabled={busy} />
        <button type="button" className="btn small" disabled={busy || !email.trim()} onClick={() => void go()}>
          {busy ? 'Ending…' : 'End trial now'}
        </button>
      </div>
      {note && (
        <p className="hint" role="status">
          {note}
        </p>
      )}
    </section>
  );
}
