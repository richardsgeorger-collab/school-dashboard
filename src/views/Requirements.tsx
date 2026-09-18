import { dateOf, fmtDate, fmtTime } from '../domain/dates';
import { gradedOpen, partsLine } from '../domain/requirements';
import type { ClassNote, Course, Item, Requirement } from '../domain/types';
import { useStore } from '../storage/store';

/**
 * The parts of an assignment that the assignment itself does not mention. Each carries its own deadline, its own tick,
 * and the sentence the professor wrote, because the whole reason this exists is that the description is silent.
 */
export function Requirements({ item: passed }: { item: Item }) {
  const { data, actions, today } = useStore();
  const tz = data.settings.timezone;
  // The panel is opened with a copy of the item; ticking a part has to redraw against the live one.
  const item = data.items.find((i) => i.id === passed.id) ?? passed;
  const list = item.requirements ?? [];
  if (list.length === 0) return null;

  const toggle = (r: Requirement) => {
    const now = new Date().toISOString();
    actions.upsertItem({ ...item, requirements: list.map((x) => (x.id === r.id ? { ...x, done: !x.done, doneAt: x.done ? null : now } : x)) });
  };
  const open = gradedOpen(item);

  return (
    <section className="reqs" aria-label="What this also requires">
      <p className="hint">
        <b>Also required</b> <span className="mono muted">· {partsLine(item)}</span>
        {open.length > 0 && item.status === 'done' && <span className="reqs-warn">not finished: {open.length} part{open.length === 1 ? '' : 's'} still open</span>}
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
              <span className="hint mono reqs-meta">
                {r.dueAt ? `${late ? 'was due ' : 'due '}${fmtDate(dateOf(r.dueAt, tz), 'short')} ${fmtTime(r.dueAt, tz)}` : 'with the assignment'}
                {!r.gradedOn && ' · not graded'}
                {r.redefinesDone && ' · changes what full credit means'}
              </span>
              <SourceLine source={r.source} />
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** Where it came from, quoted, with a link back to the post. Nothing is attached without this. */
export function SourceLine({ source }: { source: Requirement['source'] }) {
  if (!source.quote) return null;
  const label = source.kind === 'announcement' ? 'Your instructor posted' : source.kind === 'syllabus' ? 'The syllabus says' : 'From your notes';
  return (
    <span className="reqs-src hint">
      {label}
      {source.title ? ` in "${source.title}"` : ''}: <q>{source.quote}</q>
      {source.kind === 'announcement' && source.id && (
        <>
          {' '}
          <a href={`#/news?a=${source.id}`}>read it</a>
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
  const notes = (course.notes ?? []).filter((n) => !n.seenAt);
  if (notes.length === 0) return null;
  const dismiss = (n: ClassNote) =>
    actions.upsertCourse({ ...course, notes: (course.notes ?? []).map((x) => (x.id === n.id ? { ...x, seenAt: new Date().toISOString() } : x)) });
  return (
    <section className="card class-notes" aria-label="Worth knowing in this class">
      <h2 className="section-title">Worth knowing</h2>
      <ul className="reqs-list">
        {notes.map((n) => (
          <li key={n.id}>
            <span className="reqs-text">{n.text}</span>
            <SourceLine source={n.source} />
            <button type="button" className="muted reqs-dismiss" onClick={() => dismiss(n)}>
              got it
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
