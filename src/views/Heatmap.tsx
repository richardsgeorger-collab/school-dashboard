import { useMemo, useState } from 'react';
import { CourseChip, useCourseColor } from '../components/CourseChip';
import { ItemRow } from '../components/ItemRow';
import { addDays, dateOf, fmtDate, fmtMinutes, weekStart } from '../domain/dates';
import { dayCapacity } from '../domain/schedule';
import type { Course, DateStr, Item } from '../domain/types';
import { useStore } from '../storage/store';
import { ItemDetail } from './ItemDetail';

interface WeekRow {
  start: DateStr;
  end: DateStr;
  capacity: number;
  total: number;
  byCourse: Record<string, number>;
  big: Item[];
}

const status = (total: number, capacity: number) => (total === 0 ? 'none' : total / capacity <= 0.8 ? 'ok' : total / capacity <= 1 ? 'warn' : 'over');

function CourseCell({ course, minutes, onClick }: { course: Course; minutes: number; onClick: () => void }) {
  const color = useCourseColor(course);
  return (
    <button type="button" className="load-course" onClick={onClick} style={{ '--course': color } as React.CSSProperties} disabled={minutes === 0}>
      <CourseChip course={course} />
      <span className="mono">{minutes ? fmtMinutes(minutes) : '·'}</span>
    </button>
  );
}

export function Heatmap() {
  const { data, schedule, term, today } = useStore();
  const tz = data.settings.timezone;
  const [openWeek, setOpenWeek] = useState<DateStr | null>(null);
  const [pick, setPick] = useState<{ week: WeekRow; courseId: string | null } | null>(null);
  const [open, setOpen] = useState<Item | null>(null);

  const weeks = useMemo<WeekRow[]>(() => {
    const out: WeekRow[] = [];
    const first = weekStart(term.start, data.settings.weekStartsOn);
    for (let ws = first; ws <= term.end; ws = addDays(ws, 7)) {
      const row = schedule.weekLoad[ws] ?? { total: 0 };
      const capacity = Array.from({ length: 7 }, (_, k) => dayCapacity(data.settings, addDays(ws, k))).reduce((a, b) => a + b, 0);
      const end = addDays(ws, 6);
      const big = data.items.filter((i) => {
        const d = dateOf(i.dueAt, tz);
        return d >= ws && d <= end && (i.type === 'exam' || i.points >= 100);
      });
      out.push({ start: ws, end, capacity, total: row.total, byCourse: row, big });
    }
    return out;
  }, [term, schedule, data.settings, data.items, tz]);

  const thisWeek = weekStart(today, data.settings.weekStartsOn);
  const maxCap = Math.max(1, ...weeks.map((w) => Math.max(w.capacity, w.total)));
  const over = weeks.filter((w) => w.total > w.capacity).length;

  const itemsFor = (week: WeekRow, courseId: string | null) =>
    data.items
      .filter((i) => (courseId ? i.courseId === courseId : true))
      .filter((i) => {
        const s = schedule.byItem[i.id];
        return s && Object.keys(s.plannedByDay).some((d) => d >= week.start && d <= week.end);
      })
      .sort((a, b) => a.dueAt.localeCompare(b.dueAt));

  return (
    <>
      <h1 className="page-title">
        Load <span className="light">by week</span>
      </h1>
      <p className="hint" style={{ marginTop: 6, maxWidth: 640 }}>
        Planned study hours each week against your capacity ({fmtMinutes(data.settings.weekdayMinutes)} weekdays, {fmtMinutes(data.settings.weekendMinutes)} weekends).
        {over > 0 ? ` ${over} week${over === 1 ? '' : 's'} run over.` : ' No week runs over.'} Tap a week for the breakdown.
      </p>

      <ol className="load-list">
        {weeks.map((w) => {
          const st = status(w.total, w.capacity);
          const expanded = openWeek === w.start;
          return (
            <li key={w.start} className="load-week" data-status={st} data-current={w.start === thisWeek} data-past={w.end < today} data-open={expanded}>
              <button type="button" className="load-bar-row" onClick={() => setOpenWeek(expanded ? null : w.start)} aria-expanded={expanded}>
                <span className="load-label mono">
                  {fmtDate(w.start, 'numeric')}
                  {w.start === thisWeek && <em>now</em>}
                </span>
                <span className="load-track" aria-hidden>
                  <span className="load-cap" style={{ left: `${(w.capacity / maxCap) * 100}%` }} />
                  <span className="load-fill" style={{ width: `${Math.min(100, (w.total / maxCap) * 100)}%` }} />
                </span>
                <span className="load-value mono">
                  {w.total ? fmtMinutes(w.total) : '·'} <span className="muted">/ {fmtMinutes(w.capacity)}</span>
                </span>
                <span className="load-marks" aria-label={w.big.length ? `${w.big.length} big items` : undefined}>
                  {w.big.map((i) => (
                    <span key={i.id} className="heat-mark" title={i.label}>
                      {i.type === 'exam' ? 'EXAM' : `${i.points}pt`}
                    </span>
                  ))}
                </span>
              </button>
              {expanded && (
                <div className="load-detail">
                  <div className="load-courses">
                    {data.courses.map((c) => (
                      <CourseCell key={c.id} course={c} minutes={w.byCourse[c.id] ?? 0} onClick={() => setPick({ week: w, courseId: c.id })} />
                    ))}
                  </div>
                  <ul className="item-list" style={{ marginTop: 10 }}>
                    {itemsFor(w, null).map((i) => (
                      <ItemRow key={i.id} item={i} onOpen={setOpen} showStart compact />
                    ))}
                  </ul>
                </div>
              )}
            </li>
          );
        })}
      </ol>

      {pick && (
        <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && setPick(null)}>
          <div className="modal" role="dialog" aria-modal="true" aria-label="Week detail">
            <div className="modal-head">
              <h2>
                Week of {fmtDate(pick.week.start, 'short')} · {data.courses.find((c) => c.id === pick.courseId)?.code}
              </h2>
              <button type="button" className="modal-close" onClick={() => setPick(null)} aria-label="Close">
                ×
              </button>
            </div>
            <ul className="item-list">
              {itemsFor(pick.week, pick.courseId).map((i) => (
                <ItemRow key={i.id} item={i} onOpen={(it) => { setPick(null); setOpen(it); }} showStart />
              ))}
            </ul>
          </div>
        </div>
      )}
      {open && <ItemDetail key={open.id} item={open} onClose={() => setOpen(null)} />}
    </>
  );
}
