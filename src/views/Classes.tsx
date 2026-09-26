import { useState } from 'react';
import { CourseChip, useCourseColor } from '../components/CourseChip';
import { EmptyState } from '../components/EmptyState';
import { PALETTE } from '../data/courseDefaults';
import { dateOf, diffDays, fmtClock, fmtDate, hhmmToMinutes } from '../domain/dates';
import { courseGrade, letterFor, NOT_ENOUGH_GRADED } from '../domain/grades';
import { paceFor } from '../domain/pace';
import { Ring } from '../components/Ring';
import { newId } from '../domain/ids';
import { isNoise } from '../domain/requirements';
import type { Course } from '../domain/types';
import { useStore } from '../storage/store';
import { syncPress } from '../ui/presses';
import { CourseEditor } from './CourseEditor';
import { SyncedLine } from './SyncedLine';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function meetingSummary(c: Course): string {
  if (c.online) return 'Online';
  if (c.meetings.length === 0) return 'No meeting times';
  return c.meetings
    .map((m) => {
      const s = hhmmToMinutes(m.start);
      return `${DAYS[m.day]} ${fmtClock(Math.floor(s / 60), s % 60)}`;
    })
    .join(' · ');
}

function ClassCard({ course }: { course: Course }) {
  const { data, today, schedule } = useStore();
  const tz = data.settings.timezone;
  const color = useCourseColor(course);
  const items = data.items.filter((i) => i.courseId === course.id);
  const open = items.filter((i) => i.status !== 'done' && !isNoise(i));
  // Participation is attendance, not the next thing to do.
  const next = [...open].filter((i) => i.type !== 'participation' && dateOf(i.dueAt, tz) >= today).sort((a, b) => a.dueAt.localeCompare(b.dueAt))[0];
  const overdue = open.filter((i) => dateOf(i.dueAt, tz) < today).length;
  const g = courseGrade(course.id, data.items);
  const letter = letterFor(g.pct, course.gradeScale);
  const nextLine = next ? `${next.label} · ${diffDays(today, dateOf(next.dueAt, tz)) === 0 ? 'today' : diffDays(today, dateOf(next.dueAt, tz)) === 1 ? 'tomorrow' : fmtDate(dateOf(next.dueAt, tz), 'short')}` : open.length === 0 ? 'Nothing open' : null;
  // One pace line per class: late counts as late; otherwise on pace or ahead.
  const pace = paceFor(course, data.items, schedule, today);
  const paceLine = overdue > 0 ? `${overdue} late` : pace.kind === 'ahead' ? `${pace.days} days ahead` : pace.kind === 'on' ? 'On pace' : pace.kind === 'behind' ? `${pace.n} behind` : null;
  return (
    <li>
      <a href={`#/class?c=${course.id}`} className="class-card card" style={{ '--course': color } as React.CSSProperties}>
        <div className="class-card-head">
          <CourseChip course={course} />
          {g.pct !== null ? (
            <span className="class-card-grade" title={`${g.pct}%${letter ? ` ${letter}` : ''}`}>
              <Ring value={g.pct} max={100} size={40} text={`${Math.round(g.pct)}`} label={`${g.pct}%${letter ? ` ${letter}` : ''}`} />
            </span>
          ) : (
            <span className="class-card-grade class-card-nograde">{g.graded > 0 ? NOT_ENOUGH_GRADED : 'Not graded yet'}</span>
          )}
        </div>
        <h2 className="class-card-name">{course.name || 'Untitled class'}</h2>
        <p className="class-card-meta">{meetingSummary(course)}</p>
        <p className="class-card-next">{nextLine ? `Next: ${nextLine}` : ''}</p>
        {paceLine && (
          <p className="class-card-pace" data-tone={overdue > 0 ? 'late' : undefined}>
            {paceLine}
          </p>
        )}
      </a>
    </li>
  );
}

/** Every class on one screen: where the grade stands, what is next, when it was last synced. Tap one for the whole class. */
export function Classes() {
  const { data, today } = useStore();
  const [editing, setEditing] = useState<Course | null>(null);
  const add = () =>
    setEditing({
      id: newId(),
      code: '',
      name: '',
      color: PALETTE[data.courses.length % PALETTE.length],
      credits: 3,
      instructors: [],
      meetings: [],
      online: false,
      termStart: data.courses[0]?.termStart ?? today,
      termEnd: data.courses[0]?.termEnd ?? today,
      updatedAt: '',
    });

  return (
    <>
      <div className="grade-head">
        <h1 className="page-title">Classes</h1>
        {data.courses.length > 0 && (
          <button type="button" className="btn small" onClick={add}>
            Add class
          </button>
        )}
      </div>
      {data.courses.length > 0 && (
        <div className="classes-sync">
          <SyncedLine />
        </div>
      )}
      {data.courses.length === 0 ? (
        <EmptyState art="classes">
          <p>
            <b>No classes yet.</b>
          </p>
          <p>Sync Halo and your classes, assignments and grades come in together. Or add a class by hand if it is not in Halo.</p>
          <p className="empty-actions">
            <button type="button" className="btn primary" onClick={() => syncPress.current?.()}>
              Sync Halo
            </button>
            <button type="button" className="btn" onClick={add}>
              Add a class
            </button>
          </p>
        </EmptyState>
      ) : (
        <ul className="classes-list">
          {data.courses.map((c) => (
            <ClassCard key={c.id} course={c} />
          ))}
        </ul>
      )}
      {editing && <CourseEditor key={editing.id} course={editing} onClose={() => setEditing(null)} />}
    </>
  );
}
