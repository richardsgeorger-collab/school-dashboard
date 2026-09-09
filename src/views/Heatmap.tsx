import { useMemo, useState } from 'react';
import { CourseChip, useCourseColor } from '../components/CourseChip';
import { ItemRow } from '../components/ItemRow';
import { Modal } from '../components/Modal';
import { addDays, dateOf, fmtDate, fmtMinutes, weekStart } from '../domain/dates';
import { dayCapacity } from '../domain/schedule';
import type { Course, DateStr, Item } from '../domain/types';
import { useStore } from '../storage/store';
import { useMediaQuery } from '../ui/useMediaQuery';
import { ItemDetail } from './ItemDetail';

interface WeekCol {
  start: DateStr;
  label: string;
  capacity: number;
  total: number;
  byCourse: Record<string, number>;
  big: Item[];
}

function shade(minutes: number, max: number): number {
  if (minutes <= 0) return 0;
  const r = minutes / Math.max(max, 1);
  return r < 0.2 ? 1 : r < 0.4 ? 2 : r < 0.65 ? 3 : r < 0.9 ? 4 : 5;
}

function CourseCell({ course, minutes, max, onClick }: { course: Course; minutes: number; max: number; onClick: () => void }) {
  const color = useCourseColor(course);
  const level = shade(minutes, max);
  return (
    <button type="button" className="heat-cell" data-level={level} style={{ '--course': color } as React.CSSProperties} onClick={onClick} aria-label={`${course.code}: ${fmtMinutes(minutes)}`}>
      {minutes > 0 ? (minutes / 60).toFixed(minutes % 60 === 0 ? 0 : 1) : '·'}
    </button>
  );
}

function TotalCell({ total, capacity, onClick }: { total: number; capacity: number; onClick: () => void }) {
  const ratio = capacity ? total / capacity : 0;
  const status = total === 0 ? 'none' : ratio <= 0.8 ? 'ok' : ratio <= 1 ? 'warn' : 'over';
  return (
    <button type="button" className="heat-cell heat-total" data-status={status} onClick={onClick} aria-label={`Total ${fmtMinutes(total)} of ${fmtMinutes(capacity)}`}>
      {total > 0 ? (total / 60).toFixed(total % 60 === 0 ? 0 : 1) : '·'}
      <small>/{Math.round(capacity / 60)}</small>
    </button>
  );
}

export function Heatmap() {
  const { data, schedule, term, today } = useStore();
  const tz = data.settings.timezone;
  const wide = useMediaQuery('(min-width: 900px)');
  const [pick, setPick] = useState<{ week: WeekCol; courseId: string | null } | null>(null);
  const [open, setOpen] = useState<Item | null>(null);

  const weeks = useMemo<WeekCol[]>(() => {
    const out: WeekCol[] = [];
    const first = weekStart(term.start, data.settings.weekStartsOn);
    for (let ws = first; ws <= term.end; ws = addDays(ws, 7)) {
      const row = schedule.weekLoad[ws] ?? { total: 0 };
      const capacity = Array.from({ length: 7 }, (_, k) => dayCapacity(data.settings, addDays(ws, k))).reduce((a, b) => a + b, 0);
      const end = addDays(ws, 6);
      const big = data.items.filter((i) => {
        const d = dateOf(i.dueAt, tz);
        return d >= ws && d <= end && (i.type === 'exam' || i.points >= 100);
      });
      out.push({ start: ws, label: fmtDate(ws, 'numeric'), capacity, total: row.total, byCourse: row, big });
    }
    return out;
  }, [term, schedule, data.settings, data.items, tz]);

  const max = Math.max(1, ...weeks.flatMap((w) => data.courses.map((c) => w.byCourse[c.id] ?? 0)));
  const thisWeek = weekStart(today, data.settings.weekStartsOn);
  const crush = weeks.filter((w) => w.total > w.capacity);

  const itemsFor = (week: WeekCol, courseId: string | null) => {
    const end = addDays(week.start, 6);
    return data.items
      .filter((i) => (courseId ? i.courseId === courseId : true))
      .filter((i) => {
        const s = schedule.byItem[i.id];
        return s && Object.keys(s.plannedByDay).some((d) => d >= week.start && d <= end);
      })
      .sort((a, b) => a.dueAt.localeCompare(b.dueAt));
  };

  return (
    <>
      <h1 className="page-title">
        Workload <span className="light">by week</span>
      </h1>
      <p className="hint" style={{ marginTop: 6, maxWidth: 640 }}>
        Planned study hours per class per week, from the start-by schedule. The total row is colored against your capacity
        ({fmtMinutes(data.settings.weekdayMinutes)} weekdays, {fmtMinutes(data.settings.weekendMinutes)} weekends).
        {crush.length > 0 ? ` ${crush.length} week${crush.length === 1 ? '' : 's'} run over capacity.` : ' No week runs over capacity.'}
      </p>

      <div className="heat-wrap">
        <table className="heat" data-wide={wide}>
          {wide ? (
            <>
              <thead>
                <tr>
                  <th scope="col" className="heat-corner">
                    Week of
                  </th>
                  {weeks.map((w) => (
                    <th key={w.start} scope="col" data-today={w.start === thisWeek}>
                      {w.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.courses.map((c) => (
                  <tr key={c.id}>
                    <th scope="row">
                      <CourseChip course={c} />
                    </th>
                    {weeks.map((w) => (
                      <td key={w.start}>
                        <CourseCell course={c} minutes={w.byCourse[c.id] ?? 0} max={max} onClick={() => setPick({ week: w, courseId: c.id })} />
                      </td>
                    ))}
                  </tr>
                ))}
                <tr className="heat-total-row">
                  <th scope="row">Total</th>
                  {weeks.map((w) => (
                    <td key={w.start}>
                      <TotalCell total={w.total} capacity={w.capacity} onClick={() => setPick({ week: w, courseId: null })} />
                    </td>
                  ))}
                </tr>
                <tr className="heat-marks">
                  <th scope="row">Big items</th>
                  {weeks.map((w) => (
                    <td key={w.start}>
                      <span className="heat-marks-wrap">
                        {w.big.map((i) => (
                          <span key={i.id} className="heat-mark" title={i.title}>
                            {i.type === 'exam' ? 'EXAM' : `${i.points}pt`}
                          </span>
                        ))}
                      </span>
                    </td>
                  ))}
                </tr>
              </tbody>
            </>
          ) : (
            <>
              <thead>
                <tr>
                  <th scope="col" className="heat-corner">
                    Week
                  </th>
                  {data.courses.map((c) => (
                    <th key={c.id} scope="col">
                      <CourseChip course={c} />
                    </th>
                  ))}
                  <th scope="col">Total</th>
                </tr>
              </thead>
              <tbody>
                {weeks.map((w) => (
                  <tr key={w.start} data-today={w.start === thisWeek}>
                    <th scope="row">
                      {w.label}
                      {w.big.length > 0 && (
                        <span className="heat-mark-col">
                          {w.big.map((i) => (
                            <span key={i.id} className="heat-mark" title={i.title}>
                              {i.type === 'exam' ? 'EXAM' : `${i.points}pt`}
                            </span>
                          ))}
                        </span>
                      )}
                    </th>
                    {data.courses.map((c) => (
                      <td key={c.id}>
                        <CourseCell course={c} minutes={w.byCourse[c.id] ?? 0} max={max} onClick={() => setPick({ week: w, courseId: c.id })} />
                      </td>
                    ))}
                    <td>
                      <TotalCell total={w.total} capacity={w.capacity} onClick={() => setPick({ week: w, courseId: null })} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </>
          )}
        </table>
      </div>
      <p className="hint" style={{ marginTop: 8 }}>
        Numbers are hours. Total cells: green under 80% of capacity, amber up to 100%, red over. Tap a cell to see what is planned.
      </p>

      {pick && (
        <Modal title={`Week of ${fmtDate(pick.week.start, 'short')}`} onClose={() => setPick(null)}>
          <div className="modal-body">
            <p className="hint mono">
              {fmtMinutes(pick.courseId ? (pick.week.byCourse[pick.courseId] ?? 0) : pick.week.total)} planned
              {pick.courseId ? '' : ` of ${fmtMinutes(pick.week.capacity)}`}
            </p>
            <ul className="item-list">
              {itemsFor(pick.week, pick.courseId).map((i) => (
                <ItemRow key={i.id} item={i} onOpen={(it) => { setPick(null); setOpen(it); }} showStart />
              ))}
            </ul>
          </div>
        </Modal>
      )}
      {open && <ItemDetail key={open.id} item={open} onClose={() => setOpen(null)} />}
    </>
  );
}
