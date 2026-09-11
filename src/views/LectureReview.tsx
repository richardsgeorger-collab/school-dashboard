import { useMemo, useState } from 'react';
import { CourseChip } from '../components/CourseChip';
import { Modal } from '../components/Modal';
import { dateOf, fmtDate, fmtTime, makeIso, zonedParts } from '../domain/dates';
import type { Course, DateStr } from '../domain/types';
import { matchMention, proposalFor, type Proposal } from '../record/match';
import type { LectureNotes, Mention } from '../record/notes';
import { useStore } from '../storage/store';

export type Decision = 'approved' | 'dismissed';

const KIND_LABEL: Record<Mention['kind'], string> = { new: 'New', date_change: 'Date change', cancel: 'Cancelled', info: 'Info' };
const pad = (n: number) => String(n).padStart(2, '0');

function MentionRow({
  m,
  course,
  lectureDate,
  decision,
  dryRun,
  onDecide,
}: {
  m: Mention;
  course: Course;
  lectureDate: DateStr;
  decision: Decision | undefined;
  dryRun: boolean;
  onDecide: (id: string, d: Decision, applied: string) => void;
}) {
  const { data, actions } = useStore();
  const tz = data.settings.timezone;
  const now = useMemo(() => new Date().toISOString(), []);
  const match = useMemo(() => matchMention(m, data.items, course.id), [m, data.items, course.id]);
  const base = useMemo(() => proposalFor(m, match, course, tz, lectureDate, now), [m, match, course, tz, lectureDate, now]);
  const initialDue = base.kind === 'update' ? base.dueAt : base.kind === 'add' ? base.item.dueAt : null;
  const [date, setDate] = useState<string>(initialDue ? dateOf(initialDue, tz) : m.date ?? lectureDate);
  const [time, setTime] = useState<string>(() => {
    if (!initialDue) return m.time ?? '23:59';
    const p = zonedParts(initialDue, tz);
    return `${pad(p.hh)}:${pad(p.mm)}`;
  });
  const [title, setTitle] = useState(base.kind === 'add' ? base.item.title : m.title);
  const [points, setPoints] = useState(base.kind === 'add' ? base.item.points : m.points ?? 0);

  const when = (iso: string) => `${fmtDate(dateOf(iso, tz), 'short')} ${fmtTime(iso, tz)}`;
  const dueAt = makeIso(date, time || '23:59', tz);

  const approve = () => {
    let applied = '';
    if (base.kind === 'update') {
      applied = `${base.item.label} now due ${when(dueAt)}`;
      if (!dryRun) actions.upsertItem({ ...base.item, dueAt, notes: `${base.item.notes ? `${base.item.notes}\n` : ''}Moved per the ${lectureDate} lecture: "${m.quote}"` });
    } else if (base.kind === 'add') {
      const item = { ...base.item, title: title.trim() || base.item.title, points, dueAt };
      applied = `Added ${item.title}, due ${when(dueAt)}`;
      if (!dryRun) actions.upsertItem(item);
    } else if (base.kind === 'remove') {
      applied = `Removed ${base.item.label}`;
      if (!dryRun) actions.deleteItem(base.item.id);
    } else {
      applied = 'Noted';
    }
    onDecide(m.id, 'approved', applied);
  };

  const proposalLine = (p: Proposal) => {
    switch (p.kind) {
      case 'update':
        return (
          <>
            Move <b>{p.item.label}</b>: <span className="old">{when(p.item.dueAt)}</span> → <mark>{when(dueAt)}</mark>
          </>
        );
      case 'add':
        return (
          <>
            Add to <b>{course.code}</b>, due <mark>{when(dueAt)}</mark>
          </>
        );
      case 'remove':
        return (
          <>
            Remove <b>{p.item.label}</b> from the planner
          </>
        );
      default:
        return <>{p.text}</>;
    }
  };

  return (
    <li className="rev-mention" data-decided={decision ?? 'pending'}>
      <div className="rev-kind">
        <span className={`rev-badge kind-${m.kind}`}>{KIND_LABEL[m.kind]}</span>
        <span className="hint">{m.confidence} confidence</span>
        {match && base.kind !== 'add' && <CourseChip course={course} />}
      </div>
      <blockquote className="rev-quote">“{m.quote}”</blockquote>
      <div className="rev-proposal">{proposalLine(base)}</div>
      {!decision && (base.kind === 'update' || base.kind === 'add') && (
        <div className="rev-edit">
          {base.kind === 'add' && (
            <label className="field">
              <span>Title</span>
              <input value={title} onChange={(e) => setTitle(e.target.value)} />
            </label>
          )}
          <label className="field">
            <span>Date</span>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
          <label className="field">
            <span>Time</span>
            <input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
          </label>
          {base.kind === 'add' && (
            <label className="field">
              <span>Points</span>
              <input type="number" min={0} value={points} onChange={(e) => setPoints(Number(e.target.value))} />
            </label>
          )}
        </div>
      )}
      {decision ? (
        <p className="rev-decided">
          {decision === 'approved' ? 'Approved' : 'Dismissed'}
          {dryRun && decision === 'approved' && ' (preview, nothing saved)'}
        </p>
      ) : (
        <div className="rev-actions">
          {base.kind === 'confirm' || base.kind === 'none' ? (
            <button type="button" className="btn small" onClick={() => onDecide(m.id, 'dismissed', '')}>
              OK
            </button>
          ) : (
            <>
              <button type="button" className={`btn small ${base.kind === 'remove' ? 'danger' : 'primary'}`} onClick={approve}>
                {base.kind === 'update' ? 'Approve move' : base.kind === 'add' ? 'Add it' : 'Remove it'}
              </button>
              <button type="button" className="btn small" onClick={() => onDecide(m.id, 'dismissed', '')}>
                Dismiss
              </button>
            </>
          )}
        </div>
      )}
    </li>
  );
}

export function LectureReview({
  title,
  notes,
  transcript,
  course,
  lectureDate,
  dryRun,
  decisions,
  onDecide,
  onClose,
}: {
  title: string;
  notes: LectureNotes;
  transcript: string;
  course: Course;
  lectureDate: DateStr;
  dryRun: boolean;
  decisions: Record<string, Decision>;
  onDecide: (id: string, d: Decision, applied: string) => void;
  onClose: () => void;
}) {
  const [showTranscript, setShowTranscript] = useState(false);
  const pending = notes.mentions.filter((m) => !decisions[m.id]).length;
  return (
    <Modal title={dryRun ? 'Sample lecture review' : 'Lecture notes'} onClose={onClose}>
      <div className="modal-body rev">
        <p className="hint mono">
          {title} · {fmtDate(lectureDate, 'long')} · {notes.model === 'sample' ? 'sample, not a real recording' : notes.model === 'capture' ? 'typed by you' : `by ${notes.model}`}
        </p>
        {dryRun && <p className="rev-dry">Preview. Approving here shows what would happen and saves nothing.</p>}
        {notes.summary.length > 0 && (
        <section>
          <h3>Summary</h3>
          <ul className="rev-summary">
            {notes.summary.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </section>
        )}
        {notes.concepts.length > 0 && (
          <section>
            <h3>Concepts</h3>
            <div className="rev-concepts">
              {notes.concepts.map((c) => (
                <span key={c} className="chip">
                  {c}
                </span>
              ))}
            </div>
          </section>
        )}
        <section>
          <h3>
            Dates and deadlines mentioned <span className="count">{pending ? `${pending} to review` : 'all reviewed'}</span>
          </h3>
          {notes.mentions.length === 0 ? (
            <p className="hint">Nothing about dates or assignments came up.</p>
          ) : (
            <ul className="rev-mentions">
              {notes.mentions.map((m) => (
                <MentionRow key={m.id} m={m} course={course} lectureDate={lectureDate} decision={decisions[m.id]} dryRun={dryRun} onDecide={onDecide} />
              ))}
            </ul>
          )}
          <p className="hint">Nothing enters the planner until you approve it here. Each approval is one item.</p>
        </section>
        <section>
          {notes.model !== 'capture' && (
            <button type="button" className="diff-toggle" onClick={() => setShowTranscript((s) => !s)}>
              {showTranscript ? 'Hide transcript' : 'Show transcript'}
            </button>
          )}
          {showTranscript && <pre className="rev-transcript">{transcript}</pre>}
        </section>
        <div className="modal-actions">
          <span className="spacer" />
          <button type="button" className="btn primary" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </Modal>
  );
}
