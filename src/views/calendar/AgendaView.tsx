import { useMemo, useState } from 'react';
import { EmptyState } from '../../components/EmptyState';
import { ItemRow } from '../../components/ItemRow';
import { addDays, dateOf, fmtDate, fmtMinutes, fmtTime } from '../../domain/dates';
import { cleanAll, instanceParts } from '../../domain/reqClean';
import { isNoise } from '../../domain/requirements';
import type { DateStr, Item, Requirement } from '../../domain/types';
import { useStore } from '../../storage/store';

const DAYS_AHEAD = 60;
const WEEK = 7;

/**
 * One day, four things, in this order: what to do, participation compacted, what is already done folded away, and
 * nothing else. Requirements live inside the assignment they belong to rather than in a list of prose underneath,
 * because a part about APA Quiz 1 is only useful next to APA Quiz 1.
 */
export function AgendaView({ from, items: raw, onOpen }: { from: DateStr; items: Item[]; onOpen: (i: Item) => void }) {
  const { data, schedule, today } = useStore();
  const tz = data.settings.timezone;
  const [wide, setWide] = useState(false);
  const [openDone, setOpenDone] = useState<Record<string, boolean>>({});
  const end = addDays(from, wide ? DAYS_AHEAD : WEEK - 1);

  // Duplicates collapsed, restatements dropped and class rules set aside before anything reaches the screen.
  const items = useMemo(() => cleanAll(raw).items, [raw]);
  const codeOf = useMemo(() => new Map(data.courses.map((c) => [c.id, c.code])), [data.courses]);

  const overdue = useMemo(
    () => (from === today ? items.filter((i) => i.status !== 'done' && schedule.byItem[i.id]?.risk === 'overdue').sort((a, b) => a.dueAt.localeCompare(b.dueAt)) : []),
    [items, schedule, from, today],
  );

  const days = useMemo(() => {
    const m = new Map<DateStr, Item[]>();
    for (const i of [...items].sort((a, b) => a.dueAt.localeCompare(b.dueAt))) {
      const d = dateOf(i.dueAt, tz);
      if (d < from || d > end) continue;
      m.set(d, [...(m.get(d) ?? []), i]);
    }
    return [...m.entries()].map(([day, all]) => {
      const done = all.filter((i) => i.status === 'done');
      const open = all.filter((i) => i.status !== 'done');
      // Attendance-only participation is compacted; participation that says what earns the points is real work.
      const quiet = open.filter((i) => isNoise(i));
      const work = open.filter((i) => !isNoise(i));
      // What this day's open work is estimated to take, not what the planner spread across it.
      const minutes = work.reduce((n, i) => n + (i.estimatedMinutes ?? 0), 0);
      return { day, work, quiet, done, minutes };
    });
  }, [items, tz, from, end, schedule]);

  return (
    <div className="agenda">
      {overdue.length > 0 && (
        <section className="day-group">
          <div className="day-group-head">
            <b style={{ color: 'var(--overdue)' }}>Overdue</b>
            <span>{overdue.length}</span>
          </div>
          <ul className="item-list">
            {overdue.map((i) => (
              <AgendaItem key={i.id} item={i} onOpen={onOpen} tz={tz} today={today} />
            ))}
          </ul>
        </section>
      )}
      {days.length === 0 && <EmptyState>Nothing due in the next {DAYS_AHEAD} days.</EmptyState>}
      {days.map(({ day, work, quiet, done, minutes }) => (
        <section key={day} className="day-group">
          <div className="day-group-head" data-today={day === today}>
            <b>{day === today ? 'Today' : fmtDate(day, 'long')}</b>
            <span>{work.length === 0 ? 'nothing to do' : `${work.length} to do`}</span>
            {minutes > 0 && <span className="muted">· about {fmtMinutes(minutes)}</span>}
          </div>
          {work.length > 0 && (
            <ul className="item-list" style={{ marginTop: 6 }}>
              {work.map((i) => (
                <AgendaItem key={i.id} item={i} onOpen={onOpen} tz={tz} today={today} />
              ))}
            </ul>
          )}
          {quiet.length > 0 && (
            <ul className="quiet-list">
              {quiet.map((i) => (
                <li key={i.id}>
                  <button type="button" className="quiet-row" onClick={() => onOpen(i)}>
                    <span className="quiet-code mono">{codeOf.get(i.courseId)}</span>
                    <span>participation</span>
                    <span className="mono muted">{i.points} pts</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {done.length > 0 && (
            <p className="done-fold">
              <button type="button" className="done-toggle" onClick={() => setOpenDone((o) => ({ ...o, [day]: !o[day] }))}>
                {done.length} done{openDone[day] ? ', hide' : ', show'}
              </button>
              {openDone[day] && (
                <ul className="item-list" style={{ marginTop: 6 }}>
                  {done.map((i) => (
                    <ItemRow key={i.id} item={i} onOpen={onOpen} />
                  ))}
                </ul>
              )}
            </p>
          )}
        </section>
      ))}
      <p className="hint" style={{ marginTop: 10 }}>
        <button type="button" className="diff-toggle" onClick={() => setWide((w) => !w)}>
          {wide ? 'Just the next seven days' : `Show the next ${DAYS_AHEAD} days`}
        </button>
      </p>
    </div>
  );
}

/** An assignment with its own parts folded in underneath it, tickable where they sit. */
function AgendaItem({ item, onOpen, tz, today }: { item: Item; onOpen: (i: Item) => void; tz: string; today: DateStr }) {
  const { actions } = useStore();
  const parts = instanceParts(item).filter((r) => !r.done);
  const ticked = (item.requirements ?? []).filter((r) => (r.scope ?? 'instance') === 'instance' && r.done).length;
  const toggle = (r: Requirement) =>
    actions.upsertItem({ ...item, requirements: (item.requirements ?? []).map((x) => (x.id === r.id ? { ...x, done: !x.done, doneAt: x.done ? null : new Date().toISOString() } : x)) });

  return (
    <li className="agenda-item">
      <ItemRow item={item} onOpen={onOpen} showStart />
      {parts.length > 0 && (
        <ul className="part-list" aria-label="Also required">
          {parts.map((r) => {
            const own = r.dueAt && dateOf(r.dueAt, tz) !== dateOf(item.dueAt, tz);
            const late = r.dueAt && dateOf(r.dueAt, tz) < today;
            return (
              <li key={r.id} data-late={!!late}>
                <label className="part-row">
                  <input type="checkbox" checked={false} onChange={() => toggle(r)} />
                  <span>{r.text}</span>
                </label>
                {own && (
                  <span className="mono muted part-when">
                    {late ? 'was due ' : 'due '}
                    {fmtDate(dateOf(r.dueAt!, tz), 'short')} {fmtTime(r.dueAt!, tz)}
                  </span>
                )}
              </li>
            );
          })}
          {ticked > 0 && <li className="part-done mono muted">{ticked} part{ticked === 1 ? '' : 's'} done</li>}
        </ul>
      )}
    </li>
  );
}
