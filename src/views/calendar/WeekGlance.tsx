import { addDays, fmtMinutes, dateOf } from '../../domain/dates';
import { dayCapacity } from '../../domain/schedule';
import { isNoise } from '../../domain/requirements';
import type { DateStr, Item } from '../../domain/types';
import { useStore } from '../../storage/store';

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** The week beside the agenda: each day, how much is planned against its capacity, and how many things land. */
export function WeekGlance({ start, items }: { start: DateStr; items: Item[] }) {
  const { data, schedule, today } = useStore();
  const tz = data.settings.timezone;
  const days = Array.from({ length: 7 }, (_, k) => addDays(start, k));
  // Work already past its date gets planned onto whatever day is left, usually today. That is catch-up, not this
  // week's plan; counted together they said "23h planned" of a 5h Saturday. The Load screen makes the same split.
  const late = items.filter((i) => i.status !== 'done' && dateOf(i.dueAt, tz) < today);
  const catchUpOn = (d: DateStr) => late.reduce((n, i) => n + (schedule.byItem[i.id]?.plannedByDay[d] ?? 0), 0);
  const rows = days.map((d) => {
    const due = items.filter((i) => i.status !== 'done' && !isNoise(i) && dateOf(i.dueAt, tz) === d).length;
    const catchUp = catchUpOn(d);
    const planned = Math.max(0, (schedule.loadByDay[d] ?? 0) - catchUp);
    const cap = dayCapacity(data.settings, d);
    return { d, due, planned, catchUp, cap };
  });
  const total = rows.reduce((n, r) => n + r.planned, 0);
  const catchUp = rows.reduce((n, r) => n + r.catchUp, 0);
  const capacity = rows.reduce((n, r) => n + r.cap, 0);
  return (
    <section className="card glance" aria-label="This week at a glance">
      <h3 className="section-title">This week</h3>
      <p className="hint">
        {fmtMinutes(total)} planned of {fmtMinutes(capacity)} you have.
        {catchUp > 0 ? ` Plus ${fmtMinutes(catchUp)} of catch-up on late work.` : ''}
      </p>
      <ul className="glance-list">
        {rows.map((r) => (
          <li key={r.d} className="glance-row" data-today={r.d === today} data-over={r.cap > 0 && r.planned > r.cap}>
            <span className="glance-day">{DOW[new Date(`${r.d}T12:00:00Z`).getUTCDay()]}</span>
            <span className="glance-bar" aria-hidden>
              <i style={{ width: `${r.cap ? Math.min(100, (r.planned / r.cap) * 100) : 0}%` }} />
              {r.catchUp > 0 && <i className="glance-catch" style={{ left: `${r.cap ? Math.min(100, (r.planned / r.cap) * 100) : 0}%`, width: `${r.cap ? Math.min(100 - Math.min(100, (r.planned / r.cap) * 100), (r.catchUp / r.cap) * 100) : 0}%` }} />}
            </span>
            <span className="glance-n">{r.due ? `${r.due} due` : r.planned ? fmtMinutes(r.planned) : r.catchUp ? 'catch-up' : ''}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
