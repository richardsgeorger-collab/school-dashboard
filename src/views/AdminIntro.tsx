import { useEffect, useState } from 'react';
import { supabase } from '../auth/client';
import { INTRO_FIRST_MONTH } from '../config/tiers';

interface Intro {
  used: number;
  used_plus?: number;
  used_max?: number;
  in_first_month: number;
  stayed: number;
  left: number;
}

/** The intro offer: the first month for less (Max $2.99 since 2026-10-09, Plus $0.99 since 2026-10-27). Who took it, on which plan, who stayed past month one. Real students only. */
export function AdminIntro() {
  const [r, setR] = useState<Intro | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    void supabase()
      ?.rpc('admin_intro_offer')
      .then(({ data, error }) => (error ? setErr(error.message) : setR(data as Intro)));
  }, []);
  if (err) return <section className="card settings-card"><p className="hint">{err}</p></section>;
  if (!r) return null;
  const decided = r.stayed + r.left;
  return (
    <section className="card settings-card admin-intro" aria-label="Intro offer">
      <h2 className="section-title">Intro offer: the first month (Plus ${INTRO_FIRST_MONTH.plus.toFixed(2)}, Max ${INTRO_FIRST_MONTH.max.toFixed(2)})</h2>
      <p className="ratings-head">
        <span className="growth-num">{r.used}</span>
        <span className="hint">
          took it{typeof r.used_plus === 'number' ? ` (Plus ${r.used_plus}, Max ${r.used_max ?? 0})` : ''}
          {r.in_first_month ? `, ${r.in_first_month} still in the first month` : ''}
        </span>
      </p>
      <p className="hint">
        {decided === 0 ? 'Nobody has reached month two yet.' : `After month one: ${r.stayed} kept paying, ${r.left} left (${Math.round((r.stayed / decided) * 100)}% stayed).`}
      </p>
    </section>
  );
}
