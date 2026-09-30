import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../auth/client';
import { report } from '../monitor/report';

interface Issue {
  fingerprint: string;
  kind: string;
  title: string;
  place: string | null;
  first_seen: string;
  last_seen: string;
  count: number;
  students: number;
  last_day: number;
  versions: string[] | null;
  resolved: boolean;
  reopened_at: string | null;
  alerted_at: string | null;
}
interface Sample {
  sample: { message: string | null; stack: string | null; place: string | null; status: number | null; app_version: string | null; ext_version: string | null; browser: string | null; device: string | null; plan: string | null; details: Record<string, unknown>; created_at: string } | null;
  recent: { at: string; app_version: string | null; ext_version: string | null; browser: string | null; device: string | null; plan: string | null }[];
  alerts: { at: string; reason: string; channel: string; ok: boolean; detail: string | null }[];
}

const KIND: Record<string, string> = { crash: 'Crash', rejection: 'Crash', function: 'Server call', extension: 'Extension', server: 'Server', silent: 'Silent failure', test: 'Test' };
const ago = (iso: string) => {
  const m = Math.round((Date.now() - Date.parse(iso)) / 60_000);
  return m < 1 ? 'just now' : m < 60 ? `${m}m ago` : m < 1440 ? `${Math.round(m / 60)}h ago` : `${Math.round(m / 1440)}d ago`;
};
const when = (iso: string) => new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

/**
 * Errors (George, 2026-09-30, launch day): every problem the app, the extension and the server reported, grouped,
 * newest first. Open one for a sample with its stack and the alerts it sent; Resolved hides it until it happens on a
 * new deploy. "Send a test alert" goes through the whole path: report, group, alert.
 */
export function AdminErrors() {
  const [issues, setIssues] = useState<Issue[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [sample, setSample] = useState<Sample | null>(null);
  const [showResolved, setShowResolved] = useState(false);
  const [testNote, setTestNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    const { data, error: e } = (await supabase()?.rpc('admin_errors')) ?? { data: null, error: null };
    if (e) setError(e.message);
    else setIssues((data as Issue[]) ?? []);
  }, []);
  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 60_000);
    return () => clearInterval(t);
  }, [load]);
  useEffect(() => {
    setSample(null);
    if (!open) return;
    void supabase()?.rpc('admin_error_sample', { fp: open }).then(({ data }) => setSample(data as Sample));
  }, [open]);
  const resolve = async (fp: string, resolved: boolean) => {
    await supabase()?.rpc('admin_resolve_error', { fp, resolved });
    await load();
  };
  const test = async () => {
    setTestNote('Sending…');
    report({ kind: 'test', title: 'Test alert from the Admin page', place: 'admin', details: { at: new Date().toISOString().slice(11, 16) } });
    // Where it went: the test issue's alerts, read back a few seconds later.
    for (let k = 0; k < 8; k++) {
      await new Promise((r) => setTimeout(r, 1500));
      const list = ((await supabase()?.rpc('admin_errors'))?.data ?? []) as Issue[];
      const t = list.find((i) => i.kind === 'test');
      if (!t) continue;
      const s = (await supabase()?.rpc('admin_error_sample', { fp: t.fingerprint }))?.data as Sample | null;
      const fresh = (s?.alerts ?? []).filter((a) => Date.now() - Date.parse(a.at) < 60_000);
      if (fresh.length) {
        setTestNote(fresh.map((a) => `${a.channel === 'email' ? 'Email' : 'Push'}: ${a.ok ? 'sent' : 'not sent'}${a.detail ? ` (${a.detail})` : ''}`).join(' · '));
        setIssues(list);
        return;
      }
    }
    setTestNote('Recorded, but no alert came back yet (a test on this device is limited to one every 5 minutes).');
    await load();
  };

  const shown = (issues ?? []).filter((i) => showResolved || !i.resolved);
  const resolvedCount = (issues ?? []).filter((i) => i.resolved).length;
  return (
    <section className="card settings-card admin-errors" aria-label="Errors">
      <div className="grade-head">
        <h2 className="section-title">Errors</h2>
        <button type="button" className="btn small" onClick={() => void test()}>
          Send a test alert
        </button>
      </div>
      {testNote && (
        <p className="hint" role="status">
          {testNote}
        </p>
      )}
      <p className="hint">Crashes, failed server calls, the extension and silent failures, grouped. Emails and pushes go out when a new problem appears, one hits 10 times in 10 minutes, or anything silent happens; one per problem per hour.</p>
      {error && <p className="hint">{error}</p>}
      {issues === null ? (
        <p className="hint">Loading…</p>
      ) : shown.length === 0 ? (
        <p className="hint">Nothing broken{resolvedCount ? ` (${resolvedCount} resolved)` : ''}.</p>
      ) : (
        <ul className="err-list">
          {shown.map((i) => (
            <li key={i.fingerprint} className="err-item" data-kind={i.kind} data-resolved={i.resolved || undefined}>
              <button type="button" className="err-row" onClick={() => setOpen(open === i.fingerprint ? null : i.fingerprint)} aria-expanded={open === i.fingerprint}>
                <span className="err-kind">{KIND[i.kind] ?? i.kind}</span>
                <span className="err-title">{i.title}</span>
                <span className="err-meta">
                  {i.count} time{i.count === 1 ? '' : 's'} · {i.students} student{i.students === 1 ? '' : 's'} · last {ago(i.last_seen)} · first {when(i.first_seen)}
                  {i.reopened_at && !i.resolved ? ' · back after a deploy' : ''}
                  {i.resolved ? ' · resolved' : ''}
                </span>
                {i.versions?.length ? <span className="err-versions">{i.versions.join(', ')}</span> : null}
              </button>
              {open === i.fingerprint && (
                <div className="err-detail">
                  {!sample?.sample ? (
                    <p className="hint">Loading…</p>
                  ) : (
                    <>
                      <p className="hint">
                        {when(sample.sample.created_at)} · {sample.sample.place ?? 'unknown place'}
                        {sample.sample.status ? ` · status ${sample.sample.status}` : ''} · app {sample.sample.app_version ?? '—'}
                        {sample.sample.ext_version ? ` · extension ${sample.sample.ext_version}` : ''} · {sample.sample.browser ?? '—'} ({sample.sample.device ?? '—'}) · plan {sample.sample.plan ?? '—'}
                      </p>
                      {sample.sample.message && <pre className="err-pre">{sample.sample.message}</pre>}
                      {Object.keys(sample.sample.details ?? {}).length > 0 && <pre className="err-pre">{JSON.stringify(sample.sample.details, null, 1)}</pre>}
                      {sample.sample.stack && (
                        <details>
                          <summary>Stack</summary>
                          <pre className="err-pre">{sample.sample.stack}</pre>
                        </details>
                      )}
                      {sample.alerts.length > 0 && (
                        <p className="hint">
                          Alerts: {sample.alerts.map((a) => `${when(a.at)} ${a.channel} ${a.ok ? 'sent' : 'not sent'}${a.detail ? ` (${a.detail})` : ''}`).join(' · ')}
                        </p>
                      )}
                    </>
                  )}
                  <div className="settings-actions">
                    <button type="button" className="btn small" onClick={() => void resolve(i.fingerprint, !i.resolved)}>
                      {i.resolved ? 'Reopen' : 'Resolved'}
                    </button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {resolvedCount > 0 && (
        <button type="button" className="hero-inline" onClick={() => setShowResolved((v) => !v)}>
          {showResolved ? 'Hide resolved' : `Show ${resolvedCount} resolved`}
        </button>
      )}
    </section>
  );
}
