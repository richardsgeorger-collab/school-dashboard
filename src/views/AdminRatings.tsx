import { useEffect, useState } from 'react';
import { supabase } from '../auth/client';

interface Ratings {
  n: number;
  average: number | null;
  spread: Record<string, number>;
  comments: { rating: number; comment: string; email: string; at: string }[];
}

/** The end-of-free-week rating (2026-10-01): the average, the spread from 1 to 10, and what students wrote. Real students only. */
export function AdminRatings() {
  const [r, setR] = useState<Ratings | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    void supabase()
      ?.rpc('admin_trial_ratings')
      .then(({ data, error }) => (error ? setErr(error.message) : setR(data as Ratings)));
  }, []);
  if (err) return <section className="card settings-card"><p className="hint">{err}</p></section>;
  if (!r) return null;
  const max = Math.max(1, ...Object.values(r.spread));
  return (
    <section className="card settings-card admin-ratings" aria-label="Free week ratings">
      <h2 className="section-title">Free week rating</h2>
      {r.n === 0 ? (
        <p className="hint">
          <b>How much did Halo+ help this week?</b> Asked once when a free week ends. No answers yet.
        </p>
      ) : (
        <>
          <p className="ratings-head">
            <span className="growth-num">{r.average}</span>
            <span className="hint">average out of 10, from {r.n} student{r.n === 1 ? '' : 's'}</span>
          </p>
          <div className="ratings-spread" role="img" aria-label={`Ratings 1 to 10: ${Array.from({ length: 10 }, (_, i) => `${i + 1}: ${r.spread[i + 1] ?? 0}`).join(', ')}`}>
            {Array.from({ length: 10 }, (_, i) => i + 1).map((v) => (
              <div key={v} className="ratings-col" title={`${v}: ${r.spread[v] ?? 0}`}>
                <span className="ratings-bar" data-low={v <= 6 || undefined} style={{ height: `${Math.round(((r.spread[v] ?? 0) / max) * 100)}%` }} />
                <span className="ratings-label">{v}</span>
              </div>
            ))}
          </div>
          {r.comments.length > 0 && (
            <ul className="ratings-comments">
              {r.comments.map((c) => (
                <li key={`${c.email}${c.at}`}>
                  <b>{c.rating}/10</b> {c.comment} <span className="hint">· {c.email}</span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
