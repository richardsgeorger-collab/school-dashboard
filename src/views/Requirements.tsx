import { useEffect, useState } from 'react';
import { useId } from 'react';
import { gradedOpen, partsLine } from '../domain/requirements';
import { detailFor, shortLine } from '../domain/shortLine';
import type { ClassNote, Course, Item, Requirement } from '../domain/types';
import { useStore } from '../storage/store';

/**
 * The parts of an assignment that the assignment itself does not mention. Each carries its own deadline, its own tick,
 * and the sentence the professor wrote, because the whole reason this exists is that the description is silent.
 */
export function Requirements({ item: passed, compact = false, onMore }: { item: Item; compact?: boolean; onMore?: () => void }) {
  const { data, actions } = useStore();
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
        {list.map((r) => (
          <li key={r.id} data-done={r.done}>
            <ReqLine req={r} check={{ checked: r.done, onChange: () => toggle(r) }} />
          </li>
        ))}
      </ul>
      {hidden > 0 && (
        <button type="button" className="hero-inline" onClick={onMore}>
          {hidden} more
        </button>
      )}
    </section>
  );
}

/**
 * One requirement, readable at a glance: a single short to-do line. Tapping it opens two or three plain sentences
 * (what exactly to do, and the date, count or place that matters) and a link to the full announcement. No file
 * names, quotes or metadata under the line.
 */
export function ReqLine({ req, check, extra }: { req: Pick<Requirement, 'text' | 'detail' | 'dueAt' | 'source'>; check?: { checked: boolean; onChange: () => void }; extra?: string }) {
  const { data } = useStore();
  const [open, setOpen] = useState(false);
  const id = useId();
  const line = shortLine(req.text);
  const detail = [detailFor(req, data.settings.timezone), extra].filter(Boolean).join(' ');
  const post = req.source.kind === 'announcement' && req.source.id ? `#/inbox?a=${req.source.id}` : null;
  return (
    <div className="req-line" data-open={open}>
      <div className="req-line-row">
        {check && <input type="checkbox" checked={check.checked} onChange={check.onChange} aria-label={line} />}
        <button type="button" className="req-line-text" aria-expanded={open} aria-controls={id} onClick={() => setOpen((o) => !o)}>
          {line}
        </button>
      </div>
      {open && (
        <div className="req-line-detail" id={id}>
          {detail && <p>{detail}</p>}
          {post && <a href={post}>See full announcement</a>}
        </div>
      )}
    </div>
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
            <ReqLine req={{ text: n.text, detail: n.detail, dueAt: null, source: n.source }} />
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
