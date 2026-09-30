import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../auth/client';
import { BUCKETS, type Bucket } from './AdminGrowth';

interface Account {
  id: string;
  email: string;
  created_at: string;
  source: 'referral' | 'friend link' | 'direct';
  plan: Bucket;
  synced: boolean;
  classes: number;
  last_active: string | null;
  test: boolean;
  test_by_rule: boolean;
  test_override: boolean | null;
}

const PLAN_NAME = Object.fromEntries(BUCKETS) as Record<Bucket, string>;

/** "2h ago", "3d ago", "just now". */
export function ago(iso: string | null, now = Date.now()): string {
  if (!iso) return 'never';
  const m = Math.max(0, Math.round((now - Date.parse(iso)) / 60_000));
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  return d < 60 ? `${d}d ago` : new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/**
 * Every account, newest first (George, 2026-09-30). Test accounts stay in the list, greyed, and count nowhere; the Test
 * box marks or unmarks one by hand (the rule marks George's addresses, their +aliases and test-script accounts).
 */
export function AdminAccounts({ onChange }: { onChange: () => void }) {
  const [rows, setRows] = useState<Account[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [plan, setPlan] = useState<'all' | Bucket>('all');
  const [kind, setKind] = useState<'real' | 'test' | 'all'>('all');
  const [busy, setBusy] = useState<string | null>(null);
  const load = () =>
    supabase()
      ?.rpc('admin_accounts')
      .then(({ data, error }) => (error ? setErr(error.message) : setRows((data as Account[]) ?? [])));
  useEffect(() => {
    void load();
  }, []);
  const shown = useMemo(
    () =>
      (rows ?? []).filter(
        (r) => (!q.trim() || r.email.toLowerCase().includes(q.trim().toLowerCase())) && (plan === 'all' || r.plan === plan) && (kind === 'all' || (kind === 'test' ? r.test : !r.test)),
      ),
    [rows, q, plan, kind],
  );
  const toggle = async (r: Account) => {
    setBusy(r.id);
    await supabase()?.rpc('admin_set_test', { uid: r.id, test: !r.test });
    await load();
    setBusy(null);
    onChange();
  };
  const real = (rows ?? []).filter((r) => !r.test).length;
  return (
    <section className="card settings-card admin-accounts" aria-label="Accounts">
      <h2 className="section-title">Accounts</h2>
      <div className="acct-filters">
        <input className="field-input" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by email" aria-label="Search by email" />
        <select className="field-input" value={plan} onChange={(e) => setPlan(e.target.value as 'all' | Bucket)} aria-label="Plan">
          <option value="all">Every plan</option>
          {BUCKETS.map(([k, label]) => (
            <option key={k} value={k}>
              {label}
            </option>
          ))}
        </select>
        <select className="field-input" value={kind} onChange={(e) => setKind(e.target.value as 'real' | 'test' | 'all')} aria-label="Real or test">
          <option value="all">Real and test</option>
          <option value="real">Real students</option>
          <option value="test">Test accounts</option>
        </select>
      </div>
      {err && <p className="hint">{err}</p>}
      {rows === null ? (
        <p className="hint">Loading…</p>
      ) : (
        <>
          <p className="hint">
            {shown.length} shown · {real} real, {rows.length - real} test
          </p>
          <div className="acct-scroll">
            <table className="acct-table">
              <thead>
                <tr>
                  <th scope="col">Email</th>
                  <th scope="col">Signed up</th>
                  <th scope="col">Found us</th>
                  <th scope="col">Plan</th>
                  <th scope="col">Synced</th>
                  <th scope="col">Classes</th>
                  <th scope="col">Last active</th>
                  <th scope="col">Test</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((r) => (
                  <tr key={r.id} data-test={r.test || undefined}>
                    <td className="acct-email" title={r.email}>
                      {r.email}
                    </td>
                    <td title={new Date(r.created_at).toLocaleString()}>{ago(r.created_at)}</td>
                    <td>{r.source}</td>
                    <td>{PLAN_NAME[r.plan] ?? r.plan}</td>
                    <td>{r.synced ? 'yes' : 'no'}</td>
                    <td>{r.classes}</td>
                    <td>{ago(r.last_active)}</td>
                    <td>
                      <label className="acct-test">
                        <input type="checkbox" checked={r.test} disabled={busy === r.id} onChange={() => void toggle(r)} aria-label={`Test account: ${r.email}`} />
                        <span className="hint">{r.test_override === null && r.test_by_rule ? 'auto' : r.test_override !== null ? 'set' : ''}</span>
                      </label>
                    </td>
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
