import { useEffect, useState } from 'react';
import { dateOf, fmtDate, fmtTime } from '../domain/dates';
import { gradedOpen, partsLine } from '../domain/requirements';
import type { ClassNote, Course, Item, Requirement } from '../domain/types';
import { useStore } from '../storage/store';

/**
 * The parts of an assignment that the assignment itself does not mention. Each carries its own deadline, its own tick,
 * and the sentence the professor wrote, because the whole reason this exists is that the description is silent.
 */
export function Requirements({ item: passed, compact = false, onMore }: { item: Item; compact?: boolean; onMore?: () => void }) {
  const { data, actions, today } = useStore();
  const tz = data.settings.timezone;
  // The panel is opened with a copy of the item; ticking a part has to redraw against the live one.
  const item = data.items.find((i) => i.id === passed.id) ?? passed;
  const all = item.requirements ?? [];
  // Compact (the hero card): the open parts only, three at most, each with its source one tap away.
  const list = compact ? all.filter((r) => !r.done).slice(0, 3) : all;
  if (list.length === 0) return null;

  const toggle = (r: Requirement) => {
    const now = new Date().toISOString();
    actions.upsertItem({ ...item, requirements: list.map((x) => (x.id === r.id ? { ...x, done: !x.done, doneAt: x.done ? null : now } : x)) });
  };
  const open = gradedOpen(item);

  const fromPosts = all.some((r) => r.source.kind === 'announcement');
  const hidden = compact ? all.filter((r) => !r.done).length - list.length : 0;
  return (
    <section className={compact ? 'reqs reqs-compact' : 'reqs'} aria-label="What this also requires">
      <p className="hint">
        <b>Also required</b> <span className="mono muted">· {compact && fromPosts ? `${all.length} part${all.length === 1 ? '' : 's'} from announcements` : partsLine(item)}</span>
        {!compact && open.length > 0 && item.status === 'done' && <span className="reqs-warn">not finished: {open.length} part{open.length === 1 ? '' : 's'} still open</span>}
      </p>
      <ul className="reqs-list">
        {list.map((r) => {
          const late = !r.done && r.dueAt && dateOf(r.dueAt, tz) < today;
          return (
            <li key={r.id} data-done={r.done} data-late={!!late}>
              <label className="reqs-row">
                <input type="checkbox" checked={r.done} onChange={() => toggle(r)} />
                <span className="reqs-text">{r.text}</span>
              </label>
              {compact ? (
                (r.dueAt || r.redefinesDone) && (
                  <span className="hint mono reqs-meta">
                    {r.dueAt ? `${late ? 'was due ' : 'due '}${fmtDate(dateOf(r.dueAt, tz), 'short')}` : ''}
                    {r.dueAt && r.redefinesDone ? ' · ' : ''}
                    {r.redefinesDone ? 'changes what full credit means' : ''}
                  </span>
                )
              ) : (
                <span className="hint mono reqs-meta">
                  {r.dueAt ? `${late ? 'was due ' : 'due '}${fmtDate(dateOf(r.dueAt, tz), 'short')} ${fmtTime(r.dueAt, tz)}` : 'with the assignment'}
                  {!r.gradedOn && ' · not graded'}
                  {r.redefinesDone && ' · changes what full credit means'}
                </span>
              )}
              <SourceLine source={r.source} compact={compact} />
            </li>
          );
        })}
      </ul>
      {hidden > 0 && (
        <button type="button" className="hero-inline" onClick={onMore}>
          {hidden} more
        </button>
      )}
    </section>
  );
}

/** Where it came from, quoted, with a link back to the post. Nothing is attached without this. */
export function SourceLine({ source, compact = false }: { source: Requirement['source']; compact?: boolean }) {
  if (!source.quote) return null;
  const label = source.kind === 'announcement' ? 'Your instructor posted' : source.kind === 'syllabus' ? 'The syllabus says' : 'From your notes';
  // Compact: one word that carries the quote, and the link to the post. The full sentence is one hover or tap away.
  if (compact) {
    const href = source.kind === 'announcement' && source.id ? `#/inbox?a=${source.id}` : undefined;
    return (
      <a className="part-source" href={href} title={`${label}${source.title ? ` in "${source.title}"` : ''}: ${source.quote}`}>
        source
      </a>
    );
  }
  return (
    <span className="reqs-src hint">
      {label}
      {source.title ? ` in "${source.title}"` : ''}: <q>{source.quote}</q>
      {source.kind === 'announcement' && source.id && (
        <>
          {' '}
          <a href={`#/inbox?a=${source.id}`}>read it</a>
        </>
      )}
    </span>
  );
}

/**
 * Findings that belong to the class rather than to one assignment, including everything that fitted no category.
 * A finding nobody could classify is still a finding, so it gets a place to live rather than being dropped.
 */
export function ClassNotes({ course }: { course: Course }) {
  const { actions } = useStore();
  const [undo, setUndo] = useState<ClassNote | null>(null);
  useEffect(() => {
    if (!undo) return;
    const t = setTimeout(() => setUndo(null), 6000);
    return () => clearTimeout(t);
  }, [undo]);
  const notes = (course.notes ?? []).filter((n) => !n.seenAt);
  const mark = (n: ClassNote, seenAt: string | null) => actions.upsertCourse({ ...course, notes: (course.notes ?? []).map((x) => (x.id === n.id ? { ...x, seenAt } : x)) });
  // "Got it" hides the note; for six seconds one tap brings it back.
  const dismiss = (n: ClassNote) => {
    mark(n, new Date().toISOString());
    setUndo(n);
  };
  if (notes.length === 0 && !undo) return <p className="hint">Nothing worth knowing beyond the assignments themselves.</p>;
  return (
    <section className="card class-notes" aria-label="Worth knowing in this class">
      <h2 className="section-title">Worth knowing</h2>
      <ul className="reqs-list">
        {notes.map((n) => (
          <li key={n.id}>
            <span className="reqs-text">{n.text}</span>
            <SourceLine source={n.source} compact />
            <button type="button" className="muted reqs-dismiss" onClick={() => dismiss(n)}>
              Got it
            </button>
          </li>
        ))}
      </ul>
      {undo && (
        <p className="undo-line" role="status">
          Hidden.{' '}
          <button
            type="button"
            className="hero-inline"
            onClick={() => {
              mark(undo, null);
              setUndo(null);
            }}
          >
            Undo
          </button>
        </p>
      )}
    </section>
  );
}
