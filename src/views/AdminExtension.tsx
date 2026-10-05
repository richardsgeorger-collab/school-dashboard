import { useEffect, useState } from 'react';
import { supabase } from '../auth/client';

/**
 * The Chrome extension's Web Store address (2026-10-01). Set here, every "Add to Chrome" and "Enable auto-sync"
 * offer turns on for students on desktop Chrome, Edge and Brave; cleared, they all go away. No deploy needed.
 */
export function AdminExtension() {
  const [url, setUrl] = useState('');
  const [saved, setSaved] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    void supabase()
      ?.rpc('app_setting', { p_key: 'extension_url' })
      .then(({ data }) => {
        const v = typeof data === 'string' ? data : '';
        setUrl(v);
        setSaved(v);
      });
  }, []);
  const save = async (value: string) => {
    setBusy(true);
    setNote(null);
    const { error } = (await supabase()?.rpc('admin_set_setting', { p_key: 'extension_url', p_value: value })) ?? { error: null };
    setBusy(false);
    if (error) return setNote(error.message);
    setSaved(value.trim());
    setUrl(value.trim());
    setNote(value.trim() ? 'Saved. Install offers are on for desktop Chrome, Edge and Brave.' : 'Cleared. No install offers anywhere.');
  };
  return (
    <section className="card settings-card admin-extension" aria-label="Chrome extension">
      <h2 className="section-title">Chrome extension</h2>
      <p className="hint">The Web Store address. While it is set, students on desktop Chrome, Edge or Brave see Enable auto-sync (Plus and Max) and Add to Chrome; everyone else sees nothing.</p>
      <label className="field">
        <span>Store URL</span>
        <input className="field-input" type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://chromewebstore.google.com/detail/…" />
      </label>
      <div className="settings-actions">
        <button type="button" className="btn small primary" disabled={busy || url.trim() === (saved ?? '')} onClick={() => void save(url)}>
          {busy ? 'Saving…' : 'Save'}
        </button>
        {saved && (
          <a className="btn small" href={saved} target="_blank" rel="noopener">
            Open the listing
          </a>
        )}
        {saved && (
          <button type="button" className="btn small quiet" disabled={busy} onClick={() => void save('')}>
            Turn offers off
          </button>
        )}
      </div>
      {note && (
        <p className="hint" role="status">
          {note}
        </p>
      )}
    </section>
  );
}
