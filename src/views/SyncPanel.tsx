import { useState } from 'react';
import { useStore } from '../storage/store';
import { getSupabaseClient } from '../storage/supabaseRepo';

export function SyncPanel() {
  const { data, sync, actions } = useStore();
  const [url, setUrl] = useState(data.settings.supabaseUrl ?? '');
  const [key, setKey] = useState(data.settings.supabaseAnonKey ?? '');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const configured = !!data.settings.supabaseUrl && !!data.settings.supabaseAnonKey;
  const dirty = url.trim() !== (data.settings.supabaseUrl ?? '') || key.trim() !== (data.settings.supabaseAnonKey ?? '');

  const saveConnection = () => {
    actions.updateSettings({ supabaseUrl: url.trim() || null, supabaseAnonKey: key.trim() || null });
    setMsg(url.trim() ? 'Connection saved. Sign in below.' : 'Sync turned off. Data stays on this device.');
  };

  const auth = async (mode: 'in' | 'up') => {
    if (!configured) return;
    setBusy(true);
    setMsg(null);
    try {
      const client = getSupabaseClient(data.settings.supabaseUrl!, data.settings.supabaseAnonKey!);
      const res =
        mode === 'in'
          ? await client.auth.signInWithPassword({ email, password })
          : await client.auth.signUp({ email, password });
      if (res.error) throw res.error;
      if (mode === 'up' && !res.data.session) setMsg('Account created. Check your email to confirm, then sign in.');
      else setMsg(null);
      setPassword('');
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const signOut = async () => {
    const client = getSupabaseClient(data.settings.supabaseUrl!, data.settings.supabaseAnonKey!);
    await client.auth.signOut();
    setMsg('Signed out. Changes stay on this device until you sign in again.');
  };

  const statusText = {
    off: 'Not connected. Data lives in this browser only.',
    signed_out: 'Connected to Supabase, signed out.',
    syncing: 'Syncing…',
    synced: `Synced${sync.lastSync ? ` at ${new Date(sync.lastSync).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : ''}${sync.pending ? ` · ${sync.pending} change${sync.pending === 1 ? '' : 's'} waiting` : ''}`,
    error: `Sync problem: ${sync.error}`,
  }[sync.status];

  return (
    <section className="card settings-card">
      <h2 className="section-title">Sync across devices</h2>
      <p className="settings-status">
        <span className="sync-dot" data-status={sync.status} style={{ marginLeft: 0 }} /> {statusText}
        {sync.email && <span className="muted"> · {sync.email}</span>}
      </p>

      {sync.status === 'synced' || sync.status === 'syncing' || (sync.status === 'error' && sync.email) ? (
        <div className="modal-actions" style={{ marginTop: 8 }}>
          <button type="button" className="btn small" onClick={() => void actions.syncNow()} disabled={sync.status === 'syncing'}>
            Sync now
          </button>
          <button type="button" className="btn small" onClick={() => void signOut()}>
            Sign out
          </button>
        </div>
      ) : (
        <>
          <details open={!configured} className="settings-details">
            <summary>Supabase project</summary>
            <div className="modal-body" style={{ marginTop: 8 }}>
              <label className="field">
                <span>Project URL</span>
                <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://xxxx.supabase.co" autoCapitalize="off" autoCorrect="off" />
              </label>
              <label className="field">
                <span>Anon public key</span>
                <input value={key} onChange={(e) => setKey(e.target.value)} placeholder="eyJ…" autoCapitalize="off" autoCorrect="off" />
              </label>
              <div className="modal-actions" style={{ marginTop: 0 }}>
                <button type="button" className="btn small primary" onClick={saveConnection} disabled={!dirty}>
                  Save connection
                </button>
              </div>
              <p className="hint">Run supabase/schema.sql once in the project's SQL editor before signing in.</p>
            </div>
          </details>
          {configured && (
            <form
              className="modal-body"
              style={{ marginTop: 12 }}
              onSubmit={(e) => {
                e.preventDefault();
                void auth('in');
              }}
            >
              <label className="field">
                <span>Email</span>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" required />
              </label>
              <label className="field">
                <span>Password</span>
                <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required minLength={6} />
              </label>
              <div className="modal-actions" style={{ marginTop: 0 }}>
                <button type="submit" className="btn primary" disabled={busy || !email || !password}>
                  Sign in
                </button>
                <button type="button" className="btn" disabled={busy || !email || !password} onClick={() => void auth('up')}>
                  Create account
                </button>
              </div>
            </form>
          )}
        </>
      )}
      {msg && <p className="hint" style={{ marginTop: 8 }}>{msg}</p>}
    </section>
  );
}
