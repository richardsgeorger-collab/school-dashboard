import { useMemo } from 'react';
import { EmptyState } from '../../components/EmptyState';
import { ItemRow } from '../../components/ItemRow';
import { addDays, dateOf, fmtDate, fmtMinutes } from '../../domain/dates';
import type { DateStr, Item } from '../../domain/types';
import { useStore } from '../../storage/store';

const DAYS_AHEAD = 60;

export function AgendaView({ from, items, onOpen }: { from: DateStr; items: Item[]; onOpen: (i: Item) => void }) {
  const { data, schedule, today } = useStore();
  const tz = data.settings.timezone;
  const end = addDays(from, DAYS_AHEAD);

  const overdue = useMemo(
    () => (from === today ? items.filter((i) => i.status !== 'done' && schedule.byItem[i.id]?.risk === 'overdue').sort((a, b) => a.dueAt.localeCompare(b.dueAt)) : []),
    [items, schedule, from, today],
  );

  const groups = useMemo(() => {
    const m = new Map<DateStr, Item[]>();
    for (const i of [...items].sort((a, b) => a.dueAt.localeCompare(b.dueAt))) {
      const d = dateOf(i.dueAt, tz);
      if (d < from || d > end) continue;
      m.set(d, [...(m.get(d) ?? []), i]);
    }
    return [...m.entries()];
  }, [items, tz, from, end]);

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
              <ItemRow key={i.id} item={i} onOpen={onOpen} />
            ))}
          </ul>
        </section>
      )}
      {groups.length === 0 && <EmptyState>Nothing due in the next {DAYS_AHEAD} days.</EmptyState>}
      {groups.map(([d, dayItems]) => (
        <section key={d} className="day-group">
          <div className="day-group-head" data-today={d === today}>
            <b>{d === today ? 'Today' : fmtDate(d, 'long')}</b>
            <span>{dayItems.length} due</span>
            {schedule.loadByDay[d] ? <span className="muted">· {fmtMinutes(schedule.loadByDay[d])} planned</span> : null}
          </div>
          <ul className="item-list" style={{ marginTop: 6 }}>
            {dayItems.map((i) => (
              <ItemRow key={i.id} item={i} onOpen={onOpen} showStart />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
