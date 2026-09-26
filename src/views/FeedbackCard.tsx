import { useState } from 'react';
import { useAccount } from '../auth/AccountContext';
import { supabase } from '../auth/client';

/** Two sentences and, if it helps, a screenshot from the device. Lands on the admin screen. */
export function FeedbackCard() {
  const { auth } = useAccount();
  const [kind, setKind] = useState<'feedback' | 'bug'>('feedback');
  const [text, setText] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  if (!auth.configured)
    return (
      <section className="card settings-card" aria-label="Feedback">
        <h2 className="section-title">Feedback</h2>
        <p className="hint">This build has no accounts, so there is nowhere to send feedback from here.</p>
      </section>
    );

  const send = async () => {
    const c = supabase();
    if (!c || !auth.userId || !text.trim()) return;
    setBusy(true);
    setNote(null);
    try {
      let screenshot_path: string | null = null;
      if (file) {
        const ext = (file.name.split('.').pop() || 'png').toLowerCase().slice(0, 5);
        const path = `${auth.userId}/${Date.now()}.${ext}`;
        const { error } = await c.storage.from('feedback').upload(path, file, { contentType: file.type || 'image/png' });
        if (error) throw new Error(error.message);
        screenshot_path = path;
      }
      const { error } = await c.from('feedback').insert({ kind, text: text.trim().slice(0, 4000), screen: window.location.hash.slice(0, 120), screenshot_path });
      if (error) throw new Error(error.message);
      setText('');
      setFile(null);
      setNote('Sent. Thank you.');
    } catch (e) {
      setNote(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card settings-card" aria-label="Feedback">
      <h2 className="section-title">Tell us what is wrong, or what would help</h2>
      {!auth.session ? (
        <p className="hint">Sign in above to send feedback.</p>
      ) : (
        <>
          <div className="settings-actions">
            <button type="button" className={`btn small${kind === 'feedback' ? ' primary' : ''}`} onClick={() => setKind('feedback')}>
              An idea
            </button>
            <button type="button" className={`btn small${kind === 'bug' ? ' primary' : ''}`} onClick={() => setKind('bug')}>
              Something broke
            </button>
          </div>
          <textarea className="halo-paste" rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder={kind === 'bug' ? 'What did you do, what happened, what did you expect?' : 'What would make this better?'} aria-label="Feedback" />
          <label className="field">
            <span>Screenshot (optional)</span>
            <input type="file" accept="image/*" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </label>
          <div className="settings-actions">
            <button type="button" className="btn small primary" disabled={busy || !text.trim()} onClick={() => void send()}>
              {busy ? 'Sending…' : 'Send'}
            </button>
          </div>
          {note && (
            <p className="hint" role="status">
              {note}
            </p>
          )}
        </>
      )}
    </section>
  );
}
