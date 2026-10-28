import { useEffect, useState } from 'react';
import { supabase } from '../auth/client';

/**
 * What decides the plans (George, 2026-10-25, Loop 268): trials ending and where ended trials went; whether Free
 * students still open Halo+ a week later, with and without the extension; who upgrades after seeing a locked
 * announcement change; the Chrome Web Store funnel; and users per feature per week, for trial, paid and Free. Real
 * students only (migration 0043). Every number is a count of people, never one person.
 */

type Ending = { next: { day: string; n: number }[]; ended: Record<string, number> };
type Retention = Record<'extension' | 'no_extension', { total: number; opening: number } | undefined>;
type Locked = { saw: number; clicked: number; upgraded: number; upgraded_plus: number; upgraded_max: number };
type Store = { days: number; installs: number; installs_linked?: number; site_installs: number; signed_up: number; first_sync: number; week_eligible: number; week_later: number };
type Usage = { week: string; cells: Record<string, number> }[];

const FEATURES: [string, string][] = [
  ['now', 'Now'],
  ['classes', 'Classes'],
  ['calendar', 'Calendar'],
  ['study', 'Study'],
  ['ask', 'Ask'],
  ['help_kit', 'Help kit'],
  ['changes_viewed', 'Announcement changes viewed'],
  ['extension_panel', 'This week on Halo'],
  ['pill_clicks', 'Pill clicks'],
  ['gpa', 'GPA'],
  ['on_halo_search', 'On Halo: search'],
  ['on_halo_next', 'On Halo: Next on class cards'],
  ['on_halo_drafts', 'On Halo: drafts offered or restored'],
  ['on_halo_words', 'On Halo: word minimum'],
  ['on_halo_rubric', 'On Halo: rubric opened'],
  ['on_halo_calendar', 'On Halo: all classes calendar'],
  ['on_halo_submit', 'On Halo: submission check'],
  ['on_halo_feedback', 'On Halo: last feedback'],
  ['on_halo_participation', 'On Halo: participation'],
  ['on_halo_files', 'On Halo: files on the page'],
];
const GROUPS: [string, string][] = [
  ['trial', 'Trial'],
  ['paid', 'Paid'],
  ['free', 'Free'],
];
const BUCKETS: Record<string, string> = { max_paid: 'Max', plus_paid: 'Plus', free: 'Free', max_friend: 'Max (friend link)', plus_referral: 'Plus (invite)', trial: 'Trial' };
const day = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : '–');

function useRpc<T>(name: string, args?: Record<string, unknown>): { data: T | null; err: string | null } {
  const [data, setData] = useState<T | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    void supabase()
      ?.rpc(name, args)
      .then(({ data: d, error }) => (error ? setErr(error.message) : setData(d as T)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name]);
  return { data, err };
}

export function AdminPlans() {
  const ending = useRpc<Ending>('admin_trials_ending');
  const retention = useRpc<Retention>('admin_free_retention');
  const locked = useRpc<Locked>('admin_locked_changes');
  const store = useRpc<Store>('admin_store_funnel', { p_days: 30 });
  const usage = useRpc<Usage>('admin_feature_usage', { p_weeks: 4 });
  const ext = retention.data?.extension;
  const noExt = retention.data?.no_extension;
  return (
    <section className="card settings-card admin-plans" aria-label="Plans and retention">
      <h2 className="section-title">Plans and retention</h2>
      <p className="hint">Real students only. Free keeps syncing Halo since Loop 268; these say whether that keeps people, and what is worth paying for.</p>

      <h3 className="admin-sub">Trials ending</h3>
      {ending.err && <p className="hint">{ending.err}</p>}
      {ending.data && (
        <>
          <p className="admin-line">
            Next 7 days: <b>{ending.data.next.reduce((n, d) => n + d.n, 0)}</b>
            {ending.data.next.length > 0 && ` (${ending.data.next.map((d) => `${day(d.day)} ${d.n}`).join(' · ')})`}
          </p>
          <p className="admin-line">
            Ended in the last 30 days, now on:{' '}
            {Object.keys(ending.data.ended).length === 0
              ? 'none yet'
              : Object.entries(ending.data.ended)
                  .map(([b, n]) => `${BUCKETS[b] ?? b} ${n}`)
                  .join(' · ')}
          </p>
        </>
      )}

      <h3 className="admin-sub">Free, still opening a week later</h3>
      {retention.err && <p className="hint">{retention.err}</p>}
      {retention.data && (
        <p className="admin-line">
          With the extension: <b>{ext ? `${ext.opening} of ${ext.total}` : '0 of 0'}</b> ({pct(ext?.opening ?? 0, ext?.total ?? 0)}) · Without: <b>{noExt ? `${noExt.opening} of ${noExt.total}` : '0 of 0'}</b> ({pct(noExt?.opening ?? 0, noExt?.total ?? 0)})
          <span className="hint"> Free accounts whose trial ended 7 to 60 days ago, opened Halo+ or used it on Halo 7+ days after.</span>
        </p>
      )}

      <h3 className="admin-sub">Locked announcement changes</h3>
      {locked.err && <p className="hint">{locked.err}</p>}
      {locked.data && (
        <p className="admin-line">
          Saw one: <b>{locked.data.saw}</b> · pressed "See it with Plus": <b>{locked.data.clicked}</b> · upgraded after: <b>{locked.data.upgraded}</b> (Plus {locked.data.upgraded_plus}, Max {locked.data.upgraded_max}, {pct(locked.data.upgraded, locked.data.saw)})
        </p>
      )}

      <h3 className="admin-sub">Chrome Web Store installs (30 days)</h3>
      {store.err && <p className="hint">{store.err}</p>}
      {store.data && (
        <p className="admin-line">
          Installed: <b>{store.data.installs}</b>{typeof store.data.installs_linked === 'number' ? ` (${store.data.installs_linked} linked to an account)` : ''} → signed up: <b>{store.data.signed_up}</b> → first sync: <b>{store.data.first_sync}</b> → still using a week later: <b>{store.data.week_later}</b> of {store.data.week_eligible} old enough
          <span className="hint"> (installs from Halo+'s own setup: {store.data.site_installs})</span>
        </p>
      )}

      <h3 className="admin-sub">Users per feature, by week</h3>
      {usage.err && <p className="hint">{usage.err}</p>}
      {usage.data && usage.data.length === 0 && <p className="hint">No use counted yet.</p>}
      {usage.data && usage.data.length > 0 && (
        <div className="table-scroll">
          <table className="signup-funnel-rows admin-usage">
            <thead>
              <tr>
                <th scope="col">Week of</th>
                <th scope="col">Feature</th>
                {GROUPS.map(([, label]) => (
                  <th key={label} scope="col">
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {usage.data.flatMap((w) =>
                FEATURES.map(([key, label], i) => (
                  <tr key={`${w.week}-${key}`}>
                    {i === 0 && (
                      <th scope="rowgroup" rowSpan={FEATURES.length}>
                        {day(w.week)}
                      </th>
                    )}
                    <td>{label}</td>
                    {GROUPS.map(([g]) => (
                      <td key={g}>{w.cells[`${key}:${g}`] ?? 0}</td>
                    ))}
                  </tr>
                )),
              )}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
