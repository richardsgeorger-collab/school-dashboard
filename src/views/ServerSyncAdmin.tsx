import { useEffect, useState } from 'react';
import { supabase } from '../auth/client';

interface State {
  everyone: boolean;
  kill: boolean;
  accounts: { email: string; user_id: string }[];
  pending_last_day: number;
  taken_last_day: number;
}

/**
 * Admins only: the iPad and phone sync (the bookmark drops its export on the server). Off for everyone by default;
 * turn it on for chosen accounts first, then for everyone. The kill switch sends every bookmark back to the old
 * behaviour at once, with no deploy.
 */
export function ServerSyncAdmin() {
  const [s, setS] = useState<State | null>(null);
  const [email, setEmail] = useState('');
  const [note, setNote] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const c = supabase();
    if (!c) return;
    void c.rpc('admin_server_sync').then(({ data, error }) => (error ? setNote(error.message) : setS(data as State)));
  }, [tick]);
  const call = async (fn: string, args: Record<string, unknown>) => {
    const c = supabase();
    if (!c) return;
    const { data, error } = await c.rpc(fn, args);
    const d = data as { ok?: boolean; why?: string } | null;
    setNote(error ? error.message : d && d.ok === false ? (d.why ?? 'Could not.') : 'Saved.');
    setTick((t) => t + 1);
  };
  if (!s) return <section className="card settings-card"><h2 className="section-title">iPad and phone sync</h2><p className="hint">{note ?? 'Loading…'}</p></section>;
  return (
    <section className="card settings-card" aria-label="iPad and phone sync">
      <h2 className="section-title">iPad and phone sync</h2>
      <p className="hint">The bookmark sends its export straight to the student's account, for devices where the two tabs can't talk. A student only gets it after saving the bookmark again while it is on for them.</p>
      <p className={s.kill ? 'hint admin-kill-on' : 'hint'}>
        <b>{s.kill ? 'Kill switch ON: off for everyone.' : s.everyone ? 'On for everyone.' : `On for ${s.accounts.length} account${s.accounts.length === 1 ? '' : 's'} only.`}</b> Last 24 hours: {s.pending_last_day} sent, {s.taken_last_day} picked up.
      </p>
      <div className="settings-actions">
        <button type="button" className={s.kill ? 'btn small primary' : 'btn small danger'} onClick={() => void call('admin_set_switch', { switch_name: 'server_sync_kill', on_off: !s.kill })}>
          {s.kill ? 'Turn the kill switch off' : 'Kill switch: off for everyone now'}
        </button>
        <button type="button" className="btn small" disabled={s.kill} onClick={() => void call('admin_set_switch', { switch_name: 'server_sync_everyone', on_off: !s.everyone })}>
          {s.everyone ? 'Back to chosen accounts only' : 'Turn on for everyone'}
        </button>
      </div>
      <form
        className="settings-actions"
        onSubmit={(e) => {
          e.preventDefault();
          if (email.trim()) void call('admin_set_server_sync', { account_email: email, on_off: true }).then(() => setEmail(''));
        }}
      >
        <input className="field-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="friend@example.com" aria-label="Account email" />
        <button type="submit" className="btn small">Turn on for this account</button>
      </form>
      {s.accounts.length > 0 && (
        <ul className="diff-list">
          {s.accounts.map((a) => (
            <li key={a.user_id}>
              {a.email}{' '}
              <button type="button" className="hero-inline" onClick={() => void call('admin_set_server_sync', { account_email: a.email, on_off: false })}>
                turn off
              </button>
            </li>
          ))}
        </ul>
      )}
      {note && <p className="hint" role="status">{note}</p>}
    </section>
  );
}
