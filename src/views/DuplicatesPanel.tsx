import { useMemo } from 'react';
import { CourseChip } from '../components/CourseChip';
import { dateOf, fmtDate } from '../domain/dates';
import { findDuplicates, merged } from '../domain/duplicates';
import { useStore } from '../storage/store';

/** Look-alikes from three syncs, offered as merges. Nothing merges on its own. */
export function DuplicatesPanel() {
  const { data, actions, courseById } = useStore();
  const tz = data.settings.timezone;
  const pairs = useMemo(() => findDuplicates(data.items, tz), [data.items, tz]);
  if (pairs.length === 0) return null;
  return (
    <section className="card settings-card" aria-label="Possible duplicates">
      <h2 className="section-title">
        Possible duplicates <span className="count">{pairs.length}</span>
      </h2>
      <p className="hint">The calendar export, the bookmark, and Check Halo can each add the same thing. Merge keeps the linked or older record and carries over notes, progress, and scores.</p>
      <ul className="dup-list">
        {pairs.map((p) => (
          <li key={`${p.keep.id}:${p.drop.id}`}>
            <div className="dup-pair">
              <CourseChip course={courseById.get(p.keep.courseId)} />
              <span>
                <b>{p.keep.title}</b> <span className="muted mono">{fmtDate(dateOf(p.keep.dueAt, tz), 'short')}</span>
              </span>
              <span className="muted">and</span>
              <span>
                {p.drop.title} <span className="muted mono">{fmtDate(dateOf(p.drop.dueAt, tz), 'short')}</span>
              </span>
            </div>
            <p className="hint">{p.reason}</p>
            <div className="settings-actions">
              <button
                type="button"
                className="btn small primary"
                onClick={() => {
                  actions.upsertItem(merged(p));
                  actions.deleteItem(p.drop.id);
                }}
              >
                Merge into {p.keep.label}
              </button>
              <button type="button" className="btn small" onClick={() => actions.upsertItem({ ...p.drop, notes: `${p.drop.notes ? `${p.drop.notes}\n` : ''}Not a duplicate of ${p.keep.title}.` })}>
                Keep both
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
