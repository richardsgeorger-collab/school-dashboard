import { useEffect, useState } from 'react';
import { supabase } from '../auth/client';

interface Funnel {
  days: number;
  signed_up: number;
  from_referrals: number;
  from_friend_links: number;
  synced: number;
  notifications: number;
  checklist: number;
  day2: number;
  day4: number;
  day7: number;
  invited: number;
  trial_ended: number;
  chose_plan: number;
}

/**
 * George's funnel for new accounts (2026-09-29): how many of the students who signed up in the window went on to
 * each step of the welcome week. Test accounts (@example.invalid) are left out on the server.
 */
export function AdminFunnel() {
  const [days, setDays] = useState(30);
  const [f, setF] = useState<Funnel | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    void supabase()
      ?.rpc('admin_funnel', { p_days: days })
      .then(({ data, error }) => (error ? setErr(error.message) : setF(data as Funnel)));
  }, [days]);
  const rows: [string, number, number][] = f
    ? [
        ['Signed up', f.signed_up, f.signed_up],
        ['Synced Halo', f.synced, f.signed_up],
        ['Turned on notifications', f.notifications, f.signed_up],
        ['Finished the checklist', f.checklist, f.signed_up],
        ['Active on day 2', f.day2, f.signed_up],
        ['Active on day 4', f.day4, f.signed_up],
        ['Active on day 7', f.day7, f.signed_up],
        ['Invited a friend', f.invited, f.signed_up],
        ['Chose a plan at the end', f.chose_plan, f.trial_ended],
      ]
    : [];
  return (
    <section className="card settings-card admin-funnel" aria-label="New accounts">
      <h2 className="section-title">New accounts</h2>
      <div className="segmented" role="group" aria-label="Window">
        {[7, 30, 90].map((d) => (
          <button key={d} type="button" aria-pressed={days === d} onClick={() => setDays(d)}>
            {d} days
          </button>
        ))}
      </div>
      {err && <p className="hint">{err}</p>}
      {f && (
        <>
          <table className="funnel-table">
            <tbody>
              {rows.map(([label, n, of]) => (
                <tr key={label}>
                  <th scope="row">{label}</th>
                  <td className="mono">{n}</td>
                  <td className="funnel-bar-cell">
                    <span className="funnel-bar" style={{ width: `${of ? Math.round((n / of) * 100) : 0}%` }} />
                  </td>
                  <td className="mono muted">{of ? `${Math.round((n / of) * 100)}%` : '–'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="hint">
            {f.from_referrals} of {f.signed_up} came through a friend's invite link, {f.from_friend_links} through your friend links. "Chose a plan" is out of the {f.trial_ended} whose free week has ended.
          </p>
        </>
      )}
      <Winback days={days} />
    </section>
  );
}

interface WinbackKind {
  sent: number;
  opened: number;
  upgrade_taps: number;
  upgraded: number;
}
interface WinbackStats {
  peek_syncs: number;
  peek_students: number;
  by_kind: Record<'peek' | 'exam' | 'stale', WinbackKind>;
}

/** Win-back (2026-09-29): Free students after the Max week. Sends and opens per push, upgrades per way in. */
function Winback({ days }: { days: number }) {
  const [w, setW] = useState<WinbackStats | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    void supabase()
      ?.rpc('admin_winback', { p_days: days })
      .then(({ data, error }) => (error ? setErr(error.message) : setW(data as WinbackStats)));
  }, [days]);
  const rows: [string, WinbackKind][] = w
    ? [
        ['Peek sync', w.by_kind.peek],
        ['Exam-week offer', w.by_kind.exam],
        ['Out-of-date push', w.by_kind.stale],
      ]
    : [];
  return (
    <>
      <h3 className="section-title">Win-back</h3>
      {err && <p className="hint">{err}</p>}
      {w && (
        <>
          <p className="hint">
            {w.peek_syncs} peek syncs by {w.peek_students} Free students.
          </p>
          <table className="funnel-table winback-table">
            <thead>
              <tr>
                <th scope="col">Way in</th>
                <th scope="col">Pushes sent</th>
                <th scope="col">Opened</th>
                <th scope="col">Tapped upgrade</th>
                <th scope="col">Upgraded</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(([label, k]) => (
                <tr key={label}>
                  <th scope="row">{label}</th>
                  <td className="mono">{label === 'Peek sync' ? '–' : k.sent}</td>
                  <td className="mono">{label === 'Peek sync' ? '–' : k.opened}</td>
                  <td className="mono">{k.upgrade_taps}</td>
                  <td className="mono">{k.upgraded}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </>
  );
}
