import { useEffect, useState } from 'react';
import { supabase } from '../auth/client';
import { TRIAL } from '../config/tiers';

interface TrialRow {
  who: string;
  synced_at: string | null;
  used: number;
  calendar: number | null;
  ends_at: string;
  cap_at: string | null;
  state: string;
  last_day: string | null;
}

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/Phoenix' }) : '–');
const day = (d: string | null) => (d ? new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }) : '–');

/**
 * Free trials in days of use (George, 2026-10-22): each real student's days of use so far (of 7), calendar days since
 * the first sync (of 30), the last day they opened Halo+, and when it ends. Running ones, and ones that ended in the
 * last two weeks. Read from admin_trials (migration 0040).
 */
export function AdminTrials() {
  const [rows, setRows] = useState<TrialRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    void supabase()
      ?.rpc('admin_trials')
      .then(({ data, error }) => (error ? setErr(error.message) : setRows((data ?? []) as TrialRow[])));
  }, []);
  return (
    <section className="card settings-card admin-trials" aria-label="Free trials">
      <h2 className="section-title">Free trials</h2>
      <p className="hint">
        {TRIAL.days} days of use, free: a day counts when the student opens Halo+ (Phoenix days). It ends after the {TRIAL.days}th day of use or {TRIAL.capDays} days after the first sync, whichever comes first.
      </p>
      {err && <p className="hint">{err}</p>}
      {!rows && !err && <p className="hint">Loading…</p>}
      {rows && rows.length === 0 && <p className="hint">No trials running or ended in the last two weeks.</p>}
      {rows && rows.length > 0 && (
        <div className="table-scroll">
          <table className="signup-funnel-rows">
            <thead>
              <tr>
                <th scope="col">Student</th>
                <th scope="col">Days of use</th>
                <th scope="col">Calendar days</th>
                <th scope="col">Last opened</th>
                <th scope="col">Ends</th>
                <th scope="col">State</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.who + r.ends_at}>
                  <th scope="row">{r.who}</th>
                  <td>{r.synced_at ? `${r.used} of ${TRIAL.days}` : '–'}</td>
                  <td>{r.calendar !== null ? `${r.calendar} of ${TRIAL.capDays}` : '–'}</td>
                  <td>{day(r.last_day)}</td>
                  <td>{r.state === 'waiting for first sync' ? 'when it starts' : when(r.ends_at)}</td>
                  <td className="muted">{r.state}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
