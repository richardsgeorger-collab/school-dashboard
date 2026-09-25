import { useMemo } from 'react';
import { addDays, dateOf, fmtDate } from '../../domain/dates';
import { isNoise } from '../../domain/requirements';
import type { DateStr, Item } from '../../domain/types';
import { useStore } from '../../storage/store';

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/**
 * Seven days across the top of the agenda: the day, how many things are due, whether it is heavy. Tap a day and the
 * agenda starts there. This is the whole of what the Week view used to do that anyone looked at.
 */
export function WeekStrip({ start, selected, items, onPick }: { start: DateStr; selected: DateStr; items: Item[]; onPick: (d: DateStr) => void }) {
  const { data, schedule, today } = useStore();
  const tz = data.settings.timezone;
  const days = useMemo(() => {
    const out: { day: DateStr; open: number; minutes: number; heavy: boolean }[] = [];
    for (let k = 0; k < 7; k++) {
      const day = addDays(start, k);
      const due = items.filter((i) => i.status !== 'done' && !isNoise(i) && dateOf(i.dueAt, tz) === day);
      const minutes = due.reduce((n, i) => n + (i.estimatedMinutes ?? 0), 0);
      const load = schedule.loadByDay[day] ?? 0;
      const capacity = schedule.capacityByDay[day] ?? 0;
      out.push({ day, open: due.length, minutes, heavy: capacity > 0 && load > capacity });
    }
    return out;
  }, [start, items, tz, schedule]);
  return (
    <div className="week-strip" role="tablist" aria-label="This week">
      {days.map((d) => {
        const dow = new Date(`${d.day}T12:00:00Z`).getUTCDay();
        return (
          <button
            key={d.day}
            type="button"
            role="tab"
            className="week-strip-day"
            aria-selected={d.day === selected}
            data-today={d.day === today}
            data-heavy={d.heavy}
            data-past={d.day < today}
            onClick={() => onPick(d.day)}
            title={`${fmtDate(d.day, 'long')}: ${d.open === 0 ? 'nothing due' : `${d.open} due`}`}
          >
            <span className="week-strip-dow">{DOW[dow]}</span>
            <span className="week-strip-num">{Number(d.day.slice(8, 10))}</span>
            <span className="week-strip-count" aria-hidden>
              {d.open > 0 ? d.open : ''}
            </span>
          </button>
        );
      })}
    </div>
  );
}
