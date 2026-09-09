import { useMemo } from 'react';
import { courseColor } from '../data/courseDefaults';
import { addDays, fmtMinutes, weekStart } from '../domain/dates';
import { dayCapacity } from '../domain/schedule';
import type { DateStr } from '../domain/types';
import { useStore } from '../storage/store';
import { CourseChip } from './CourseChip';

/**
 * The week as a time budget: one column per day, planned minutes stacked by class,
 * a dashed capacity line, and anything past the line hatched.
 */
export function WeekLedger({ anchor }: { anchor?: DateStr }) {
  const { data, schedule, today, isDark } = useStore();
  const start = weekStart(anchor ?? today, data.settings.weekStartsOn);
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(start, i)), [start]);

  const perDay = useMemo(() => {
    const out: Record<DateStr, Record<string, number>> = {};
    for (const d of days) out[d] = {};
    for (const s of Object.values(schedule.byItem)) {
      const item = data.items.find((i) => i.id === s.itemId);
      if (!item) continue;
      for (const [d, min] of Object.entries(s.plannedByDay)) {
        if (out[d]) out[d][item.courseId] = (out[d][item.courseId] ?? 0) + min;
      }
    }
    return out;
  }, [days, schedule, data.items]);

  const capacity = (d: DateStr) => dayCapacity(data.settings, d);
  const totals = days.map((d) => Object.values(perDay[d]).reduce((a, b) => a + b, 0));
  const maxScale = Math.max(...days.map((d) => Math.max(capacity(d), totals[days.indexOf(d)])), 1);
  const weekPlanned = totals.reduce((a, b) => a + b, 0);
  const weekCap = days.reduce((a, d) => a + capacity(d), 0);
  const usedCourses = data.courses.filter((c) => days.some((d) => (perDay[d][c.id] ?? 0) > 0));

  return (
    <section className="card ledger" aria-label="Week time budget">
      <div className="ledger-head">
        <h2 className="section-title">Time budget</h2>
        <span className="ledger-total" data-over={weekPlanned > weekCap}>
          <b>{fmtMinutes(weekPlanned)}</b> planned / {fmtMinutes(weekCap)}
        </span>
      </div>
      <div className="ledger-cols">
        {days.map((d, idx) => {
          const cap = capacity(d);
          const capPct = (cap / maxScale) * 100;
          let running = 0;
          return (
            <div key={d} className="ledger-col" data-today={d === today}>
              <div className="ledger-bar" role="img" aria-label={`${d}: ${fmtMinutes(totals[idx])} planned of ${fmtMinutes(cap)}`}>
                <span className="ledger-cap" style={{ bottom: `${capPct}%` }} />
                {data.courses.map((c) => {
                  const min = perDay[d][c.id] ?? 0;
                  if (!min) return null;
                  const startAt = running;
                  running += min;
                  const over = startAt >= cap;
                  return (
                    <span
                      key={c.id}
                      className="ledger-seg"
                      data-over={over}
                      title={`${c.code} ${fmtMinutes(min)}`}
                      style={{ height: `calc(${(min / maxScale) * 100}% - 2px)`, '--course': courseColor(c.color, isDark) } as React.CSSProperties}
                    />
                  );
                })}
              </div>
              <div className="ledger-day">
                {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'][new Date(d + 'T12:00:00Z').getUTCDay()]}
                <b>{Number(d.slice(-2))}</b>
              </div>
              <div className="ledger-hours">{totals[idx] ? fmtMinutes(totals[idx]) : '·'}</div>
            </div>
          );
        })}
      </div>
      {usedCourses.length > 0 && (
        <div className="ledger-legend">
          {usedCourses.map((c) => (
            <CourseChip key={c.id} course={c} />
          ))}
        </div>
      )}
    </section>
  );
}
