import { useMemo, useState } from 'react';
import { EmptyState } from '../../components/EmptyState';
import { ItemRow } from '../../components/ItemRow';
import { addDays, dateOf, fmtDate, fmtMinutes, fmtTime } from '../../domain/dates';
import { unlocks } from '../../domain/gating';
import { cleanAll, foldReadings, instanceParts, referenceParts } from '../../domain/reqClean';
import { isNoise } from '../../domain/requirements';
import type { DateStr, Item, Requirement } from '../../domain/types';
import { useStore } from '../../storage/store';

const WEEKS_SHOWN = 14;
const LATER_DAYS = 60;

/**
 * Two weeks of days, one collapsed row per item, then "Later" as titles only. A row is the checkbox, the title,
 * the class dot, the due time, the points and "3 of 8" when it has parts; a tap opens the parts, the notes and what
 * it unlocks. Attendance-only participation is not on the agenda at all. Done rows fold away under their day.
 */
export function AgendaView({ from, items: raw, onOpen }: { from: DateStr; items: Item[]; onOpen: (i: Item) => void }) {
  const { data, schedule, today } = useStore();
  const tz = data.settings.timezone;
  const [openDone, setOpenDone] = useState<Record<string, boolean>>({});
  const [expanded, setExpanded] = useState<string | null>(null);
  const end = addDays(from, WEEKS_SHOWN - 1);
  const laterEnd = addDays(from, LATER_DAYS);

  // Duplicates collapsed, restatements dropped, class rules set aside, overlapping readings folded, before anything
  // reaches the screen.
  const items = useMemo(() => foldReadings(cleanAll(raw).items), [raw]);

  const overdue = useMemo(
    () => (from === today ? items.filter((i) => i.status !== 'done' && !isNoise(i) && schedule.byItem[i.id]?.risk === 'overdue').sort((a, b) => a.dueAt.localeCompare(b.dueAt)) : []),
    [items, schedule, from, today],
  );

  const { days, later } = useMemo(() => {
    const m = new Map<DateStr, Item[]>();
    const after: Item[] = [];
    for (const i of [...items].sort((a, b) => a.dueAt.localeCompare(b.dueAt))) {
      const d = dateOf(i.dueAt, tz);
      if (d < from || d > laterEnd) continue;
      if (d > end) {
        if (i.status !== 'done' && !isNoise(i)) after.push(i);
        continue;
      }
      m.set(d, [...(m.get(d) ?? []), i]);
    }
    const days = [...m.entries()].map(([day, all]) => {
      const done = all.filter((i) => i.status === 'done');
      const work = all.filter((i) => i.status !== 'done' && !isNoise(i));
      const minutes = work.reduce((n, i) => n + (i.estimatedMinutes ?? 0), 0);
      return { day, work, done, minutes };
    });
    return { days, later: after };
  }, [items, tz, from, end, laterEnd]);

  const toggle = (id: string) => setExpanded((e) => (e === id ? null : id));

  return (
    <div className="agenda">
      {overdue.length > 0 && (
        <section className="day-group">
          <div className="day-group-head" data-tone="late">
            <b>Late</b>
            <span>{overdue.length}</span>
          </div>
          <ul className="item-list">
            {overdue.map((i) => (
              <AgendaItem key={i.id} item={i} open={expanded === i.id} onToggle={() => toggle(i.id)} onOpen={onOpen} tz={tz} today={today} />
            ))}
          </ul>
        </section>
      )}
      {days.length === 0 && later.length === 0 && <EmptyState art="calendar">Nothing due in the next {LATER_DAYS} days.</EmptyState>}
      {days.map(({ day, work, done, minutes }) => (
        <section key={day} className="day-group">
          <div className="day-group-head" data-today={day === today}>
            <b>{day === today ? 'Today' : fmtDate(day, 'long')}</b>
            <span>{work.length === 0 ? (done.length ? 'all done' : 'nothing due') : `${work.length} due`}</span>
            {minutes > 0 && <span className="muted">about {fmtMinutes(minutes)}</span>}
          </div>
          {work.length > 0 && (
            <ul className="item-list">
              {work.map((i) => (
                <AgendaItem key={i.id} item={i} open={expanded === i.id} onToggle={() => toggle(i.id)} onOpen={onOpen} tz={tz} today={today} />
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
                    <ItemRow key={i.id} item={i} onOpen={onOpen} dateless compact />
                  ))}
                </ul>
              )}
            </p>
          )}
        </section>
      ))}
      {later.length > 0 && (
        <section className="day-group later">
          <div className="day-group-head">
            <b>Later</b>
            <span>{later.length}</span>
          </div>
          <ul className="later-list">
            {later.map((i) => (
              <li key={i.id}>
                <button type="button" className="later-row" onClick={() => onOpen(i)}>
                  <span className="dot" style={{ '--course': data.courses.find((c) => c.id === i.courseId)?.color } as React.CSSProperties} />
                  <span className="later-title">{i.label}</span>
                  <span className="later-when">{fmtDate(dateOf(i.dueAt, tz), 'short')}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

/** One collapsed row; open, it shows the parts to tick, the notes, and what it unlocks. */
function AgendaItem({ item, open, onToggle, onOpen, tz, today }: { item: Item; open: boolean; onToggle: () => void; onOpen: (i: Item) => void; tz: string; today: DateStr }) {
  const { actions, data, schedule } = useStore();
  const parts = instanceParts(item);
  const notes = referenceParts(item);
  const todo = parts.filter((r) => !r.done);
  const gated = unlocks(item, data.items);
  const tick = (r: Requirement) =>
    actions.upsertItem({ ...item, requirements: (item.requirements ?? []).map((x) => (x.id === r.id ? { ...x, done: !x.done, doneAt: x.done ? null : new Date().toISOString() } : x)) });
  const hasMore = parts.length > 0 || notes.length > 0 || gated.length > 0;
  const startBy = schedule.byItem[item.id]?.startBy;

  return (
    <li className="agenda-item" data-open={open}>
      <ItemRow item={item} onOpen={hasMore ? () => onToggle() : onOpen} dateless compact progress={parts.length > 0 ? { done: parts.length - todo.length, total: parts.length } : null} />
      {open && (
        <div className="agenda-detail">
          {todo.length > 0 && (
            <ul className="part-list" aria-label="Parts">
              {todo.map((r) => {
                const own = r.dueAt && dateOf(r.dueAt, tz) !== dateOf(item.dueAt, tz);
                const late = r.dueAt && dateOf(r.dueAt, tz) < today;
                return (
                  <li key={r.id} data-late={!!late}>
                    <label className="part-row">
                      <input type="checkbox" checked={false} onChange={() => tick(r)} />
                      <span>{r.text}</span>
                    </label>
                    {own && (
                      <span className="part-when">
                        {late ? 'was due ' : 'due '}
                        {fmtDate(dateOf(r.dueAt!, tz), 'short')} {fmtTime(r.dueAt!, tz)}
                      </span>
                    )}
                    {r.source.quote && (
                      <a className="part-source" href={r.source.kind === 'announcement' && r.source.id ? `#/inbox?a=${r.source.id}` : undefined} title={r.source.quote}>
                        source
                      </a>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          {notes.map((n) => (
            <p key={n.id} className="part-note" title={n.source.quote ?? undefined}>
              {n.text}
            </p>
          ))}
          {gated.length > 0 && <p className="part-note">Unlocks {gated.map((g) => g.label).join(', ')}.</p>}
          {startBy && startBy > today && <p className="part-note">Start by {fmtDate(startBy, 'short')}.</p>}
          <button type="button" className="agenda-open" onClick={() => onOpen(item)}>
            Open
          </button>
        </div>
      )}
    </li>
  );
}
