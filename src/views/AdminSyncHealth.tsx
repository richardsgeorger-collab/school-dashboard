import { useEffect, useState } from 'react';
import { supabase } from '../auth/client';

interface Health {
  started: number;
  landed: number;
  recovered: number;
  kept: number;
  failed: number;
  stuck: number;
  running: number;
  skipped: number;
  users: number;
  setup: { started: number; landed: number };
  by_cause: { cause: string; n: number; devices: number }[];
  by_browser: { browser: string; started: number; landed: number }[];
}

/** Each cause in plain words, and what the extension now does about it (0.7.6). */
export const CAUSES: Record<string, string> = {
  stalled: 'Halo stopped answering (reloaded and retried once)',
  'tab-closed': 'Halo tab closed mid-sync (retried in a fresh tab)',
  'tab-asleep': 'Halo tab asleep, never answered (retried in a fresh tab)',
  'not-halo-page': 'Halo tab on another page (retried in a fresh tab)',
  'logged-out': 'Halo logged out (syncs again once logged in)',
  offline: 'No connection',
  'no-classes': 'Halo showed no classes',
  'no-key': "Read, but Halo+ hadn't given the extension the account yet (waiting in Halo+)",
  plan: 'Plan without auto-sync (schedule stopped)',
  foreign: 'Halo linked to another Halo+ account',
  refused: 'Halo+ refused the delivery',
  delivery: 'Halo+ did not take it',
  'not-landed': 'Read, but did not reach the account',
  interrupted: 'The browser stopped the extension mid-sync',
  stuck: 'Started and never ended (no word for 20 minutes)',
  other: 'Other',
  unknown: 'Unknown',
};

const pct = (n: number, of: number) => (of ? `${Math.round((n / of) * 1000) / 10}%` : '–');

/**
 * Sync success rate (George, 2026-10-21: "sync cannot fail even 10% of the time"). Every extension sync run from 0.7.6:
 * started against landed for the last 7 days, the ones rescued by reloading Halo, and every failed, kept or stuck run by
 * its cause. Real accounts only. Read from admin_sync_health (migration 0038).
 */
export function AdminSyncHealth() {
  const [h, setH] = useState<Health | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    void supabase()
      ?.rpc('admin_sync_health', { p_days: 7 })
      .then(({ data, error }) => (error ? setErr(error.message) : setH(data as Health)));
  }, []);
  return (
    <section className="card settings-card admin-sync-health" aria-label="Sync success rate">
      <h2 className="section-title">Sync success rate</h2>
      {err && <p className="hint">{err}</p>}
      {!h && !err && <p className="hint">Loading…</p>}
      {h && (
        <>
          <p className="sync-health-big">
            <b>{pct(h.landed, h.started)}</b> <span>landed</span>
          </p>
          <p className="hint">
            Last 7 days: {h.started} syncs started, {h.landed} landed{h.recovered ? `, ${h.recovered} of them only after Halo+ reloaded Halo and tried again` : ''}. {h.users} student{h.users === 1 ? '' : 's'}.
            {h.running ? ` ${h.running} running now.` : ''}
          </p>
          <p className="hint">
            First syncs during setup: {h.setup.landed} of {h.setup.started} landed ({pct(h.setup.landed, h.setup.started)}).
          </p>
          {h.by_cause.length > 0 ? (
            <table className="funnel-table sync-health-causes">
              <thead>
                <tr>
                  <th scope="col">Why a sync didn't land</th>
                  <th scope="col" className="num">Syncs</th>
                  <th scope="col" className="num">Computers</th>
                </tr>
              </thead>
              <tbody>
                {h.by_cause.map((c) => (
                  <tr key={c.cause}>
                    <th scope="row">{CAUSES[c.cause] ?? c.cause}</th>
                    <td className="num">{c.n}</td>
                    <td className="num">{c.devices}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="hint">No failed, kept or stuck syncs in the last 7 days.</p>
          )}
          {h.by_browser.length > 0 && (
            <p className="hint">
              {h.by_browser.map((b) => `${b.browser}: ${b.landed} of ${b.started}`).join(' · ')}
            </p>
          )}
          <p className="hint">Counted from extension 0.7.6 on; older versions report only their failures (Admin › Errors). Skipped syncs (no browser window open) are not counted.</p>
        </>
      )}
    </section>
  );
}
