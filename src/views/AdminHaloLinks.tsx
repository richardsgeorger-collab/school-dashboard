import { useEffect, useState } from 'react';
import { supabase } from '../auth/client';

interface Link {
  halo_user: string;
  email: string;
  test: boolean;
  linked_at: string;
  last_seen_at: string;
  via: string | null;
  classes: string[];
  offers: number;
}

/**
 * Halo links (2026-10-11): which Halo+ account each Halo student is linked to. Look one up by an account's email (or a
 * link's first characters), move it to another account, or unlink it. Moving clears the old account's Halo data and
 * leaves a note in Errors; a test account never takes a real account's Halo.
 */
export function AdminHaloLinks() {
  const [q, setQ] = useState('');
  const [rows, setRows] = useState<Link[] | null>(null);
  const [to, setTo] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const load = async (query: string) => {
    const { data, error } = (await supabase()?.rpc('admin_halo_links', { p_query: query })) ?? { data: null, error: null };
    if (error) return setNote(error.message);
    setRows((data as Link[]) ?? []);
  };
  useEffect(() => {
    void load('');
  }, []);
  const move = async (l: Link) => {
    setBusy(l.halo_user);
    const { data, error } = (await supabase()?.rpc('admin_halo_move', { p_halo_user: l.halo_user, p_to_email: (to[l.halo_user] ?? '').trim() })) ?? { data: null, error: null };
    setBusy(null);
    const d = data as { ok?: boolean; why?: string; cleared?: number } | null;
    setNote(error ? error.message : d?.ok ? `Moved. ${d.cleared ?? 0} classes cleared from ${l.email}.` : (d?.why ?? 'Could not move it.'));
    await load(q);
  };
  const unlink = async (l: Link) => {
    setBusy(l.halo_user);
    await supabase()?.rpc('admin_halo_unlink', { p_halo_user: l.halo_user });
    setBusy(null);
    setNote(`Unlinked from ${l.email}. The next real account to sync it links it.`);
    await load(q);
  };
  return (
    <section className="card settings-card admin-halo-links" aria-label="Halo links">
      <h2 className="section-title">Halo links</h2>
      <p className="hint">One Halo student, one Halo+ account. Search by an account's email. Moving clears the old account's Halo data and notes it in Errors.</p>
      <div className="field-row">
        <input className="field-input" type="search" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void load(q)} placeholder="Email, or a link's first characters" aria-label="Find a Halo link" />
        <button type="button" className="btn small" onClick={() => void load(q)}>
          Find
        </button>
      </div>
      {note && (
        <p className="hint" role="status">
          {note}
        </p>
      )}
      {rows && rows.length === 0 && <p className="hint">No links yet. A link is made at a real account's first sync with the current sync script (extension 0.6.4, or the bookmark).</p>}
      {rows && rows.length > 0 && (
        <ul className="halo-links">
          {rows.map((l) => (
            <li key={l.halo_user}>
              <p>
                <b>{l.email}</b>
                {l.test ? ' · test' : ''} · Halo {l.halo_user.slice(0, 8)}… · {l.classes.join(', ') || 'no classes yet'} · linked {l.linked_at.slice(0, 10)} via {l.via ?? '?'} · last sync {l.last_seen_at.slice(0, 16).replace('T', ' ')}
                {l.offers ? ` · ${l.offers} move waiting` : ''}
              </p>
              <div className="field-row">
                <input className="field-input" type="email" value={to[l.halo_user] ?? ''} onChange={(e) => setTo({ ...to, [l.halo_user]: e.target.value })} placeholder="Move to account email" aria-label={`Move ${l.email}'s Halo to`} />
                <button type="button" className="btn small" disabled={busy === l.halo_user || !(to[l.halo_user] ?? '').trim()} onClick={() => void move(l)}>
                  Move
                </button>
                <button type="button" className="btn small quiet" disabled={busy === l.halo_user} onClick={() => void unlink(l)}>
                  Unlink
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
