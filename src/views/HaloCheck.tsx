import { useMemo, useState } from 'react';
import { Modal } from '../components/Modal';
import { buildAuditPrompt, HALO_URL, parseAuditResults } from '../halo/audit';
import { clearPendingCheck, setPendingCheck } from '../halo/checkState';
import { useStore } from '../storage/store';
import { LectureReview, type Decision } from './LectureReview';

/** Where the audit results land: paste, read, review. Nothing is saved until each row is approved. */
export function HaloCheck({ onClose, onHint }: { onClose: () => void; onHint: (text: string) => void }) {
  const { data, today } = useStore();
  const tz = data.settings.timezone;
  const [text, setText] = useState('');
  const [reviewing, setReviewing] = useState(false);
  const [decisions, setDecisions] = useState<Record<string, Decision>>({});
  const parsed = useMemo(() => (text.trim() ? parseAuditResults(text, data.courses, today, tz) : null), [text, data.courses, today, tz]);
  const course = data.courses.find((c) => c.id === parsed?.mentions[0]?.courseId) ?? data.courses[0];

  const again = () => {
    const prompt = buildAuditPrompt(data.settings.haloAuditPrompt, data, tz, today);
    void navigator.clipboard?.writeText(prompt).catch(() => undefined);
    window.open(HALO_URL, '_blank', 'noopener');
    setPendingCheck();
    onHint('Copied. Paste this into Claude in Chrome on the Halo tab, then come back and press Check Halo.');
    onClose();
  };

  if (reviewing && parsed && course) {
    return (
      <LectureReview
        title="Halo check"
        notes={{ summary: [], concepts: [], mentions: parsed.mentions, model: 'capture', createdAt: new Date().toISOString() }}
        transcript={text}
        course={course}
        lectureDate={today}
        dryRun={false}
        decisions={decisions}
        onDecide={(id, d) => setDecisions((s) => ({ ...s, [id]: d }))}
        onClose={() => {
          clearPendingCheck();
          onClose();
        }}
      />
    );
  }

  return (
    <Modal title="Check Halo" onClose={onClose}>
      <div className="modal-body">
        <p className="hint">Paste what Claude found on the Halo tab. Each difference becomes a row you approve or dismiss; nothing changes until you do.</p>
        <textarea className="halo-paste" value={text} onChange={(e) => setText(e.target.value)} rows={8} spellCheck={false} placeholder={'CHM-113 | Topic 3 Quiz | changed | 2026-09-27 23:59 | was 2026-09-25\nESG-162 | Homework 2 | missing | | not in Halo\nor: ALL MATCH'} aria-label="What Claude found" />
        {parsed && (
          <p className="hint mono">
            {parsed.allMatch && parsed.mentions.length === 0
              ? 'Halo matches the planner. Nothing to review.'
              : `${parsed.mentions.length} difference${parsed.mentions.length === 1 ? '' : 's'} read${parsed.same ? `, ${parsed.same} match${parsed.same === 1 ? '' : 'es'}` : ''}${parsed.unread.length ? `, ${parsed.unread.length} line${parsed.unread.length === 1 ? '' : 's'} not understood` : ''}.`}
          </p>
        )}
        {parsed && parsed.unread.length > 0 && (
          <ul className="diff-list">
            {parsed.unread.slice(0, 5).map((l, i) => (
              <li key={i}>{l}</li>
            ))}
          </ul>
        )}
        <div className="modal-actions">
          <button type="button" className="diff-toggle" onClick={again}>
            Copy the prompt and open Halo again
          </button>
          <span className="spacer" />
          <button
            type="button"
            className="btn"
            onClick={() => {
              clearPendingCheck();
              onClose();
            }}
          >
            Not now
          </button>
          <button type="button" className="btn primary" disabled={!parsed || parsed.mentions.length === 0} onClick={() => setReviewing(true)}>
            Review
          </button>
        </div>
      </div>
    </Modal>
  );
}
