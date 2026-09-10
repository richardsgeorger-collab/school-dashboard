import { useMemo, useState } from 'react';
import { EmptyState } from '../../components/EmptyState';
import { ItemChip } from '../../components/ItemChip';
import { addDays, dateOf, fmtDate, fmtMinutes, fmtTime } from '../../domain/dates';
import { dayCapacity } from '../../domain/schedule';
import type { DateStr, Item } from '../../domain/types';
import { useStore } from '../../storage/store';

const SHOW_NAMES_UP_TO = 2;

function LoadBar({ planned, capacity }: { planned: number; capacity: number }) {
  const ratio = capacity ? planned / capacity : 0;
  const status = planned === 0 ? 'none' : ratio <= 0.8 ? 'ok' : ratio <= 1 ? 'warn' : 'over';
  return (
    <span className="week-load" data-status={status} title={`${fmtMinutes(planned)} planned of ${fmtMinutes(capacity)}`} aria-label={`${fmtMinutes(planned)} planned of ${fmtMinutes(capacity)}`}>
      <span style={{ width: `${Math.min(100, ratio * 100)}%` }} />
    </span>
  );
}

function DayRow({ day, items, onOpen }: { day: DateStr; items: Item[]; onOpen: (i: Item) => void }) {
  const { data, schedule, today, nudges } = useStore();
  const tz = data.settings.timezone;
  const [expanded, setExpanded] = useState(false);
  const open = items.filter((i) => i.status !== 'done');
  const planned = schedule.loadByDay[day] ?? 0;
  const capacity = dayCapacity(data.settings, day);
  const dayNudges = nudges.filter((nd) => nd.day === day);
  const showAll = open.length <= SHOW_NAMES_UP_TO || expanded;

  return (
    <div className="week-row" data-today={day === today} data-past={day < today}>
      <div className="week-row-date">
        <b>{day === today ? 'Today' : fmtDate(day, 'long').split(',')[0]}</b>
        <span className="mono muted">{fmtDate(day, 'short')}</span>
        <LoadBar planned={planned} capacity={capacity} />
      </div>
      <div className="week-row-body">
        {open.length === 0 && dayNudges.length === 0 && <span className="muted">—</span>}
        {dayNudges.map((nd) => (
          <span key={nd.key} className="week-nudge">
            {nd.label} · {fmtMinutes(nd.minutes)}
          </span>
        ))}
        {showAll ? (
          open.map((i) => {
            const time = fmtTime(i.dueAt, tz);
            return (
              <span key={i.id} className="week-item">
                <ItemChip item={i} onOpen={onOpen} />
                {time !== '11:59 PM' && <span className="mono muted week-time">{time}</span>}
              </span>
            );
          })
        ) : (
          <button type="button" className="week-count" onClick={() => setExpanded(true)} aria-expanded={false}>
            {open.length} due{planned ? ` · ${fmtMinutes(planned)} planned` : ''}
          </button>
        )}
        {expanded && open.length > SHOW_NAMES_UP_TO && (
          <button type="button" className="muted week-collapse" onClick={() => setExpanded(false)}>
            collapse
          </button>
        )}
      </div>
    </div>
  );
}

export function WeekView({ start, items, onOpen }: { start: DateStr; items: Item[]; onOpen: (i: Item) => void }) {
  const { data } = useStore();
  const tz = data.settings.timezone;
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(start, i)), [start]);
  const byDay = useMemo(() => {
    const m = new Map<DateStr, Item[]>();
    for (const i of [...items].sort((a, b) => a.dueAt.localeCompare(b.dueAt))) {
      const d = dateOf(i.dueAt, tz);
      m.set(d, [...(m.get(d) ?? []), i]);
    }
    return m;
  }, [items, tz]);

  if (items.length === 0) return <EmptyState>No items match the filter.</EmptyState>;
  return (
    <div className="week-rows">
      {days.map((d) => (
        <DayRow key={d} day={d} items={byDay.get(d) ?? []} onOpen={onOpen} />
      ))}
    </div>
  );
}
