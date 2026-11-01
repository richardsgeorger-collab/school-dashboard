import { useEffect, useState } from 'react';
import { supabase } from '../auth/client';

export interface ExtUsers {
  installed_now: number;
  known: number;
  uninstalled: number;
  uninstalled_30: number;
  reasons: Record<string, number>;
  active_today: number;
  active_7: number;
  active_30: number;
  signed_in_7: number;
  signed_out_7: number;
  by_version: Record<string, number>;
  by_plan: Record<string, number>;
  daily: { day: string; n: number; signed_in: number }[];
  store_installs_30: number;
  welcome_30: number;
  signup_start_30: number;
  linked_30: number;
  synced_30: number;
}
const REASON: Record<string, string> = { 'didnt-work': 'didn’t work', 'not-needed': 'didn’t need it', 'too-much': 'too much on Halo', privacy: 'privacy', other: 'something else', 'no answer': 'no answer' };
const list = (o: Record<string, number>, label = (k: string) => k) =>
  Object.entries(o)
    .sort((a, b) => b[1] - a[1])
    .map(([k, n]) => `${label(k)} ${n}`)
    .join(' · ') || 'none yet';

/**
 * Extension users (Loop 304, George: "I can't tell how many people really use the extension"). From the extension's own
 * anonymous daily ping (since 0.12.16) and its install and uninstall events: installed now, active today, this week and
 * this month, signed in or not, by version and plan, and a 30-day chart. Test browsers, browsers linked to test or admin
 * accounts, and the browsers this page is opened in (the owner's) are left out. Read from admin_ext_users.
 */
interface Group {
  installs: number;
  since: string | null;
  active_7: number;
  week_eligible: number;
  week_later: number;
  accounts: number;
  first_sync: number;
  uninstalled: number;
}
const pct = (n: number, of: number) => (of ? `${Math.round((n / of) * 100)}%` : '–');

/**
 * No-account mode (Loop 305): the switch for new Web Store installs, and the two groups side by side so George can
 * see after two weeks which brings more weekly users and more accounts.
 */
function NoAccountMode() {
  const [on, setOn] = useState<boolean | null>(null);
  const [g, setG] = useState<Record<string, Group> | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const load = async () => {
    const c = supabase();
    if (!c) return;
    const [s, r] = await Promise.all([c.rpc('admin_setting', { p_key: 'no_account_new_installs' }), c.rpc('admin_ext_groups')]);
    if (s.error || r.error) return setErr((s.error ?? r.error)!.message);
    setOn(s.data === 'on');
    setG((r.data ?? {}) as Record<string, Group>);
  };
  useEffect(() => {
    void load();
  }, []);
  const flip = async (next: boolean) => {
    const { error } = (await supabase()?.rpc('admin_set_setting', { p_key: 'no_account_new_installs', p_value: next ? 'on' : '' })) ?? { error: null };
    if (error) setErr(error.message);
    else void load();
  };
  const col = (name: string, x: Group | undefined) => (
    <td>
      {x ? (
        <>
          <b>{x.installs}</b> installs
          <br />
          {x.active_7} active this week ({pct(x.active_7, x.installs)})
          <br />
          {x.week_later} still using a week later (of {x.week_eligible}, {pct(x.week_later, x.week_eligible)})
          <br />
          {x.accounts} accounts ({pct(x.accounts, x.installs)}) · {x.first_sync} first sync
          <br />
          {x.uninstalled} uninstalled
        </>
      ) : (
        <span className="hint">No {name} installs yet.</span>
      )}
    </td>
  );
  return (
    <>
      <h3 className="admin-sub">No-account mode (new Web Store installs)</h3>
      <label className="admin-line">
        <input type="checkbox" checked={!!on} disabled={on === null} onChange={(e) => void flip(e.target.checked)} /> On: half of new Web Store installs, at random, get no-account mode (Halo+ on Halo works at once; the account is for the app, the phone and Max); the other half the current way, so the two are compared over the same weeks. Existing users never change.
      </label>
      {err && <p className="hint">{err}</p>}
      {g && (
        <table className="funnel-table ext-groups">
          <thead>
            <tr>
              <th scope="col">No-account mode</th>
              <th scope="col">Current way</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              {col('no-account mode', g['no-account'])}
              {col('current-way', g.current)}
            </tr>
          </tbody>
        </table>
      )}
      <p className="hint">Each install keeps the group it got when it was installed. Weekly users come from 0.12.16's daily ping; accounts are installs that signed up.</p>
    </>
  );
}

export function AdminExtUsers() {
  const [u, setU] = useState<ExtUsers | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    const c = supabase();
    if (!c) return;
    void (async () => {
      // This browser is the owner's: out of the count (the extension leaves its random id on this site).
      let dev: string | null = null;
      try {
        dev = localStorage.getItem('school-dashboard:ext-device');
      } catch {
        /* storage off */
      }
      if (dev) await c.rpc('admin_exclude_device', { p_device: dev });
      const { data, error } = await c.rpc('admin_ext_users');
      if (error) setErr(error.message);
      else setU(data as ExtUsers);
    })();
  }, []);
  const max = u ? Math.max(1, ...u.daily.map((d) => d.n)) : 1;
  return (
    <section className="card settings-card admin-ext-users" aria-label="Extension users">
      <h2 className="section-title">Extension users</h2>
      {err && <p className="hint">{err}</p>}
      {!u && !err && <p className="hint">Loading…</p>}
      {u && (
        <>
          <div className="ext-users-nums">
            <div>
              <b>{u.installed_now}</b>
              <span>installed now</span>
            </div>
            <div>
              <b>{u.active_today}</b>
              <span>active today</span>
            </div>
            <div>
              <b>{u.active_7}</b>
              <span>this week</span>
            </div>
            <div>
              <b>{u.active_30}</b>
              <span>this month</span>
            </div>
          </div>
          <p className="admin-line">
            This week: signed in <b>{u.signed_in_7}</b> · no account <b>{u.signed_out_7}</b>
          </p>
          <p className="admin-line">By version (this week): {list(u.by_version)}</p>
          <p className="admin-line">By plan (this week): {list(u.by_plan)}</p>
          <div className="ext-users-chart" role="img" aria-label={`Browsers running the extension each day for 30 days, most ${max}`}>
            {u.daily.map((d) => (
              <span key={d.day} title={`${d.day}: ${d.n} (${d.signed_in} signed in)`} style={{ height: `${(d.n / max) * 100}%` }}>
                <i style={{ height: d.n ? `${(d.signed_in / d.n) * 100}%` : 0 }} />
              </span>
            ))}
          </div>
          <p className="hint">Each bar is browsers running the extension that day; the dark part is signed in. Counting starts with 0.12.16, so older versions show up as they update.</p>
          <h3 className="admin-sub">From a Web Store install to an account (30 days)</h3>
          <p className="admin-line">
            Installed <b>{u.store_installs_30}</b> → welcome tab opened <b>{u.welcome_30}</b> → sign-up started <b>{u.signup_start_30}</b> → account <b>{u.linked_30}</b> → first sync <b>{u.synced_30}</b>
          </p>
          <p className="admin-line">
            Uninstalled: <b>{u.uninstalled}</b> in all, {u.uninstalled_30} in 30 days · why: {list(u.reasons, (k) => REASON[k] ?? k)}
          </p>
          <p className="hint">Left out: test browsers, browsers of test and admin accounts, and every browser this Admin page has been opened in.</p>
          <NoAccountMode />
        </>
      )}
    </section>
  );
}
