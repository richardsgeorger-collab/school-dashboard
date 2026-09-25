import { useEffect, useState } from 'react';
import { useAccount } from '../auth/AccountContext';
import { supabase } from '../auth/client';
import { EmptyState } from '../components/EmptyState';
import { TIER_NAMES, TIERS, type Tier } from '../config/tiers';

interface Stats {
  users: number;
  by_tier: Record<string, number> | null;
  on_trial: number;
  paying: number;
  signups_7d: number;
  ai_cost_month: number;
  ai_calls_month: number;
  funnel: { step: string; event: string; n: number }[];
  syncs_7d: Record<string, number>;
  phone_only_syncers: number;
  syncing_users_30d: number;
  feedback_open: { id: string; kind: string; screen: string | null; text: string; screenshot_path: string | null; created_at: string }[];
}

const STEPS = ['welcome', 'account', 'halo', 'preferences'];

/** For admins only: who is here, what they pay, what AI costs, where new students drop off, how phone-only users sync. */
export function Admin() {
  const { auth, profile } = useAccount();
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const c = supabase();
    if (!c || !profile?.isAdmin) return;
    void c.rpc('admin_stats').then(({ data, error: e }) => {
      if (e) setError(e.message);
      else setStats(data as Stats);
    });
  }, [profile?.isAdmin, tick]);

  if (!auth.configured || !auth.session) return <EmptyState>Sign in first.</EmptyState>;
  if (!profile?.isAdmin) return <EmptyState>This screen is for the people who run the app.</EmptyState>;
  if (error) return <EmptyState>{error}</EmptyState>;
  if (!stats) return <EmptyState>Loading…</EmptyState>;

  const count = (step: string, event: string) => stats.funnel.find((f) => f.step === step && f.event === event)?.n ?? 0;
  const resolve = async (id: string) => {
    await supabase()?.rpc('admin_resolve_feedback', { p_id: id });
    setTick((k) => k + 1);
  };
  const screenshot = async (path: string) => {
    const { data } = (await supabase()?.storage.from('feedback').createSignedUrl(path, 600)) ?? { data: null };
    if (data?.signedUrl) window.open(data.signedUrl, '_blank', 'noopener');
  };

  return (
    <>
      <h1 className="page-title">Admin</h1>
      <div className="settings-grid">
        <section className="card settings-card">
          <h2 className="section-title">People</h2>
          <dl className="grade-stats mono">
            <div>
              <dt>Accounts</dt>
              <dd>{stats.users}</dd>
            </div>
            <div>
              <dt>New this week</dt>
              <dd>{stats.signups_7d}</dd>
            </div>
            <div>
              <dt>On trial</dt>
              <dd>{stats.on_trial}</dd>
            </div>
            <div>
              <dt>Paying</dt>
              <dd>{stats.paying}</dd>
            </div>
            {TIERS.map((t: Tier) => (
              <div key={t}>
                <dt>{TIER_NAMES[t]}</dt>
                <dd>{stats.by_tier?.[t] ?? 0}</dd>
              </div>
            ))}
          </dl>
        </section>
        <section className="card settings-card">
          <h2 className="section-title">AI this month</h2>
          <p className="mono">
            ${Number(stats.ai_cost_month).toFixed(2)} across {stats.ai_calls_month} calls
            {stats.paying > 0 ? ` · $${(Number(stats.ai_cost_month) / stats.paying).toFixed(2)} per paying account` : ''}
          </p>
        </section>
        <section className="card settings-card">
          <h2 className="section-title">Onboarding funnel</h2>
          <table className="sync-map">
            <thead>
              <tr>
                <th>Step</th>
                <th>Entered</th>
                <th>Completed</th>
                <th>Skipped</th>
              </tr>
            </thead>
            <tbody>
              {STEPS.map((s) => (
                <tr key={s}>
                  <td>{s}</td>
                  <td className="mono">{count(s, 'enter')}</td>
                  <td className="mono">{count(s, 'complete')}</td>
                  <td className="mono">{count(s, 'skip')}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="hint">Distinct accounts per step. A big gap between Entered and Completed on Halo is the thing to fix first.</p>
        </section>
        <section className="card settings-card">
          <h2 className="section-title">Halo syncs</h2>
          <p className="mono">
            Last 7 days: {Object.entries(stats.syncs_7d ?? {}).map(([k, v]) => `${v} on ${k}`).join(' · ') || 'none'}
          </p>
          <p className="mono">
            Last 30 days: {stats.syncing_users_30d} accounts synced; {stats.phone_only_syncers} of them only ever from a phone.
          </p>
          <p className="hint">Phone-only students run the bookmark by hand every time. If that number grows, the phone flow needs to get shorter.</p>
        </section>
        <section className="card settings-card">
          <h2 className="section-title">Open feedback</h2>
          {stats.feedback_open.length === 0 ? (
            <p className="hint">Nothing open.</p>
          ) : (
            <ul className="item-list">
              {stats.feedback_open.map((f) => (
                <li key={f.id} className="feedback-row">
                  <p>
                    <span className="mono muted">
                      {f.kind} · {f.screen ?? '?'} · {f.created_at.slice(0, 10)}
                    </span>
                    <br />
                    {f.text}
                  </p>
                  <div className="settings-actions">
                    {f.screenshot_path && (
                      <button type="button" className="btn small" onClick={() => void screenshot(f.screenshot_path!)}>
                        Screenshot
                      </button>
                    )}
                    <button type="button" className="btn small" onClick={() => void resolve(f.id)}>
                      Resolved
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
