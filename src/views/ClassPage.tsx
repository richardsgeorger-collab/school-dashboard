import { CookMeter } from './CookMeter';
import { useEffect, useState } from 'react';
import { ClassNotes } from './Requirements';
import { SegmentedControl } from '../components/SegmentedControl';
import { cleanAll, foldReadings, rulesFor } from '../domain/reqClean';
import { ClassRules } from './ClassRules';
import { CourseChip, useCourseColor } from '../components/CourseChip';
import { ItemRow } from '../components/ItemRow';
import { addDays, dateOf, diffDays, fmtClock, fmtDate, fmtMinutes, hhmmToMinutes } from '../domain/dates';
import { basedOn, courseGrade, gradeLine, NOT_GRADED } from '../domain/grades';
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
  const [tab, setTab] = useState<'work' | 'rules' | 'notes'>('work');
  const [resources, setResources] = useState<StoredResource[]>([]);
  // "#/class?c=…&i=…" opens one item's sheet: where Ask and Check send "Open the assignment".
  const wantItem = params.get('i');
  useEffect(() => {
    if (!wantItem) return;
    const it = data.items.find((i) => i.id === wantItem);
    if (it) setOpen(it);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wantItem]);
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

  const items = foldReadings(data.items.filter((i) => i.courseId === course.id && i.type !== 'participation'));
  const rules = rulesFor(cleanAll(data.items).items, course.id);
  const notes = (course.notes ?? []).filter((n) => !n.seenAt);
  const openItems = items.filter((i) => i.status !== 'done').sort((a, b) => a.dueAt.localeCompare(b.dueAt));
  const done = items.filter((i) => i.status === 'done').sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? ''));
  const next = openItems.find((i) => dateOf(i.dueAt, tz) >= today) ?? openItems[0] ?? null;
  const overdue = openItems.filter((i) => (schedule.byItem[i.id]?.deadlineDay ?? dateOf(i.dueAt, tz)) < today);
  const week = openItems.filter((i) => dateOf(i.dueAt, tz) >= today && dateOf(i.dueAt, tz) <= addDays(today, 6));
  const grade = courseGrade(course.id, data.items, course);
  const concept = conceptLine(conceptWarnings(data.courses, data.items, data.settings.topicLinks ?? [], data.settings.quizStats, today, tz).filter((w) => w.courseId === course.id), 6);
  const weak = concept ?? weakLine(course, data.items, data.settings.quizStats, today, tz);
  const pace = paceFor(course, data.items, schedule, today);
  // A class the account synced before per-class pull stamps existed still counts as synced.
  const pulled = data.settings.haloPulls?.[course.id]?.assessments ?? (course.haloClassId ? (data.settings.lastPull?.at ?? null) : null);
  const clock = (hhmm: string) => { const m = hhmmToMinutes(hhmm); return fmtClock(Math.floor(m / 60), m % 60); };
  const meetings = course.online ? 'Online' : course.meetings.map((m) => `${DAYS[m.day]} ${clock(m.start)}–${clock(m.end)}`).join(', ') || 'No meetings set';
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
          <p className="hint">
            {meetings}
            {course.instructors.length ? ` · ${course.instructors.map((p) => p.name).join(', ')}` : ''}
          </p>
          <SyncedLine courseId={course.id} />
          <CookMeter course={course} size="page" />
        </div>
        <span className="settings-actions">
          <button type="button" className="btn small" onClick={() => setPaste(true)}>
            Add a lecture
          </button>
          <a className="btn small" href={`#/ask?c=${course.id}`}>
            Ask
          </a>
          <a className="btn small primary" href={`#/practice?c=${course.id}`}>
            Practice
          </a>
        </span>
      </div>

      <section className="card class-next" style={{ '--course': color } as React.CSSProperties}>
        {next ? (
          <>
            <p className="eyebrow">Next deadline</p>
            <button type="button" className="class-next-title" onClick={() => setOpen(next)}>
              {next.label}
            </button>
            <p className="hint">
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
            <dd>
              {grade.pct === null && !grade.letter ? NOT_GRADED : gradeLine(grade, course.gradeScale)}
              {basedOn(grade) && <span className="grade-basis"> {basedOn(grade)}</span>}
            </dd>
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
            <dd>{pulled ? fmtDate(dateOf(pulled, tz), 'short') : 'not yet'}</dd>
          </div>
        </dl>
        <GradeBreakdown courseId={course.id} items={data.items} total={grade} />
        {weak && <p className="hint">{weak}</p>}
      </section>

      <SegmentedControl
        label="Class"
        value={tab}
        options={[
          { value: 'work', label: 'Work' },
          { value: 'rules', label: `Rules${rules.length ? ` · ${rules.length}` : ''}` },
          { value: 'notes', label: `Notes${notes.length ? ` · ${notes.length}` : ''}` },
        ]}
        onChange={(v) => setTab(v)}
      />
      {tab === 'work' && (
        <>
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
          {materials && (materials.recordings > 0 || materials.decks > 0 || materials.syllabus) && (
            <span className="count">
              {[
                materials.recordings > 0 ? `${materials.recordings} recording${materials.recordings === 1 ? '' : 's'}` : null,
                materials.decks > 0 ? `${materials.decks} slide deck${materials.decks === 1 ? '' : 's'}` : null,
                materials.syllabus ? 'syllabus' : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            </span>
          )}
        </h2>
        {materials && materials.recordings === 0 && materials.decks === 0 && !materials.syllabus && resources.length === 0 && <p className="hint">Nothing on file yet. Drop slides, a syllabus or a recording in the class library.</p>}
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
          <a className="btn small" href={`#/ingest?c=${course.id}`}>
            {course.ingest === 'ai' ? (planStatus && planStatus.pending > 0 ? `AI plan · ${planStatus.pending} to review` : planStatus?.state === 'stale' ? 'AI plan · changed since' : 'AI plan') : 'AI plan'}
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

        </>
      )}
      {tab === 'rules' && <ClassRules course={course} />}
      {tab === 'notes' && <ClassNotes course={course} />}

      {open && <ItemDetail key={open.id} item={open} onClose={() => setOpen(null)} />}
      {paste && <PasteTranscript course={course} onClose={() => setPaste(false)} />}
    </>
  );
}

/**
 * Every graded item Halo counts, participation included, and what they add up to. Halo's own grade stays the headline
 * above; this is the working. When the two disagree the headline is still Halo's (the flag lives in Advanced).
 */
function GradeBreakdown({ courseId, items, total }: { courseId: string; items: Item[]; total: ReturnType<typeof courseGrade> }) {
  const counted = items.filter((i) => i.courseId === courseId && i.score !== null && i.points > 0).sort((a, b) => a.dueAt.localeCompare(b.dueAt));
  if (counted.length === 0) return null;
  const earned = counted.reduce((n, i) => n + (i.score ?? 0), 0);
  const possible = counted.reduce((n, i) => n + i.points, 0);
  const r2 = (n: number) => Math.round(n * 100) / 100;
  return (
    <details className="grade-breakdown">
      <summary className="diff-toggle">
        {counted.length} graded item{counted.length === 1 ? '' : 's'}: {r2(earned)} of {possible} pts
        {total.source === 'halo' && total.pct !== null ? ` · Halo's grade ${total.pct.toFixed(1)}%` : ''}
      </summary>
      <ul className="score-list">
        {counted.map((i) => (
          <li key={i.id}>
            <span className="score-title">{i.label || i.title}</span>
            <span className="mono">
              {r2(i.score ?? 0)} / {i.points}
            </span>
          </li>
        ))}
        <li className="grade-breakdown-total">
          <span className="score-title">Total</span>
          <span className="mono">
            {r2(earned)} / {possible} = {((earned / possible) * 100).toFixed(1)}%
          </span>
        </li>
      </ul>
    </details>
  );
}
