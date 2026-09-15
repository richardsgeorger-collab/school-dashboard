import { useState } from 'react';
import { CourseChip } from '../components/CourseChip';
import { dateOf, fmtDate } from '../domain/dates';
import { buildAuditPrompt, DEFAULT_AUDIT_PROMPT, openItemsFor } from '../halo/audit';
import { checksFor, classVerifications } from '../halo/verification';
import type { HaloCheckRecord } from '../domain/types';
import { useStore } from '../storage/store';

const label = (c: HaloCheckRecord) => (c.partial ? `partial${c.skipped?.length ? ` (${c.skipped.length} skipped)` : c.coverage ? ` (${c.coverage.visited}/${c.coverage.planned})` : ''}` : c.clean ? 'clean' : `${c.findings} finding${c.findings === 1 ? '' : 's'}`);

/** Per-class verification history, and the Check Halo prompt, editable as classes change. */
export function HaloCheckPanel() {
  const { data, actions, today, undo } = useStore();
  const tz = data.settings.timezone;
  const value = data.settings.haloAuditPrompt ?? DEFAULT_AUDIT_PROMPT;
  const [note, setNote] = useState<string | null>(null);
  const [courseId, setCourseId] = useState('all');
  const course = data.courses.find((c) => c.id === courseId) ?? null;
  const list = course ? [course] : data.courses;
  const open = list.reduce((n, c) => n + openItemsFor(data, tz, today, c.id).length, 0);
  const vs = classVerifications(data.settings.haloChecks, data.courses, data.items, today, tz);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(buildAuditPrompt(value, data, tz, today, list));
      setNote(course ? `Copied the ${course.code} prompt with its ${open} open item${open === 1 ? '' : 's'}.` : `Copied the all-classes prompt with ${open} open item${open === 1 ? '' : 's'} across ${list.length} classes.`);
    } catch {
      setNote('Could not copy. Select the text and copy it by hand.');
    }
  };
  return (
    <section className="card settings-card">
      <h2 className="section-title">Check Halo</h2>
      {undo && undo.count > 0 && (
        <p className="hint">
          Last sync ({undo.label}, {fmtDate(dateOf(undo.at, tz), 'short')}) changed {undo.count} item{undo.count === 1 ? '' : 's'}.{' '}
          <button type="button" className="btn small" onClick={() => actions.undoLast()}>
            Undo this sync
          </button>
        </p>
      )}
      <p className="hint">Every class, one at a time, each to full depth. Clean means Claude reported every planned page visited and nothing different; partial means coverage fell short.</p>
      <ul className="verify-table">
        {vs.map((v) => {
          const history = checksFor(data.settings.haloChecks, v.course.id).slice(-5).reverse();
          return (
            <li key={v.course.id} data-state={v.state}>
              <span className="verify-class">
                <CourseChip course={v.course} />
              </span>
              <span className="verify-last mono">
                {v.last ? `${fmtDate(dateOf(v.last.at, tz), 'short')} · ${label(v.last)}${v.streak > 1 ? ` · ${v.streak} clean in a row` : ''}` : 'never checked'}
              </span>
              {history.length > 1 && <span className="verify-history mono">{history.slice(1).map((c) => `${fmtDate(dateOf(c.at, tz), 'short')} ${label(c)}`).join(' · ')}</span>}
            </li>
          );
        })}
      </ul>
      <h3 className="section-title" style={{ marginTop: 10 }}>
        Prompt
      </h3>
      <p className="hint">What the Check Halo button copies for Claude in Chrome. Edit it when things change. The class list, today&apos;s date, and each class&apos;s open items fill the slots every time; a resume note fills [RESUME] only when a run is picked up where it stopped.</p>
      <textarea className="halo-prompt" rows={10} value={value} onChange={(e) => actions.updateSettings({ haloAuditPrompt: e.target.value })} aria-label="Check Halo prompt" />
      <div className="settings-actions">
        <select value={courseId} onChange={(e) => setCourseId(e.target.value)} aria-label="Class for the copied prompt">
          <option value="all">All classes</option>
          {data.courses.map((c) => (
            <option key={c.id} value={c.id}>
              {c.code}
            </option>
          ))}
        </select>
        <button type="button" className="btn" onClick={() => void copy()}>
          Copy full prompt
        </button>
        <button type="button" className="btn" disabled={value === DEFAULT_AUDIT_PROMPT} onClick={() => actions.updateSettings({ haloAuditPrompt: null })}>
          Reset to default
        </button>
      </div>
      {note && (
        <p className="hint" style={{ marginTop: 8 }}>
          {note}
        </p>
      )}
    </section>
  );
}
