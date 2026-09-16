import { useEffect, useMemo, useState } from 'react';
import { dateOf, fmtDate, fmtTime } from '../domain/dates';
import { auditDates, auditLine, withFixedDates, type DateMismatch } from '../domain/syllabusAudit';
import type { Course } from '../domain/types';
import { useStore } from '../storage/store';
import { syllabiDb } from '../syllabus/db';

/**
 * The planner's dates held against the syllabus's own table. A sync once wrote a due date onto the wrong item; nothing
 * else in the app can tell a wrong date from a right one, and the syllabus can. Diff and approve, like every other
 * change: nothing is written until a button is pressed, and only the date moves.
 */
export function DateAudit({ course }: { course: Course }) {
  const { data, actions, today } = useStore();
  const tz = data.settings.timezone;
  const [text, setText] = useState<string | null | undefined>(undefined);
  const [skipped, setSkipped] = useState<Set<string>>(new Set());
  const [done, setDone] = useState<string | null>(null);
  const items = data.items;

  useEffect(() => {
    let live = true;
    syllabiDb
      .get(course.id)
      .then((d) => live && setText(d?.text ?? null))
      .catch(() => live && setText(null));
    return () => {
      live = false;
    };
  }, [course.id]);

  const audit = useMemo(() => (text === undefined ? null : auditDates(course, items, text, tz)), [course, items, text, tz]);
  if (!audit) return null;
  const open = audit.mismatches.filter((m) => !skipped.has(m.item.id));

  const fix = (list: DateMismatch[]) => {
    if (list.length === 0) return;
    const now = new Date().toISOString();
    const { items: next, touched } = withFixedDates(actions.snapshotItems(), list, now);
    if (!touched.length) return;
    actions.applyIngest(next, touched, `${course.code} dates from the syllabus`);
    setDone(`Put ${touched.length} date${touched.length === 1 ? '' : 's'} back to what the syllabus says. Re-run the AI pass so its start dates are built on them.`);
  };

  // Nothing to fix and nothing to warn about: this says nothing at all.
  if (audit.mismatches.length === 0 && !audit.note && !audit.partial && !done) return null;

  const when = (iso: string) => `${fmtDate(dateOf(iso, tz), 'short')} ${fmtTime(iso, tz)}`;
  return (
    <section className="card date-audit" data-state={open.length ? 'mismatch' : 'clean'} aria-label="Dates against the syllabus">
      <p className="date-audit-head">{done ?? auditLine(audit, course, today)}</p>
      {open.length > 0 && (
        <>
          <ul className="diff-list date-audit-list">
            {open.map((m) => (
              <li key={m.item.id}>
                <span>
                  <b>{m.item.label}</b> is <span className="mono was">{when(m.plannerAt)}</span> here; the syllabus says <span className="mono now">{when(m.syllabusAt)}</span>
                  <span className="hint">
                    Syllabus row: “{m.title}”{m.topic ? ` · ${m.topic}` : ''} · {m.points} pts
                  </span>
                </span>
                <span className="halo-need-actions">
                  <button type="button" className="btn small primary" onClick={() => fix([m])}>
                    Use the syllabus date
                  </button>
                  <button type="button" className="btn small" onClick={() => setSkipped((s) => new Set([...s, m.item.id]))}>
                    Leave it
                  </button>
                </span>
              </li>
            ))}
          </ul>
          {open.length > 1 && (
            <div className="settings-actions">
              <button type="button" className="btn primary" onClick={() => fix(open)}>
                Fix all {open.length}
              </button>
            </div>
          )}
        </>
      )}
      {audit.partial && <p className="hint">Only part of the syllabus is stored, so only part of the term could be checked. Drop the syllabus file into the class library again to store all of it.</p>}
      {audit.unmatched.length > 0 && open.length > 0 && <p className="hint">No syllabus row matched {audit.unmatched.length} item{audit.unmatched.length === 1 ? '' : 's'}, so {audit.unmatched.length === 1 ? 'its date was' : 'their dates were'} not checked: {audit.unmatched.slice(0, 6).join(', ')}{audit.unmatched.length > 6 ? ', and more' : ''}.</p>}
    </section>
  );
}
