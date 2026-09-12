import { useState } from 'react';
import { CourseChip, useCourseColor } from '../components/CourseChip';
import { dateOf, fmtDate } from '../domain/dates';
import { courseGrade } from '../domain/grades';
import type { Course, Item } from '../domain/types';
import { useStore } from '../storage/store';
import { WhatIf } from './WhatIf';

function ScoreInput({ item }: { item: Item }) {
  const { actions } = useStore();
  const [val, setVal] = useState(item.score === null ? '' : String(item.score));
  const commit = () => {
    const score = val.trim() === '' ? null : Number(val);
    if (score === item.score || (score !== null && Number.isNaN(score))) return;
    actions.upsertItem({ ...item, score, status: score !== null && item.status !== 'done' ? 'done' : item.status, completedAt: score !== null ? (item.completedAt ?? new Date().toISOString()) : item.completedAt });
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
  const { data } = useStore();
  const color = useCourseColor(course);
  const g = courseGrade(course.id, data.items);
  const [expanded, setExpanded] = useState(false);
  const [whatIf, setWhatIf] = useState(false);
  const items = data.items.filter((i) => i.courseId === course.id).sort((a, b) => a.dueAt.localeCompare(b.dueAt));
  const gradedPct = g.totalPossible ? (g.possibleGraded / g.totalPossible) * 100 : 0;

  return (
    <section className="card grade-card" style={{ '--course': color } as React.CSSProperties}>
      <header className="grade-head">
        <div>
          <CourseChip course={course} />
          <h2 className="grade-name">{course.name}</h2>
        </div>
        <div className="grade-pct mono">{g.pct === null ? '—' : `${g.pct}%`}</div>
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
            <dd>{g.projected === null ? '—' : `${g.projected}%`}</dd>
          </div>
        </dl>
      )}
      <div className="settings-actions">
        <button type="button" className="btn small" onClick={() => setExpanded((e) => !e)} aria-expanded={expanded}>
          {expanded ? 'Hide scores' : `Enter scores (${items.length} items)`}
        </button>
        <button type="button" className="btn small" onClick={() => setWhatIf((w) => !w)} aria-expanded={whatIf}>
          {whatIf ? 'Hide what-if' : 'What if'}
        </button>
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
              <ScoreInput item={i} />
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
        None of the syllabi publish category weights, so this is points earned over points graded. Projected assumes the
        rest of the term scores at your current average. Enter a score to mark an item graded.
      </p>
      <div className="grade-grid">
        {data.courses.map((c) => (
          <CourseCard key={c.id} course={c} />
        ))}
      </div>
    </>
  );
}
