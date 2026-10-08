import { useMemo, useState } from 'react';
import { CourseChip } from '../components/CourseChip';
import { dateOf, fmtDate, fmtTime } from '../domain/dates';
import { checklistFor, lateCount, participationThisWeek, tickLine, weekLine, type WeekEntry } from '../domain/participationWeek';
import type { Item } from '../domain/types';
import { useStore } from '../storage/store';
import { ReqLine } from './Requirements';

/** One participation item's checklist: tick each line; the last tick marks the item done. */
export function ParticipationChecklist({ item: passed }: { item: Item }) {
  const { data, actions, courseById } = useStore();
  const item = data.items.find((i) => i.id === passed.id) ?? passed;
  const course = courseById.get(item.courseId);
  const lines = checklistFor(item, course, new Date().toISOString());
  const tick = (id: string) => {
    const t = tickLine(item, lines, id, new Date().toISOString());
    actions.upsertItem(t.item);
    if (t.allDone && item.status !== 'done') actions.setStatus(item.id, 'done');
    if (!t.allDone && item.status === 'done') actions.setStatus(item.id, 'todo');
  };
  return (
    <div className="pw-list">
      {lines.length === 0 ? (
        <p className="hint">Nothing listed yet. This week's announcement usually says what counts.</p>
      ) : (
        <ul className="reqs-list">
          {lines.map((r) => (
            <li key={r.id} data-done={r.done}>
              <ReqLine req={r} check={{ checked: r.done, onChange: () => tick(r.id) }} />
            </li>
          ))}
        </ul>
      )}
      <button type="button" className="hero-inline" onClick={() => actions.setStatus(item.id, item.status === 'done' ? 'todo' : 'done')}>
        {item.status === 'done' ? 'Not done after all' : 'Mark done'}
      </button>
    </div>
  );
}

/** Now's last line: "Participation this week: 3 left", opening to each class's checklist. */
export function ParticipationWeek() {
  const { data, today } = useStore();
  const tz = data.settings.timezone;
  // The Saturday reminder opens Now with the list already open.
  const [open, setOpen] = useState(() => typeof window !== 'undefined' && /[?&]pw=1/.test(window.location.hash));
  const week = useMemo(() => participationThisWeek(data.items, data.courses, today, tz, new Date().toISOString()), [data.items, data.courses, today, tz]);
  const line = weekLine(week);
  if (!line) return null;
  const done = week.every((e) => e.left === 0);
  const late = lateCount(week);
  return (
    <section className="pw" data-done={done} aria-label="Participation this week">
      <button type="button" className="pw-head" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span>
          {line}
          {late > 0 && (
            <>
              {' · '}
              <span className="pw-late">{late} late</span>
            </>
          )}
        </span>
        <span className="pw-caret" aria-hidden>
          {open ? '▴' : '▾'}
        </span>
      </button>
      {open && (
        <div className="pw-body">
          {week.map((e) =>
            e.day ? (
              <ParticipationDay key={e.item.id} entry={e} />
            ) : (
            <div key={e.item.id} className="pw-class" data-done={e.left === 0}>
              <p className="pw-class-head">
                {e.course && <CourseChip course={e.course} />} <span>{e.item.label}</span>
                <span className="mono muted">{e.left === 0 ? 'done' : `${e.left} left`}</span>
              </p>
              <ParticipationChecklist item={e.item} />
            </div>
            ),
          )}
        </div>
      )}
    </section>
  );
}

/** A day's participation on the line: one tick, its due day, "late" in red when it was missed. */
function ParticipationDay({ entry }: { entry: WeekEntry }) {
  const { data, actions } = useStore();
  const tz = data.settings.timezone;
  const item = entry.item;
  const done = item.status === 'done';
  return (
    <label className="pw-class pw-day" data-done={done}>
      <input type="checkbox" checked={done} onChange={() => actions.setStatus(item.id, done ? 'todo' : 'done')} />
      {entry.course && <CourseChip course={entry.course} />} <span className="pw-day-label">{item.label}</span>
      {entry.late ? <span className="pw-late mono">late</span> : <span className="mono muted">{done ? 'done' : `${fmtDate(dateOf(item.dueAt, tz), 'short')} ${fmtTime(item.dueAt, tz)}`}</span>}
    </label>
  );
}
