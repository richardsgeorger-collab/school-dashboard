import { useEffect, useState } from 'react';
import { ClassNotes } from './Requirements';
import { ClassRules } from './ClassRules';
import { CourseChip, useCourseColor } from '../components/CourseChip';
import { ItemRow } from '../components/ItemRow';
import { addDays, dateOf, diffDays, fmtDate, fmtMinutes } from '../domain/dates';
import { courseGrade } from '../domain/grades';
import { paceFor } from '../domain/pace';
import type { Item } from '../domain/types';
import { conceptLine, conceptWarnings } from '../domain/concepts';
import { weakLine } from '../domain/weak';
import { SyncedLine } from './SyncedLine';
import { announceStores, type StoredResource } from '../halo/announce';
import { usePlanStatus } from '../ingest/usePlan';
import { materialsFor } from '../library/ingest';
import { useRoute } from '../router';
import { useStore } from '../storage/store';
import { ItemDetail } from './ItemDetail';
import { PasteTranscript } from './PasteTranscript';
import { QuizLink } from './Quiz';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Everything about one class on one page: what is next, where the grade stands, what is open, what is on file. */
export function ClassPage() {
  const { data, schedule, today } = useStore();
  const { params } = useRoute();
  const tz = data.settings.timezone;
  const course = data.courses.find((c) => c.id === params.get('c')) ?? null;
  const color = useCourseColor(course ?? undefined);
  const [open, setOpen] = useState<Item | null>(null);
  const [materials, setMaterials] = useState<{ recordings: number; decks: number; syllabus: boolean } | null>(null);
  const [showDone, setShowDone] = useState(false);
  const [paste, setPaste] = useState(false);
  const [resources, setResources] = useState<StoredResource[]>([]);
  useEffect(() => {
    if (!course) return;
    let live = true;
    announceStores
      .resources()
      .then((r) => live && setResources(r.filter((x) => x.courseId === course.id)))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [course?.id]);
  const planStatus = usePlanStatus(course);
  useEffect(() => {
    if (!course) return;
    let live = true;
    materialsFor(course.id)
      .then((m) => live && setMaterials(m))
      .catch(() => live && setMaterials(null));
    return () => {
      live = false;
    };
  }, [course]);

  if (!course) {
    return (
      <>
        <h1 className="page-title">Class</h1>
        <p className="hint">
          No such class. <a href="#/classes">Classes</a> lists them.
        </p>
      </>
    );
  }

  const items = data.items.filter((i) => i.courseId === course.id && i.type !== 'participation');
  const openItems = items.filter((i) => i.status !== 'done').sort((a, b) => a.dueAt.localeCompare(b.dueAt));
  const done = items.filter((i) => i.status === 'done').sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? ''));
  const next = openItems.find((i) => dateOf(i.dueAt, tz) >= today) ?? openItems[0] ?? null;
  const overdue = openItems.filter((i) => (schedule.byItem[i.id]?.deadlineDay ?? dateOf(i.dueAt, tz)) < today);
  const week = openItems.filter((i) => dateOf(i.dueAt, tz) >= today && dateOf(i.dueAt, tz) <= addDays(today, 6));
  const grade = courseGrade(course.id, data.items);
  const concept = conceptLine(conceptWarnings(data.courses, data.items, data.settings.topicLinks ?? [], data.settings.quizStats, today, tz).filter((w) => w.courseId === course.id), 6);
  const weak = concept ?? weakLine(course, data.items, data.settings.quizStats, today, tz);
  const pace = paceFor(course, data.items, schedule, today);
  const pulled = data.settings.haloPulls?.[course.id]?.assessments ?? null;
  const meetings = course.online ? 'Online' : course.meetings.map((m) => `${DAYS[m.day]} ${m.start}–${m.end}`).join(', ') || 'No meetings set';
  const paceText = pace.kind === 'behind' ? `${pace.n} item${pace.n === 1 ? '' : 's'} behind` : pace.kind === 'ahead' ? `${pace.days} days ahead` : pace.kind === 'on' ? 'On pace' : 'Nothing open';

  return (
    <>
      <div className="lib-head">
        <div>
          <a className="diff-toggle" href="#/classes">
            ← Classes
          </a>
          <h1 className="page-title lib-class-title">
            <CourseChip course={course} /> <span>{course.name}</span>
          </h1>
          <p className="hint mono">
            {meetings}
            {course.instructors.length ? ` · ${course.instructors.map((p) => p.name).join(', ')}` : ''}
          </p>
          <SyncedLine courseId={course.id} />
        </div>
        <span className="settings-actions">
          <button type="button" className="btn small" onClick={() => setPaste(true)}>
            Paste a lecture transcript
          </button>
          <a className="btn small" href={`#/tutor?c=${course.id}`}>
            Tutor
          </a>
          <QuizLink courseId={course.id} />
        </span>
      </div>

      <ClassNotes course={course} />
      <ClassRules course={course} />
      <section className="card class-next" style={{ '--course': color } as React.CSSProperties}>
        {next ? (
          <>
            <p className="hint mono">next deadline</p>
            <button type="button" className="class-next-title" onClick={() => setOpen(next)}>
              {next.label}
            </button>
            <p className="hint mono">
              {fmtDate(dateOf(next.dueAt, tz), 'long')} · {(() => {
                const d = diffDays(today, dateOf(next.dueAt, tz));
                return d < 0 ? `${-d} day${d === -1 ? '' : 's'} past` : d === 0 ? 'today' : d === 1 ? 'tomorrow' : `in ${d} days`;
              })()}{' '}
              · ~{fmtMinutes(next.estimatedMinutes)} · {next.points} pts
            </p>
          </>
        ) : (
          <p className="hint">Nothing open in this class.</p>
        )}
        <dl className="grade-stats mono class-stats">
          <div>
            <dt>Grade</dt>
            <dd>{grade.pct === null ? '—' : `${grade.pct}%`}</dd>
          </div>
          <div>
            <dt>Pace</dt>
            <dd>{paceText}</dd>
          </div>
          <div>
            <dt>This week</dt>
            <dd>{week.length}</dd>
          </div>
          <div>
            <dt>Synced</dt>
            <dd>{pulled ? fmtDate(dateOf(pulled, tz), 'short') : 'never'}</dd>
          </div>
        </dl>
        {weak && <p className="hint">{weak}</p>}
      </section>

      {overdue.length > 0 && (
        <section className="section">
          <h2 className="section-title">
            past their date <span className="count">{overdue.length}</span>
          </h2>
          <ul className="item-list">
            {overdue.map((i) => (
              <ItemRow key={i.id} item={i} onOpen={setOpen} />
            ))}
          </ul>
        </section>
      )}

      <section className="section">
        <h2 className="section-title">
          open <span className="count">{openItems.length}</span>
        </h2>
        {openItems.length === 0 ? (
          <p className="hint">Nothing open.</p>
        ) : (
          <ul className="item-list">
            {openItems
              .filter((i) => !overdue.includes(i))
              .map((i) => (
                <ItemRow key={i.id} item={i} onOpen={setOpen} showStart />
              ))}
          </ul>
        )}
      </section>

      <section className="section">
        <h2 className="section-title">
          materials{' '}
          {materials && (
            <span className="count">
              {materials.recordings} recording{materials.recordings === 1 ? '' : 's'} · {materials.decks} slide deck{materials.decks === 1 ? '' : 's'} · {materials.syllabus ? 'syllabus on file' : 'no syllabus'}
            </span>
          )}
        </h2>
        {resources.length > 0 && (
          <ul className="diff-list class-resources">
            {resources.slice(0, 12).map((r) => (
              <li key={r.id}>
                <b>{r.title}</b>
                {r.unit ? <span className="muted mono"> · {r.unit}</span> : null}
                {r.instructorAdded ? <span className="flag">added by your instructor</span> : null}
                {r.files.length > 0 && <span className="hint"> {r.files.map((f) => f.name).join(', ')}</span>}
              </li>
            ))}
            {resources.length > 12 && <li className="muted">and {resources.length - 12} more in Halo</li>}
          </ul>
        )}
        <p className="hint">
          <a className="btn small" href={`#/library?c=${course.id}`}>
            Open the class library
          </a>{' '}
          <a className="btn small" href="#/grades">
            Grades
          </a>{' '}
          <a className="btn small" href={`#/study?c=${course.id}`}>
            Study kit
          </a>{' '}
          <a className="btn small" href={`#/ingest?c=${course.id}`}>
            {course.ingest === 'ai' ? (planStatus && planStatus.pending > 0 ? `AI plan · ${planStatus.pending} to review` : planStatus?.state === 'stale' ? 'AI plan · changed since' : 'AI plan') : 'AI plan (compare)'}
          </a>{' '}
          <a className="btn small" href="#/you?s=classes">
            Edit class
          </a>
        </p>
      </section>

      <section className="section">
        <h2 className="section-title">
          done <span className="count">{done.length}</span>
          {done.length > 0 && (
            <button type="button" className="then-all" onClick={() => setShowDone((s) => !s)}>
              {showDone ? 'hide' : 'show'}
            </button>
          )}
        </h2>
        {showDone && (
          <ul className="item-list">
            {done.slice(0, 40).map((i) => (
              <ItemRow key={i.id} item={i} onOpen={setOpen} />
            ))}
          </ul>
        )}
      </section>

      {open && <ItemDetail key={open.id} item={open} onClose={() => setOpen(null)} />}
      {paste && <PasteTranscript course={course} onClose={() => setPaste(false)} />}
    </>
  );
}
