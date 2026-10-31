import { useEffect, useState } from 'react';
import { supabase } from '../auth/client';

const pct = (n: number, of: number) => (of ? `${Math.round((n / of) * 100)}%` : '–');

export interface IgFunnel {
  days: number;
  visits: number;
  visits_phone: number;
  fold?: number;
  email_focus?: number;
  google?: number;
  apple?: number;
  safari?: number;
  signed_up_phone?: number;
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

/**
 * The phone screen's steps, in order (Loop 298, George: "find where people stop"): each with its count and its share of
 * the visits, and how many fewer than the step before. Share and Google/Apple are side roads off the email, so the
 * drop is shown only on the main path (page → button → email box → email → laptop → installed → sync).
 */
export function igSteps(f: IgFunnel): { label: string; n: number; detail?: string; from?: number }[] {
  const visits = f.visits;
  return [
    { label: 'Page loaded', n: visits, detail: `${f.visits_phone} on a phone or tablet` },
    { label: 'Main button visible without scrolling', n: f.fold ?? 0, from: visits },
    { label: 'Email box tapped', n: f.email_focus ?? 0, from: f.fold ?? visits },
    { label: 'Email sent', n: f.email, from: f.email_focus ?? 0 },
    { label: 'Share tapped', n: f.share + f.copy, detail: `another way to the laptop: share sheet ${f.share} · copy link ${f.copy}` },
    { label: 'Google / Apple tapped', n: (f.google ?? 0) + (f.apple ?? 0), detail: `starting on the phone: Google ${f.google ?? 0} · Apple ${f.apple ?? 0} · Open in Safari ${f.safari ?? 0}` },
    { label: 'Account made on the phone', n: f.signed_up_phone ?? 0, from: (f.google ?? 0) + (f.apple ?? 0) },
    { label: 'Laptop page opened', n: f.laptop, detail: `from a share or copy ${f.laptop_share} · from an email ${f.laptop_email} · pressed Add to Chrome ${f.laptop_store}`, from: f.email + f.share + f.copy + (f.signed_up_phone ?? 0) },
    { label: 'Extension installed', n: f.installed, detail: 'the welcome tab after the install', from: f.laptop },
    { label: 'Signed up (all ways)', n: f.signed_up },
    { label: 'First sync', n: f.first_sync, from: f.signed_up },
    { label: 'Still using a week later', n: f.week_later, detail: `of ${f.week_eligible} old enough`, from: f.week_eligible },
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
        <ol className="ig-drop" aria-label="Where people stop">
          {igSteps(f).map((st) => {
            const w = f.visits ? Math.max(st.n ? 1.5 : 0, (st.n / f.visits) * 100) : 0;
            const lost = st.from !== undefined && st.from > st.n ? st.from - st.n : 0;
            return (
              <li key={st.label} className="ig-drop-row">
                <div className="ig-drop-head">
                  <span className="ig-drop-label">{st.label}</span>
                  <span className="ig-drop-n">
                    <b>{st.n}</b> · {pct(st.n, f.visits)}
                    {lost > 0 && <span className="ig-drop-lost"> · −{lost} ({pct(lost, st.from ?? 0)} stop here)</span>}
                  </span>
                </div>
                <div className="ig-drop-track" aria-hidden>
                  <div className="ig-drop-bar" style={{ width: `${Math.min(100, w)}%` }} />
                </div>
                {st.detail && <div className="hint ig-drop-detail">{st.detail}</div>}
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
