import { useState } from 'react';
import { CourseChip, useCourseColor } from '../components/CourseChip';
import { SegmentedControl } from '../components/SegmentedControl';
import { WeekLedger } from '../components/WeekLedger';
import { addDays, fmtMinutes, weekStart } from '../domain/dates';
import { dayCapacity } from '../domain/schedule';
import type { Course, Item } from '../domain/types';
import { useRoute } from '../router';
import { useStore } from '../storage/store';
import { EmptyState } from '../components/EmptyState';
import { Heatmap } from './Heatmap';
import { ItemDetail } from './ItemDetail';
import { TermView } from './calendar/TermView';

type View = 'week' | 'weeks' | 'term';

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

/** This week as a time budget: the ledger by day, then hours by class. What the Plan tab used to be, minus the rest. */
function ThisWeek() {
  const { data, schedule, today } = useStore();
  const wk = weekStart(today, data.settings.weekStartsOn);
  const weekRow = schedule.weekLoad[wk] ?? { total: 0 };
  const weekCap = Array.from({ length: 7 }, (_, k) => dayCapacity(data.settings, addDays(wk, k))).reduce((a, b) => a + b, 0);
  const maxCourse = Math.max(1, ...data.courses.map((c) => weekRow[c.id] ?? 0));
  return (
    <>
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
    </>
  );
}

/** Load: this week, every week, or the whole term on one line. Reached from You and from a heavy-day warning. */
export function Load() {
  const { data } = useStore();
  const { params, navigate } = useRoute();
  const v = params.get('v');
  const view: View = v === 'term' ? 'term' : v === 'week' ? 'week' : 'weeks';
  const [open, setOpen] = useState<Item | null>(null);
  if (data.items.length === 0) {
    return (
      <>
        <h1 className="page-title">Load</h1>
        <EmptyState art="calendar">
          <p>
            <b>Your workload appears after the first sync.</b>
          </p>
          <p>Every week of the term against your study hours, so a heavy one is visible before it arrives.</p>
        </EmptyState>
      </>
    );
  }
  return (
    <>
      <div className="cal-toolbar">
        <h1 className="page-title">Load</h1>
        <SegmentedControl
          label="Load view"
          value={view}
          options={[
            { value: 'week', label: 'This week' },
            { value: 'weeks', label: 'Weeks' },
            { value: 'term', label: 'Term' },
          ]}
          onChange={(next) => navigate('load', { v: next })}
        />
      </div>
      {view === 'week' && <ThisWeek />}
      {view === 'weeks' && <Heatmap />}
      {view === 'term' && <TermView items={data.items} onOpen={setOpen} />}
      {open && <ItemDetail key={open.id} item={open} onClose={() => setOpen(null)} />}
    </>
  );
}
