import { useMemo, useState } from 'react';
import { CourseChip, useCourseColor } from '../components/CourseChip';
import { EmptyState } from '../components/EmptyState';
import { IconPlus } from '../components/Icons';
import { ItemRow } from '../components/ItemRow';
import { WeekLedger } from '../components/WeekLedger';
import { addDays, dateOf, fmtDate, fmtMinutes, weekStart } from '../domain/dates';
import { dayCapacity } from '../domain/schedule';
import type { Course, DateStr, Item } from '../domain/types';
import { useStore } from '../storage/store';
import { pluralize } from '../ui/format';
import { blankItem, ItemDetail } from './ItemDetail';

function CourseLoad({ course, minutes, max }: { course: Course; minutes: number; max: number }) {
  const color = useCourseColor(course);
  return (
    <>
      <CourseChip course={course} />
      <div className="bar" style={{ '--course': color } as React.CSSProperties}>
        <span style={{ width: `${max ? (minutes / max) * 100 : 0}%` }} />
      </div>
      <span className="mono muted">{fmtMinutes(minutes)}</span>
    </>
  );
}

export function Dashboard() {
  const { data, schedule, today, courseById } = useStore();
  const tz = data.settings.timezone;
  const [open, setOpen] = useState<{ item: Item; isNew: boolean } | null>(null);

  const byDue = (a: Item, b: Item) => a.dueAt.localeCompare(b.dueAt);
  const openItems = useMemo(() => data.items.filter((i) => i.status !== 'done'), [data.items]);

  const attention = openItems.filter((i) => ['overdue', 'at_risk'].includes(schedule.byItem[i.id]?.risk ?? '')).sort(byDue);
  const startToday = openItems
    .filter((i) => !attention.includes(i) && (schedule.byItem[i.id]?.startBy ?? '') <= today)
    .sort((a, b) => (schedule.byItem[a.id].deadlineDay + a.dueAt).localeCompare(schedule.byItem[b.id].deadlineDay + b.dueAt));
  const inProgress = openItems.filter((i) => i.status === 'in_progress' && !attention.includes(i) && !startToday.includes(i)).sort(byDue);

  const weekEnd = addDays(today, 6);
  const dueThisWeek = data.items.filter((i) => {
    const d = dateOf(i.dueAt, tz);
    return d >= today && d <= weekEnd;
  });
  const dueByDay = new Map<DateStr, Item[]>();
  for (const i of dueThisWeek.sort(byDue)) {
    const d = dateOf(i.dueAt, tz);
    dueByDay.set(d, [...(dueByDay.get(d) ?? []), i]);
  }

  const wk = weekStart(today, data.settings.weekStartsOn);
  const weekRow = schedule.weekLoad[wk] ?? { total: 0 };
  const weekCap = Array.from({ length: 7 }, (_, k) => dayCapacity(data.settings, addDays(wk, k))).reduce((a, b) => a + b, 0);
  const maxCourse = Math.max(1, ...data.courses.map((c) => weekRow[c.id] ?? 0));

  const counts = { overdue: 0, at_risk: 0, due_soon: 0, start_today: 0 };
  for (const i of openItems) {
    const r = schedule.byItem[i.id]?.risk;
    if (r) counts[r] += 1;
  }

  const doneCount = data.items.filter((i) => i.status === 'done').length;

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <div style={{ flex: 1 }}>
          <h1 className="page-title">
            {fmtDate(today, 'long').split(',')[0]} <span className="light">{fmtDate(today, 'short')}</span>
          </h1>
          <div className="status-strip">
            {counts.overdue > 0 && (
              <span className="status-pill" data-risk="overdue">
                <b>{counts.overdue}</b> overdue
              </span>
            )}
            {counts.at_risk > 0 && (
              <span className="status-pill" data-risk="at_risk">
                <b>{counts.at_risk}</b> at risk
              </span>
            )}
            {startToday.length > 0 && (
              <span className="status-pill" data-risk="start_today">
                <b>{startToday.length}</b> to start today
              </span>
            )}
            <span className="status-pill">
              <b>{dueThisWeek.filter((i) => i.status !== 'done').length}</b> due in 7 days
            </span>
            <span className="status-pill">
              <b>{doneCount}</b> done
            </span>
          </div>
        </div>
        <button
          type="button"
          className="btn primary"
          style={{ minWidth: 44, padding: '0 12px' }}
          aria-label="Add item"
          onClick={() => setOpen({ item: blankItem(data.courses[0]?.id ?? '', tz, today), isNew: true })}
        >
          <IconPlus />
        </button>
      </div>

      <div className="dash-grid" style={{ marginTop: 20 }}>
        <div>
          <WeekLedger />

          <section className="section">
            <h2 className="section-title">
              Hours this week by class
            </h2>
            <div className="card" style={{ marginTop: 10 }}>
              <div className="course-load">
                {data.courses.map((c) => (
                  <CourseLoad key={c.id} course={c} minutes={weekRow[c.id] ?? 0} max={maxCourse} />
                ))}
              </div>
              <p className="hint" style={{ marginTop: 10 }}>
                {fmtMinutes(weekRow.total)} planned against {fmtMinutes(weekCap)} of study time. Class meetings are not counted.
              </p>
            </div>
          </section>

          {attention.length > 0 && (
            <section className="section">
              <h2 className="section-title">
                Needs attention <span className="count">{attention.length}</span>
              </h2>
              <ul className="item-list" style={{ marginTop: 10 }}>
                {attention.map((i) => (
                  <ItemRow key={i.id} item={i} onOpen={(item) => setOpen({ item, isNew: false })} />
                ))}
              </ul>
            </section>
          )}

          <section className="section">
            <h2 className="section-title">
              Start today <span className="count">{startToday.length}</span>
            </h2>
            <ul className="item-list" style={{ marginTop: 10 }}>
              {startToday.length === 0 && <EmptyState>Nothing needs to start today. Get ahead on something in the calendar, or rest.</EmptyState>}
              {startToday.map((i) => (
                <ItemRow key={i.id} item={i} onOpen={(item) => setOpen({ item, isNew: false })} />
              ))}
            </ul>
          </section>

          {inProgress.length > 0 && (
            <section className="section">
              <h2 className="section-title">
                In progress <span className="count">{inProgress.length}</span>
              </h2>
              <ul className="item-list" style={{ marginTop: 10 }}>
                {inProgress.map((i) => (
                  <ItemRow key={i.id} item={i} onOpen={(item) => setOpen({ item, isNew: false })} />
                ))}
              </ul>
            </section>
          )}
        </div>

        <div>
          <section>
            <h2 className="section-title">
              Due in the next 7 days <span className="count">{pluralize(dueThisWeek.length, 'item')}</span>
            </h2>
            {dueByDay.size === 0 && (
              <div style={{ marginTop: 10 }}>
                <EmptyState>Nothing due in the next seven days.</EmptyState>
              </div>
            )}
            {[...dueByDay.entries()].map(([d, items]) => (
              <div key={d} className="day-group">
                <div className="day-group-head" data-today={d === today}>
                  <b>{d === today ? 'Today' : fmtDate(d, 'long')}</b>
                  <span>{pluralize(items.length, 'item')}</span>
                </div>
                <ul className="item-list">
                  {items.map((i) => (
                    <ItemRow key={i.id} item={i} onOpen={(item) => setOpen({ item, isNew: false })} showStart />
                  ))}
                </ul>
              </div>
            ))}
          </section>
        </div>
      </div>

      {open && <ItemDetail key={open.item.id} item={open.item} isNew={open.isNew} onClose={() => setOpen(null)} />}
      {courseById.size === 0 && (
        <div style={{ marginTop: 24 }}>
          <EmptyState>No classes yet. Import a syllabus from Settings.</EmptyState>
        </div>
      )}
    </>
  );
}
