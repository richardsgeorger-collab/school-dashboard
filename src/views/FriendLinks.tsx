import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../auth/client';
import { dateOf, fmtDate } from '../domain/dates';
import { useStore } from '../storage/store';

interface Member {
  email: string;
  joined_at: string | null;
  onboarded: boolean;
  synced: boolean;
}
interface Link {
  code: string;
  label: string | null;
  from_name: string;
  max_uses: number;
  active: boolean;
  until: string;
  created_at: string;
  members: Member[];
}

/** The end of the current term, as a date to offer by default: the latest class end on file, else Dec 20. */
function termEnd(ends: string[]): string {
  const latest = ends.filter(Boolean).sort().pop();
  return latest ?? `${new Date().getFullYear()}-12-20`;
}

export const friendUrl = (code: string) => `${window.location.origin}${import.meta.env.BASE_URL}#/start?friend=${code}`;

/**
 * George's friend links (admin only): make one, see who joined, whether they finished onboarding and synced, and
 * turn a link off. Anyone who signs up through a link gets Max free through its date, no card, no countdown.
 */
export function FriendLinks() {
  const { data } = useStore();
  const tz = data.settings.timezone;
  const [links, setLinks] = useState<Link[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [label, setLabel] = useState('');
  const [uses, setUses] = useState(10);
  const [until, setUntil] = useState(termEnd(data.courses.map((c) => c.termEnd)));
  const [from, setFrom] = useState('George');
  const [copied, setCopied] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const c = supabase();
    if (!c) return;
    const { data: rows, error } = await c.rpc('list_friend_links');
    if (error) setErr(error.message);
    else setLinks((rows as Link[]) ?? []);
  }, []);
  useEffect(() => void load(), [load]);

  const create = async () => {
    const c = supabase();
    if (!c) return;
    setBusy(true);
    setErr(null);
    // The link runs to the end of that day in the student's zone.
    const end = new Date(`${until}T23:59:00`).toISOString();
    const { data: code, error } = await c.rpc('create_friend_link', { p_label: label, p_max_uses: uses, p_until: end, p_from_name: from });
    setBusy(false);
    if (error) return setErr(error.message);
    setLabel('');
    await load();
    if (typeof code === 'string') void copy(code);
  };
  const toggle = async (l: Link) => {
    const c = supabase();
    if (!c) return;
    await c.rpc('set_friend_link_active', { p_code: l.code, p_active: !l.active });
    await load();
  };
  const copy = async (code: string) => {
    try {
      await navigator.clipboard.writeText(friendUrl(code));
      setCopied(code);
    } catch {
      setCopied(null);
    }
  };
  const day = (iso: string | null) => (iso ? fmtDate(dateOf(iso, tz), 'short') : '');

  return (
    <section className="card settings-card friend-links" aria-label="Friend links">
      <h2 className="section-title">Friend links</h2>
      <p className="hint">Anyone who signs up through a link gets Max free through its date. No card, no trial countdown, no upgrade asks.</p>
      <div className="friend-form">
        <label className="field">
          <span>Who it is for</span>
          <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="ESG-162 group chat" />
        </label>
        <label className="field">
          <span>Uses</span>
          <input type="number" min={1} max={500} value={uses} onChange={(e) => setUses(Math.max(1, Number(e.target.value) || 10))} />
        </label>
        <label className="field">
          <span>Max free through</span>
          <input type="date" value={until} onChange={(e) => setUntil(e.target.value)} />
        </label>
        <label className="field">
          <span>From</span>
          <input value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
      </div>
      <div className="settings-actions">
        <button type="button" className="btn small primary" disabled={busy} onClick={() => void create()}>
          {busy ? 'Making…' : 'Make a link and copy it'}
        </button>
      </div>
      {err && (
        <p className="hint" role="alert">
          {err}
        </p>
      )}
      {links?.length === 0 && <p className="hint">No links yet.</p>}
      <ul className="friend-list">
        {(links ?? []).map((l) => (
          <li key={l.code} data-active={l.active}>
            <div className="friend-head">
              <b>{l.label || 'Friend link'}</b>
              <span className="hint mono">
                {l.members.length} of {l.max_uses} used · Max through {day(l.until)} · {l.active ? 'on' : 'off'}
              </span>
            </div>
            <div className="settings-actions">
              <button type="button" className="btn small" onClick={() => void copy(l.code)}>
                {copied === l.code ? 'Copied' : 'Copy link'}
              </button>
              <button type="button" className="btn small" onClick={() => void toggle(l)}>
                {l.active ? 'Turn off' : 'Turn on'}
              </button>
            </div>
            {l.members.length > 0 && (
              <table className="friend-members">
                <thead>
                  <tr>
                    <th>Joined</th>
                    <th>Who</th>
                    <th>Onboarded</th>
                    <th>Synced Halo</th>
                  </tr>
                </thead>
                <tbody>
                  {l.members.map((m) => (
                    <tr key={m.email}>
                      <td className="mono">{day(m.joined_at)}</td>
                      <td>{m.email}</td>
                      <td>{m.onboarded ? 'Yes' : 'Not yet'}</td>
                      <td>{m.synced ? 'Yes' : 'Not yet'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
