import { useEffect, useState } from 'react';
import { supabase } from '../auth/client';
import { droppedAt, funnelTotals, STEPS, type SignupRow } from './signupFunnel';

const pct = (n: number, of: number) => (of ? `${Math.round((n / of) * 100)}%` : '–');
const day = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'America/Phoenix' });
const yes = (b: boolean) => (b ? '✓' : '·');

/**
 * From sign-up to the first sync (George, 2026-10-13): every real account made in the window, the device and browser
 * it signed up on, and each step it reached (Connect Halo, Add to Chrome, the extension found, Halo opened, a sync
 * landed), with where it stopped. Real students only (the test-account rule). Read from admin_signup_funnel.
 */
export function AdminSignupFunnel() {
  const [days, setDays] = useState(14);
  const [rows, setRows] = useState<SignupRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    setRows(null);
    void supabase()
      ?.rpc('admin_signup_funnel', { p_days: days })
      .then(({ data, error }) => (error ? setErr(error.message) : setRows(((data as { accounts?: SignupRow[] } | null)?.accounts ?? []) as SignupRow[])));
  }, [days]);
  const t = rows ? funnelTotals(rows) : null;
  return (
    <section className="card settings-card admin-signup-funnel" aria-label="Sign-up to first sync">
      <h2 className="section-title">Sign-up to first sync</h2>
      <div className="segmented" role="group" aria-label="Window">
        {[7, 14, 30].map((d) => (
          <button key={d} type="button" aria-pressed={days === d} onClick={() => setDays(d)}>
            {d} days
          </button>
        ))}
      </div>
      {err && <p className="hint">{err}</p>}
      {!rows && !err && <p className="hint">Loading…</p>}
      {t && rows && (
        <>
          <table className="funnel-table signup-funnel-totals">
            <thead>
              <tr>
                <th scope="col">Step</th>
                <th scope="col" className="num">All</th>
                <th scope="col" className="num">Laptop</th>
                <th scope="col" className="num">Phone or tablet</th>
              </tr>
            </thead>
            <tbody>
              {STEPS.map(([k, label]) => (
                <tr key={k}>
                  <th scope="row">{label}</th>
                  <td className="num">
                    {t[k].all} <span className="muted">{pct(t[k].all, t.signed_up.all)}</span>
                  </td>
                  <td className="num">
                    {t[k].laptop} <span className="muted">{pct(t[k].laptop, t.signed_up.laptop)}</span>
                  </td>
                  <td className="num">
                    {t[k].touch} <span className="muted">{pct(t[k].touch, t.signed_up.touch)}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="hint">"Pressed Add to Chrome" and "Extension installed" only happen on a laptop. A phone or tablet sign-up counts there once the same account carries on on a laptop.</p>
          <div className="table-scroll">
            <table className="signup-funnel-rows">
              <thead>
                <tr>
                  <th scope="col">Account</th>
                  <th scope="col">Signed up</th>
                  <th scope="col">On</th>
                  <th scope="col" title="Reached Connect Halo">Connect</th>
                  <th scope="col" title="Pressed Add to Chrome">Add</th>
                  <th scope="col" title="Extension installed">Ext</th>
                  <th scope="col" title="Opened Halo">Halo</th>
                  <th scope="col" title="A sync landed">Synced</th>
                  <th scope="col" className="num">Classes now</th>
                  <th scope="col">Stopped</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={`${r.who}-${r.created_at}`} data-landed={r.landed || undefined}>
                    <th scope="row">{r.who}</th>
                    <td>{day(r.created_at)}</td>
                    <td>
                      {r.device} · {r.browser}
                    </td>
                    <td>{yes(r.reached_connect)}</td>
                    <td>{yes(r.clicked_store)}</td>
                    <td>{yes(r.installed)}</td>
                    <td>{yes(r.opened_halo)}</td>
                    <td>{yes(r.landed)}</td>
                    <td className="num">{r.classes_now}</td>
                    <td className="muted">{droppedAt(r) ?? (r.classes_now === 0 ? 'Synced, but no classes now' : '')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
