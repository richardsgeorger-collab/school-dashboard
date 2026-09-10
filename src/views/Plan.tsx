import { useMemo, useState } from 'react';
import { CourseChip, useCourseColor } from '../components/CourseChip';
import { IconPlus } from '../components/Icons';
import { ItemRow } from '../components/ItemRow';
import { ProgressCard } from '../components/ProgressCard';
import { WeekLedger } from '../components/WeekLedger';
import { addDays, fmtDate, fmtMinutes, weekStart } from '../domain/dates';
import { dayCapacity } from '../domain/schedule';
import type { Course, Item } from '../domain/types';
import { useStore } from '../storage/store';
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

export function Plan() {
  const { data, schedule, today } = useStore();
  const tz = data.settings.timezone;
  const [open, setOpen] = useState<{ item: Item; isNew: boolean } | null>(null);

  const byDue = (a: Item, b: Item) => a.dueAt.localeCompare(b.dueAt);
  const openItems = useMemo(() => data.items.filter((i) => i.status !== 'done'), [data.items]);
  const inProgress = openItems.filter((i) => i.status === 'in_progress').sort(byDue);



  const wk = weekStart(today, data.settings.weekStartsOn);
  const weekRow = schedule.weekLoad[wk] ?? { total: 0 };
  const weekCap = Array.from({ length: 7 }, (_, k) => dayCapacity(data.settings, addDays(wk, k))).reduce((a, b) => a + b, 0);
  const maxCourse = Math.max(1, ...data.courses.map((c) => weekRow[c.id] ?? 0));


  const doneCount = data.items.filter((i) => i.status === 'done').length;

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <div style={{ flex: 1 }}>
          <h1 className="page-title">
            Plan <span className="light">{fmtDate(today, 'long')}</span>
          </h1>
          <p className="hint" style={{ marginTop: 6 }}>
            Your week as a time budget. {doneCount} of {data.items.length} items done.
          </p>
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
            <h2 className="section-title">Hours this week by class</h2>
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
        </div>
        <div>
          <ProgressCard />
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
      </div>

      {open && <ItemDetail key={open.item.id} item={open.item} isNew={open.isNew} onClose={() => setOpen(null)} />}
    </>
  );
}
