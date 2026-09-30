import { useEffect, useState } from 'react';
import { supabase } from '../auth/client';
import { PRICES } from '../config/tiers';

export interface Growth {
  today: string;
  total: number;
  new_today: number;
  new_week: number;
  active_today: number;
  active_week: number;
  plans: Partial<Record<Bucket, number>>;
  paying: { tier: string; interval: string }[];
  per_day: { day: string; n: number }[];
  tests: number;
}
export type Bucket = 'trial' | 'free' | 'plus_paid' | 'plus_referral' | 'max_paid' | 'max_friend';

/** Every student is in exactly one of these (plan_bucket in migration 0021), in this order. */
export const BUCKETS: [Bucket, string][] = [
  ['trial', 'Free trial (Max, 7 days)'],
  ['free', 'Free'],
  ['plus_paid', 'Plus (paid)'],
  ['plus_referral', 'Plus (referral credit)'],
  ['max_paid', 'Max (paid)'],
  ['max_friend', 'Max (friend link)'],
];

/** What the paying students pay a month, from the app's own prices (a semester plan counted per month). */
export function monthlyRevenue(paying: Growth['paying']): number {
  return paying.reduce((sum, p) => {
    const t = p.tier === 'pro' ? 'plus' : p.tier;
    const price = (PRICES as Record<string, Record<string, number | undefined>>)[t];
    if (!price) return sum;
    return sum + (p.interval === 'year' ? (price.year ?? price.month ?? 0) / 12 : p.interval === 'semester' ? (price.semester ?? 0) / 4 : price.month ?? 0);
  }, 0);
}

const money = (n: number) => `$${n.toFixed(2)}`;
const shortDay = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });

/**
 * Growth at a glance (George, 2026-09-30): real students only (test accounts are counted separately and shown greyed
 * in the list below), one definition for every number, days in Phoenix time.
 */
export function AdminGrowth({ tick }: { tick: number }) {
  const [g, setG] = useState<Growth | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    void supabase()
      ?.rpc('admin_growth')
      .then(({ data, error }) => (error ? setErr(error.message) : setG(data as Growth)));
  }, [tick]);
  if (err) return <section className="card settings-card admin-growth"><p className="hint">{err}</p></section>;
  if (!g) return <section className="card settings-card admin-growth" aria-busy="true"><p className="hint">Loading…</p></section>;
  const paying = g.paying.length;
  const max = Math.max(1, ...g.per_day.map((d) => d.n));
  return (
    <section className="card settings-card admin-growth" aria-label="Growth">
      <h2 className="section-title">Growth</h2>
      <div className="growth-tiles">
        <div className="growth-tile growth-main">
          <span className="growth-num">{g.total}</span>
          <span className="growth-label">real students</span>
          <span className="growth-delta">
            <b>+{g.new_today}</b> today · <b>+{g.new_week}</b> this week
          </span>
        </div>
        <div className="growth-tile">
          <span className="growth-num">{g.active_today}</span>
          <span className="growth-label">active today</span>
        </div>
        <div className="growth-tile">
          <span className="growth-num">{g.active_week}</span>
          <span className="growth-label">active this week</span>
        </div>
        <div className="growth-tile">
          <span className="growth-num">{paying}</span>
          <span className="growth-label">paying</span>
          <span className="growth-delta">
            <b>{money(monthlyRevenue(g.paying))}</b> a month
          </span>
        </div>
      </div>

      <h3 className="growth-sub">Plans</h3>
      <ul className="growth-plans">
        {BUCKETS.map(([k, label]) => (
          <li key={k} data-bucket={k}>
            <span className="growth-plan-n">{g.plans[k] ?? 0}</span>
            <span className="growth-plan-label">{label}</span>
          </li>
        ))}
      </ul>

      <h3 className="growth-sub">New students per day, last 30 days</h3>
      <div className="growth-chart" role="img" aria-label={`New students per day for the last 30 days: ${g.per_day.reduce((a, d) => a + d.n, 0)} in all`}>
        {g.per_day.map((d) => (
          <div key={d.day} className="growth-bar-slot" title={`${shortDay(d.day)}: ${d.n} new`}>
            <span className="growth-bar" data-zero={d.n === 0 || undefined} style={{ height: `${d.n === 0 ? 2 : Math.max(6, Math.round((d.n / max) * 100))}%` }} />
          </div>
        ))}
      </div>
      <div className="growth-axis">
        <span>{shortDay(g.per_day[0]?.day ?? g.today)}</span>
        <span>most in a day: {max === 1 && g.per_day.every((d) => d.n === 0) ? 0 : max}</span>
        <span>today</span>
      </div>
      <p className="hint">Real students only: {g.tests} test account{g.tests === 1 ? ' is' : 's are'} left out (yours, their +aliases, the reviewer, test scripts and scanners on .invalid addresses, and any you mark below). Each student counts in exactly one plan.</p>
    </section>
  );
}
