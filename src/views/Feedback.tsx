import { dateOf, fmtDate } from '../domain/dates';
import type { Item } from '../domain/types';
import { useStore } from '../storage/store';

/**
 * What the instructor actually wrote, and which rubric level they picked. A score on its own says nothing about what
 * to do differently; this is the part worth reading twice.
 */
export function Feedback({ item }: { item: Item }) {
  const { data, actions } = useStore();
  const tz = data.settings.timezone;
  const fb = item.feedback;
  if (!fb) return null;
  const hasAnything = fb.comment || fb.criteria.length > 0 || fb.files.length > 0 || fb.post;
  if (!hasAnything) return null;
  const byId = new Map((item.rubric?.criteria ?? []).map((c) => [c.id, c]));
  const scored = fb.criteria
    .map((s) => {
      const c = byId.get(s.criteriaId);
      if (!c) return null;
      const level = c.levels.find((l) => l.cellId === s.cellId) ?? null;
      return { name: c.name, points: c.points, level, comment: s.comment };
    })
    .filter((x): x is NonNullable<typeof x> => !!x);
  const fresh = !fb.seenAt;
  const markSeen = () => actions.upsertItem({ ...item, feedback: { ...fb, seenAt: new Date().toISOString() } });

  return (
    <section className="feedback" data-fresh={fresh} aria-label="What the instructor said">
      <p className="hint">
        <b>What your instructor said</b>
        {fb.gradedAt ? <span className="mono muted"> · graded {fmtDate(dateOf(fb.gradedAt, tz), 'short')}</span> : null}
        {fresh && <span className="feedback-new">new</span>}
      </p>
      {fb.comment && <blockquote className="feedback-comment">{fb.comment}</blockquote>}
      {scored.length > 0 && (
        <ul className="feedback-criteria">
          {scored.map((s, i) => (
            <li key={i}>
              <span className="feedback-crit">
                {s.name}
                {s.level && (
                  <span className="mono muted">
                    {' '}
                    · {s.level.name ?? ''}
                    {s.level.points !== null ? ` ${s.level.points}${s.points !== null ? ` of ${s.points}` : ''}` : ''}
                  </span>
                )}
              </span>
              {s.level?.description && <span className="hint">{s.level.description}</span>}
              {s.comment && <span className="feedback-note">“{s.comment}”</span>}
            </li>
          ))}
        </ul>
      )}
      {fb.post && (
        <p className="hint">
          Halo has your post from {fmtDate(dateOf(fb.post.publishedAt, tz), 'short')}
          {fb.post.words ? `, ${fb.post.words} words` : ''}.
        </p>
      )}
      {fb.files.length > 0 && <p className="hint">Files they attached in Halo: {fb.files.map((f) => f.name).join(', ')}.</p>}
      {fresh && (
        <p className="hint">
          <button type="button" className="muted" style={{ textDecoration: 'underline' }} onClick={markSeen}>
            got it
          </button>
        </p>
      )}
    </section>
  );
}

/** Halo's own rubric, when the sync brought one. The graded truth, not an inference from the description. */
export function RubricBlock({ item }: { item: Item }) {
  if (!item.rubric?.criteria.length) return null;
  const total = item.rubric.criteria.reduce((n, c) => n + (c.points ?? 0), 0);
  return (
    <details className="rubric-block">
      <summary className="hint">
        <b>The rubric it is graded against</b> <span className="mono muted">· {item.rubric.criteria.length} criteria{total > 0 ? `, ${total} pts` : ''} · from Halo</span>
      </summary>
      <ul className="rubric-list">
        {item.rubric.criteria.map((c) => (
          <li key={c.id}>
            <span className="rubric-name">
              {c.name}
              {c.points !== null && <span className="mono muted"> · {c.points} pts</span>}
            </span>
            {c.description && <span className="hint">{c.description}</span>}
            {c.levels.length > 0 && (
              <span className="hint rubric-levels">
                {c.levels
                  .slice(0, 2)
                  .map((l) => `${l.name ?? ''}${l.points !== null ? ` (${l.points})` : ''}${l.description ? `: ${l.description}` : ''}`)
                  .join(' · ')}
              </span>
            )}
          </li>
        ))}
      </ul>
    </details>
  );
}
