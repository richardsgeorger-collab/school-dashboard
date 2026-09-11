import { useEffect, useMemo, useState } from 'react';
import { Modal } from '../components/Modal';
import { parseCapture } from '../capture/parse';
import { fmtDate } from '../domain/dates';
import { useStore } from '../storage/store';
import { LectureReview, type Decision } from './LectureReview';

const EXAMPLES = ['chem quiz moved to friday', 'read ch 4 before wednesday', 'office hours thursday 2pm'];
const KIND_WORD = { new: 'New item', date_change: 'Date change', cancel: 'Cancelled', info: 'Note' } as const;

/**
 * One line in, one proposal out. The escape hatch for anything the export does not know:
 * what a professor said, what changed, what you noticed. Nothing is saved until approved on the review screen.
 */
export function QuickCapture({ onClose }: { onClose: () => void }) {
  const { data, today } = useStore();
  const [text, setText] = useState('');
  const [courseId, setCourseId] = useState<string>('');
  const [reviewing, setReviewing] = useState(false);
  const [decisions, setDecisions] = useState<Record<string, Decision>>({});
  const parsed = useMemo(() => (text.trim() ? parseCapture(text, data.courses, today) : null), [text, data.courses, today]);
  useEffect(() => {
    if (parsed?.courseId) setCourseId(parsed.courseId);
  }, [parsed?.courseId]);
  const course = data.courses.find((c) => c.id === (courseId || parsed?.courseId || '')) ?? null;
  const m = parsed?.mention ?? null;
  const ready = !!m && !!course && (!!m.date || m.kind === 'cancel' || m.kind === 'info');

  if (reviewing && m && course) {
    return (
      <LectureReview
        title="Quick capture"
        notes={{ summary: [], concepts: [], mentions: [m], model: 'capture', createdAt: new Date().toISOString() }}
        transcript={text}
        course={course}
        lectureDate={today}
        dryRun={false}
        decisions={decisions}
        onDecide={(id, d) => {
          setDecisions((s) => ({ ...s, [id]: d }));
          setTimeout(onClose, 600);
        }}
        onClose={onClose}
      />
    );
  }

  return (
    <Modal title="Quick capture" onClose={onClose}>
      <div className="modal-body">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (ready) setReviewing(true);
          }}
        >
          <input
            className="capture-input"
            autoFocus
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="chem quiz moved to friday"
            aria-label="What happened"
            autoComplete="off"
            enterKeyHint="go"
          />
          {!text.trim() && (
            <p className="hint">
              Try:{' '}
              {EXAMPLES.map((ex) => (
                <button key={ex} type="button" className="diff-toggle" style={{ marginRight: 10 }} onClick={() => setText(ex)}>
                  {ex}
                </button>
              ))}
            </p>
          )}
          {m && (
            <div className="capture-read">
              <span className={`rev-badge kind-${m.kind}`}>{KIND_WORD[m.kind]}</span>
              <span>
                <b>{m.title}</b>
              </span>
              <span className="mono">{m.date ? `${fmtDate(m.date, 'long')}${m.time ? ` ${m.time}` : ''}` : 'no date found'}</span>
              {m.points != null && <span className="mono">{m.points} pts</span>}
              <label className="capture-class">
                <span className="visually-hidden">Class</span>
                <select value={courseId || parsed?.courseId || ''} onChange={(e) => setCourseId(e.target.value)} aria-label="Class">
                  <option value="">Which class?</option>
                  {data.courses.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.code}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}
          {m && !m.date && m.kind !== 'cancel' && m.kind !== 'info' && <p className="hint">Add a day, like &ldquo;friday&rdquo;, &ldquo;tomorrow&rdquo;, or &ldquo;sep 25&rdquo;.</p>}
          <div className="modal-actions">
            <span className="hint">⌘K opens this anywhere.</span>
            <span className="spacer" />
            <button type="submit" className="btn primary" disabled={!ready}>
              Review
            </button>
          </div>
        </form>
      </div>
    </Modal>
  );
}
