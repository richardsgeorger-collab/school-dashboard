import { useEffect, useState } from 'react';
import { supabase } from '../auth/client';

const pct = (n: number, of: number) => (of ? `${Math.round((n / of) * 100)}%` : '–');

export interface IgFunnel {
  days: number;
  visits: number;
  visits_phone: number;
  share: number;
  copy: number;
  email: number;
  app: number;
  laptop: number;
  laptop_share: number;
  laptop_email: number;
  laptop_store: number;
  installed: number;
  signed_up: number;
  first_sync: number;
  week_eligible: number;
  week_later: number;
  emails_sent: number;
}

/** The rows of the Instagram funnel, each with its share of the visits. */
export function igSteps(f: IgFunnel): { label: string; n: number; detail?: string }[] {
  return [
    { label: 'Instagram visit', n: f.visits, detail: `${f.visits_phone} on a phone or tablet` },
    { label: 'Phone option used', n: f.share + f.copy + f.email + f.app, detail: `share ${f.share} · copy link ${f.copy} · email ${f.email} · app ${f.app}` },
    { label: 'Laptop page opened', n: f.laptop, detail: `from a share or copy ${f.laptop_share} · from the email ${f.laptop_email} · pressed Add to Chrome ${f.laptop_store}` },
    { label: 'Installed', n: f.installed, detail: 'the welcome tab after the install' },
    { label: 'Signed up', n: f.signed_up },
    { label: 'First sync', n: f.first_sync },
    { label: 'Still using a week later', n: f.week_later, detail: `of ${f.week_eligible} old enough` },
  ];
}

/**
 * The Instagram funnel (Loop 294, George 2026-10-30): a visit from the bio link (haloplus.app/?src=ig), the phone option
 * used (share sheet, copy link, the one email, the app), the laptop page opened, the extension installed (its welcome
 * tab), signed up, first sync, still using a week later. Signed-out steps are one per browser; the account steps are
 * real students only. Read from admin_ig_funnel.
 */
export function AdminIgFunnel() {
  const [days, setDays] = useState(30);
  const [f, setF] = useState<IgFunnel | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    setF(null);
    setErr(null);
    void supabase()
      ?.rpc('admin_ig_funnel', { p_days: days })
      .then(({ data, error }) => (error ? setErr(error.message) : setF(data as IgFunnel)));
  }, [days]);
  return (
    <section className="card settings-card admin-ig-funnel" aria-label="Instagram funnel">
      <h2 className="section-title">Instagram funnel</h2>
      <p className="hint">Bio link: haloplus.app/?src=ig. One email sent per address, ever ({f ? f.emails_sent : '…'} in this window).</p>
      <div className="segmented" role="group" aria-label="Window">
        {[7, 30, 90].map((d) => (
          <button key={d} type="button" aria-pressed={days === d} onClick={() => setDays(d)}>
            {d} days
          </button>
        ))}
      </div>
      {err && <p className="hint">{err}</p>}
      {!f && !err && <p className="hint">Loading…</p>}
      {f && (
        <table className="funnel-table">
          <thead>
            <tr>
              <th scope="col">Step</th>
              <th scope="col">Count</th>
              <th scope="col">Of visits</th>
            </tr>
          </thead>
          <tbody>
            {igSteps(f).map((s) => (
              <tr key={s.label}>
                <th scope="row">
                  {s.label}
                  {s.detail && <span className="hint"> · {s.detail}</span>}
                </th>
                <td>{s.n}</td>
                <td>{pct(s.n, f.visits)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
