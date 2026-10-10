import { useEffect, useState } from 'react';
import { supabase } from '../auth/client';

interface Intro {
  used: number;
  in_first_month: number;
  stayed: number;
  left: number;
}

/** The intro offer (2026-10-09): Max at $2.99 for the first month. Who took it, who stayed past month one. Real students only. */
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
      <h2 className="section-title">Intro offer: Max, $2.99 the first month</h2>
      <p className="ratings-head">
        <span className="growth-num">{r.used}</span>
        <span className="hint">took it{r.in_first_month ? `, ${r.in_first_month} still in the first month` : ''}</span>
      </p>
      <p className="hint">
        {decided === 0 ? 'Nobody has reached month two yet.' : `After month one: ${r.stayed} stayed on Max, ${r.left} left (${Math.round((r.stayed / decided) * 100)}% stayed).`}
      </p>
    </section>
  );
}
