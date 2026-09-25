import { useState } from 'react';
import { CourseChip, useCourseColor } from '../components/CourseChip';
import { EmptyState } from '../components/EmptyState';
import { useAccount } from '../auth/AccountContext';
import { LockTag } from '../config/Locked';
import { useCan } from '../config/useCan';
import { dateOf, fmtDate } from '../domain/dates';
import { courseGrade, letterFor } from '../domain/grades';
import type { Course, Item } from '../domain/types';
import { useStore } from '../storage/store';
import { WhatIf } from './WhatIf';
import { conceptLine, conceptWarnings } from '../domain/concepts';
import { weakLine, weakTopicFor } from '../domain/weak';
import { gradeFloor } from '../domain/floor';
import { QuizLink } from './Quiz';

function ScoreInput({ item }: { item: Item }) {
  const { actions } = useStore();
  const [val, setVal] = useState(item.score === null ? '' : String(item.score));
  const commit = () => {
    const score = val.trim() === '' ? null : Number(val);
    if (score === item.score || (score !== null && Number.isNaN(score))) return;
    actions.upsertItem({ ...item, score, scoreSource: score === null ? null : 'manual', status: score !== null && item.status !== 'done' ? 'done' : item.status, completedAt: score !== null ? (item.completedAt ?? new Date().toISOString()) : item.completedAt });
  };
  return (
    <span className="score-input mono">
      <input
        type="number"
        inputMode="decimal"
        min={0}
        step={0.5}
        value={val}
        placeholder="—"
        aria-label={`Score for ${item.title}`}
        onChange={(e) => setVal(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
      />
      <span>/ {item.points}</span>
    </span>
  );
}

function CourseCard({ course }: { course: Course }) {
  const { data, today } = useStore();
  const color = useCourseColor(course);
  const concept = conceptLine(conceptWarnings(data.courses, data.items, data.settings.topicLinks ?? [], data.settings.quizStats, today, data.settings.timezone).filter((w) => w.courseId === course.id), 6);
  const weak = concept ?? weakLine(course, data.items, data.settings.quizStats, today, data.settings.timezone);
  const floor = gradeFloor(course.id, data.items);
  const g = courseGrade(course.id, data.items);
  const [expanded, setExpanded] = useState(false);
  const [whatIf, setWhatIf] = useState(false);
  const canProject = useCan('gradeProjection');
  const { tier } = useAccount();
  const items = data.items.filter((i) => i.courseId === course.id).sort((a, b) => a.dueAt.localeCompare(b.dueAt));
  const gradedPct = g.totalPossible ? (g.possibleGraded / g.totalPossible) * 100 : 0;

  return (
    <section className="card grade-card" style={{ '--course': color } as React.CSSProperties}>
      <header className="grade-head">
        <div>
          <CourseChip course={course} link />
          <h2 className="grade-name">
            <a href={`#/class?c=${course.id}`} className="plain-link">
              {course.name}
            </a>
          </h2>
        </div>
        <div className="grade-pct mono">{g.pct === null ? '—' : `${g.pct}%`}{letterFor(g.pct, course.gradeScale) ? <span className="grade-letter"> {letterFor(g.pct, course.gradeScale)}</span> : null}</div>
      </header>
      <div className="grade-bar" aria-hidden>
        <span className="earned" style={{ width: `${g.totalPossible ? (g.earned / g.totalPossible) * 100 : 0}%` }} />
        <span className="lost" style={{ width: `${g.totalPossible ? ((g.possibleGraded - g.earned) / g.totalPossible) * 100 : 0}%` }} />
      </div>
      {g.possibleGraded === 0 ? (
        <p className="grade-empty mono">
          No scores entered yet · {g.totalPossible} pts across {items.length} item{items.length === 1 ? '' : 's'}
        </p>
      ) : (
        <dl className="grade-stats mono">
          <div>
            <dt>Earned</dt>
            <dd>
              {g.earned} / {g.possibleGraded}
            </dd>
          </div>
          <div>
            <dt>Graded so far</dt>
            <dd>{Math.round(gradedPct)}%</dd>
          </div>
          <div>
            <dt>Still open</dt>
            <dd>
              {g.remaining} of {g.totalPossible} pts
            </dd>
          </div>
          <div>
            <dt>Projected</dt>
            <dd>{canProject ? (g.projected === null ? '—' : `${g.projected}%`) : <LockTag feature="gradeProjection" tier={tier} />}</dd>
          </div>
        </dl>
      )}
      {floor.line && (
        <p className="grade-floor">
          {floor.line}
          {floor.zeroLine && <span className="hint"> {floor.zeroLine}</span>}
        </p>
      )}
      {weak && (
        <p className="hint grade-weak">
          {weak} <QuizLink courseId={course.id} topic={weakTopicFor(course, data.items, data.settings.quizStats) ?? undefined} />
        </p>
      )}
      <div className="settings-actions">
        <button type="button" className="btn small" onClick={() => setExpanded((e) => !e)} aria-expanded={expanded}>
          {expanded ? 'Hide scores' : 'Scores'}
        </button>
        {canProject && (
          <button type="button" className="btn small" onClick={() => setWhatIf((w) => !w)} aria-expanded={whatIf}>
            {whatIf ? 'Hide what-if' : 'What if'}
          </button>
        )}
      </div>
      {whatIf && <WhatIf course={course} />}
      {expanded && (
        <ul className="score-list">
          {items.map((i) => (
            <li key={i.id}>
              <span className="score-title">
                {i.title}
                <span className="muted mono"> · {fmtDate(dateOf(i.dueAt, data.settings.timezone), 'short')}</span>
              </span>
              <span className="score-cell">
                <ScoreInput item={i} />
                {i.score !== null && <span className="hint mono">{i.scoreSource === 'manual' ? 'typed' : 'Halo'}</span>}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function Grades() {
  const { data } = useStore();
  return (
    <>
      <h1 className="page-title">
        Grades <span className="light">by points</span>
      </h1>
      <p className="hint" style={{ marginTop: 6, maxWidth: 640 }}>
        Scores arrive from Halo&apos;s gradebook through the Sync button. None of the syllabi publish category weights, so this is points earned over points
        graded, and Projected assumes the rest of the term scores at your current average. Typing a score is an override for when Halo is wrong or missing.
      </p>
      {data.courses.length === 0 ? (
        <EmptyState>Grades arrive with your first Halo sync, one card per class.</EmptyState>
      ) : (
        <div className="grade-grid">
          {data.courses.map((c) => (
            <CourseCard key={c.id} course={c} />
          ))}
        </div>
      )}
    </>
  );
}
