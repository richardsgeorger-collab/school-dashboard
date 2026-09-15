import { useMemo, useState, type ReactNode } from 'react';
import { CourseChip } from '../components/CourseChip';
import { Modal } from '../components/Modal';
import { dateOf, fmtDate, fmtTime, makeIso, zonedParts } from '../domain/dates';
import type { Course, DateStr } from '../domain/types';
import { matchMention, proposalFor, type Proposal } from '../record/match';
import { applyProposal, describeProposal } from '../record/apply';
export { applyProposal, describeProposal };
import type { LectureNotes, Mention } from '../record/notes';
import { useStore } from '../storage/store';

export type Decision = 'approved' | 'dismissed';
export type PlanDecision = 'apply' | 'ask';

const KIND_LABEL: Record<Mention['kind'], string> = { new: 'New', date_change: 'Date change', cancel: 'Cancelled', info: 'Info', grade: 'Grade' };
const GROUPS: { key: string; label: string }[] = [
  { key: 'changed', label: 'Changed dates' },
  { key: 'announce', label: 'From announcements' },
  { key: 'new', label: 'New in Halo' },
  { key: 'missing', label: 'Not in Halo' },
  { key: 'grade', label: 'Grades posted' },
  { key: 'overdue', label: 'Flagged overdue' },
  { key: 'schedule', label: 'Schedule differs' },
  { key: 'rubric', label: 'Found in attached files' },
  { key: 'ENG105-PENDING', label: 'ENG-105, waiting on the section switch' },
  { key: 'OLD-SECTION', label: 'Old Engineering Math section' },
  { key: 'note', label: 'Could not read' },
];
const groupKey = (m: Mention) => m.audit?.prefix ?? m.audit?.status ?? 'other';
const pad = (n: number) => String(n).padStart(2, '0');

function MentionRow({
  m,
  course: fallback,
  lectureDate,
  decision,
  dryRun,
  onDecide,
  plan,
  appliedText,
}: {
  m: Mention;
  course: Course;
  lectureDate: DateStr;
  decision: Decision | undefined;
  dryRun: boolean;
  onDecide: (id: string, d: Decision, applied: string) => void;
  plan?: PlanDecision;
  appliedText?: string;
}) {
  const { data, actions, courseById } = useStore();
  const tz = data.settings.timezone;
  const now = useMemo(() => new Date().toISOString(), []);
  // A mention can name its own class (Halo check spans classes); otherwise it is the review's class.
  const course = (m.courseId && courseById.get(m.courseId)) || fallback;
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

  const approve = () => onDecide(m.id, 'approved', applyProposal(base, m, actions, tz, lectureDate, dryRun, { dueAt, title, points }, data.items));

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
      case 'score':
        return (
          <>
            <b>{p.item.label}</b>: score <span className="old">{p.item.score ?? '—'}</span> → <mark>{p.score}</mark> / {p.item.points}
          </>
        );
      case 'flag':
        return (
          <>
            <mark>Halo says late</mark> — {p.text.replace(/^Halo says /, '')}{' '}
            {p.item.url && (
              <a href={p.item.url} target="_blank" rel="noreferrer" className="diff-toggle">
                Open in Halo
              </a>
            )}
          </>
        );
      default:
        return <>{p.text}</>;
    }
  };

  return (
    <li className="rev-mention" data-decided={decision ?? 'pending'} data-plan={plan ?? 'none'}>
      <div className="rev-kind">
        <span className={`rev-badge kind-${m.kind}`}>{KIND_LABEL[m.kind]}</span>
        <span className="hint">{m.confidence} confidence</span>
        <CourseChip course={course} />
        {plan === 'apply' && !decision && <span className="rev-plan" data-plan="apply">planned</span>}
        {plan === 'ask' && !decision && <span className="rev-plan" data-plan="ask">needs you</span>}
      </div>
      <blockquote className="rev-quote">“{m.quote}”</blockquote>
      {!(decision === 'approved' && appliedText) && <div className="rev-proposal">{proposalLine(base)}</div>}
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
          {decision === 'approved' ? (appliedText ? `Done · ${appliedText}` : 'Approved') : 'Dismissed'}
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
                {base.kind === 'update' ? 'Approve move' : base.kind === 'add' ? 'Add it' : base.kind === 'score' ? 'Record score' : base.kind === 'flag' ? 'Note it on the item' : 'Remove it'}
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
  summary,
  plan,
  applied,
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
  /** The plain-language overview shown above the rows (Halo checks). */
  summary?: ReactNode;
  /** What the overview said it would do per row; planned rows can be applied in one press. */
  plan?: Record<string, PlanDecision>;
  /** What each approval did, shown on the row in place of the proposal. */
  applied?: Record<string, string>;
}) {
  const { data, actions, courseById } = useStore();
  const tz = data.settings.timezone;
  const [showTranscript, setShowTranscript] = useState(false);
  const pending = notes.mentions.filter((m) => !decisions[m.id]).length;
  const planned = plan ? notes.mentions.filter((m) => plan[m.id] === 'apply' && !decisions[m.id]) : [];
  const applyPlanned = () => {
    const now = new Date().toISOString();
    for (const m of planned) {
      const c = (m.courseId && courseById.get(m.courseId)) || course;
      const match = matchMention(m, data.items, c.id);
      const p = proposalFor(m, match, c, tz, lectureDate, now);
      if (p.kind === 'update' || p.kind === 'add' || p.kind === 'score') onDecide(m.id, 'approved', applyProposal(p, m, actions, tz, lectureDate, dryRun, {}, data.items));
    }
  };
  return (
    <Modal title={notes.model === 'capture' ? title : dryRun ? 'Sample lecture review' : 'Lecture notes'} onClose={onClose}>
      <div className="modal-body rev">
        {summary}
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
            {notes.model === 'capture' && notes.mentions.some((m) => m.audit) ? 'Findings' : 'Dates and deadlines mentioned'} <span className="count">{pending ? `${pending} to review` : 'all reviewed'}</span>
          </h3>
          {planned.length > 0 && (
            <p className="rev-apply-all">
              <button type="button" className="btn primary small" onClick={applyPlanned}>
                Apply {planned.length} planned change{planned.length === 1 ? '' : 's'}
              </button>{' '}
              <span className="hint">Each row below can still be changed or dismissed first.</span>
            </p>
          )}
          {notes.mentions.length === 0 ? (
            <p className="hint">Nothing about dates or assignments came up.</p>
          ) : notes.mentions.some((m) => m.audit) ? (
              GROUPS.filter((g) => notes.mentions.some((m) => groupKey(m) === g.key)).map((g) => (
                <div key={g.key} className="rev-group">
                  <h4 className="rev-group-title">
                    {g.label} <span className="count">{notes.mentions.filter((m) => groupKey(m) === g.key).length}</span>
                  </h4>
                  <ul className="rev-mentions">
                    {notes.mentions
                      .filter((m) => groupKey(m) === g.key)
                      .map((m) => (
                        <MentionRow key={m.id} m={m} course={course} lectureDate={lectureDate} decision={decisions[m.id]} dryRun={dryRun} onDecide={onDecide} plan={plan?.[m.id]} appliedText={applied?.[m.id]} />
                      ))}
                  </ul>
                </div>
              ))
            ) : (
            <ul className="rev-mentions">
              {notes.mentions.map((m) => (
                <MentionRow key={m.id} m={m} course={course} lectureDate={lectureDate} decision={decisions[m.id]} dryRun={dryRun} onDecide={onDecide} plan={plan?.[m.id]} appliedText={applied?.[m.id]} />
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
