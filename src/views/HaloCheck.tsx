import { useMemo, useState } from 'react';
import { CourseChip } from '../components/CourseChip';
import { Modal } from '../components/Modal';
import { buildAuditPrompt, classifyCheck, HALO_URL, parseAuditResults } from '../halo/audit';
import { clearPendingCheck, pendingCheck, setPendingCheck } from '../halo/checkState';
import { useStore } from '../storage/store';
import { LectureReview, type Decision } from './LectureReview';

/** Where one class's audit lands: paste, read, review. Recorded clean only with proof of full coverage. */
export function HaloCheck({ onClose, onHint, onSwitchClass }: { onClose: () => void; onHint: (text: string) => void; onSwitchClass: () => void }) {
  const { data, today, actions } = useStore();
  const tz = data.settings.timezone;
  const [text, setText] = useState('');
  const [reviewing, setReviewing] = useState(false);
  const [decisions, setDecisions] = useState<Record<string, Decision>>({});
  const [pendingId] = useState(() => pendingCheck()?.courseId ?? null);
  const parsedGuess = useMemo(() => (text.trim() && !pendingId ? parseAuditResults(text, data.courses, today) : null), [text, data.courses, today, pendingId]);
  const course = data.courses.find((c) => c.id === pendingId) ?? data.courses.find((c) => c.id === parsedGuess?.mentions.find((m) => m.courseId)?.courseId) ?? data.courses[0];
  const parsed = useMemo(() => (text.trim() && course ? parseAuditResults(text, data.courses, today, course) : null), [text, data.courses, today, course]);
  const outcome = parsed ? classifyCheck(parsed) : null;

  const record = (findings: number) => {
    if (!course || !outcome) return;
    actions.recordHaloCheck({ at: new Date().toISOString(), courseId: course.id, clean: outcome.clean && findings === 0, partial: outcome.partial, findings, coverage: outcome.coverage, skipped: outcome.skipped });
    clearPendingCheck();
  };
  const again = () => {
    if (!course) return;
    const prompt = buildAuditPrompt(data.settings.haloAuditPrompt, data, tz, today, course);
    void navigator.clipboard?.writeText(prompt).catch(() => undefined);
    window.open(HALO_URL, '_blank', 'noopener');
    setPendingCheck(course.id);
    onHint(`Copied the ${course.code} audit. Paste it into Claude in Chrome on the Halo tab, then come back and press Check Halo.`);
    onClose();
  };

  if (reviewing && parsed && course && outcome) {
    return (
      <LectureReview
        title={`Halo check · ${course.code}`}
        notes={{ summary: [], concepts: [], mentions: parsed.mentions, model: 'capture', createdAt: new Date().toISOString() }}
        transcript={text}
        course={course}
        lectureDate={today}
        dryRun={false}
        decisions={decisions}
        onDecide={(id, d) => setDecisions((s) => ({ ...s, [id]: d }))}
        onClose={() => {
          record(outcome.findings);
          onClose();
        }}
      />
    );
  }

  const findings = outcome?.findings ?? 0;
  const nothingToReview = !!parsed && findings === 0 && (parsed.allMatch || parsed.mentions.length === 0);
  return (
    <Modal title={course ? `Check Halo · ${course.code}` : 'Check Halo'} onClose={onClose}>
      <div className="modal-body">
        <p className="hint">
          {course && (
            <>
              <CourseChip course={course} /> {course.name}.{' '}
            </>
          )}
          Paste what Claude found on the Halo tab. Each difference becomes a row you approve or dismiss; nothing changes until you do.{' '}
          <button type="button" className="diff-toggle" onClick={onSwitchClass}>
            Different class
          </button>
        </p>
        <textarea className="halo-paste" value={text} onChange={(e) => setText(e.target.value)} rows={8} spellCheck={false} placeholder={'COVERAGE PLAN — 11 pages\nVISITED — Topic 1 — 4 items found\nCHM-113 | Topic 3 Quiz | changed | 2026-09-27 23:59 | was 2026-09-25\nCOVERAGE — visited 11 of 11 pages\nALL MATCH'} aria-label="What Claude found" />
        {parsed && outcome && (
          <>
            <p className="hint mono">
              {findings === 0 && parsed.allMatch
                ? 'Halo matches the planner. '
                : `${findings} finding${findings === 1 ? '' : 's'} read${parsed.same ? `, ${parsed.same} match${parsed.same === 1 ? '' : 'es'}` : ''}${parsed.unread.length ? `, ${parsed.unread.length} line${parsed.unread.length === 1 ? '' : 's'} kept as notes` : ''}${parsed.reported != null && parsed.reported !== findings ? ` (Claude counted ${parsed.reported})` : ''}. `}
              {parsed.visited.length > 0 ? `${parsed.visited.length} page${parsed.visited.length === 1 ? '' : 's'} visited. ` : ''}
            </p>
            <p className="hint mono halo-coverage" data-partial={outcome.partial}>
              {outcome.partial ? 'Partial: ' : 'Full coverage: '}
              {outcome.reason}
            </p>
            {outcome.skipped.length > 0 && (
              <ul className="diff-list halo-skipped">
                {outcome.skipped.slice(0, 8).map((l, i) => (
                  <li key={i}>{l}</li>
                ))}
              </ul>
            )}
          </>
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
          {nothingToReview && outcome ? (
            <button
              type="button"
              className="btn primary"
              onClick={() => {
                record(0);
                onHint(outcome.clean ? `${course?.code ?? 'Class'} verified against Halo. Clean.` : `${course?.code ?? 'Class'} recorded as a partial check: ${outcome.reason}`);
                onClose();
              }}
            >
              Record {outcome.clean ? 'clean' : 'partial'} check
            </button>
          ) : (
            <button type="button" className="btn primary" disabled={!parsed || parsed.mentions.length === 0} onClick={() => setReviewing(true)}>
              Review {parsed && parsed.mentions.length > 0 ? `${parsed.mentions.length} finding${parsed.mentions.length === 1 ? '' : 's'}` : ''}
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}
