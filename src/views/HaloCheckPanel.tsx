import { useState } from 'react';
import { buildAuditPrompt, DEFAULT_AUDIT_PROMPT, openItemsFor } from '../halo/audit';
import { cleanStreak } from '../halo/verification';
import { dateOf, fmtDate } from '../domain/dates';
import { useStore } from '../storage/store';

/** The Check Halo prompt, editable as classes change. The planner's item list is added when it is copied. */
export function HaloCheckPanel() {
  const { data, actions, today } = useStore();
  const tz = data.settings.timezone;
  const value = data.settings.haloAuditPrompt ?? DEFAULT_AUDIT_PROMPT;
  const [note, setNote] = useState<string | null>(null);
  const open = openItemsFor(data, tz, today).length;
  const checks = data.settings.haloChecks ?? [];
  const streak = cleanStreak(checks);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(buildAuditPrompt(value, data, tz, today));
      setNote(`Copied the prompt with ${open} open items appended.`);
    } catch {
      setNote('Could not copy. Select the text and copy it by hand.');
    }
  };
  return (
    <section className="card settings-card">
      <h2 className="section-title">Check Halo</h2>
      {checks.length > 0 ? (
        <p className="hint mono">
          {streak >= 2 ? `${streak} clean checks in a row. ` : ''}
          {[...checks]
            .slice(-8)
            .reverse()
            .map((c) => `${fmtDate(dateOf(c.at, tz), 'short')} · ${c.clean ? 'clean' : `${c.findings} finding${c.findings === 1 ? '' : 's'}`}`)
            .join(' · ')}
        </p>
      ) : (
        <p className="hint mono">No checks recorded yet.</p>
      )}
      <h3 className="section-title" style={{ marginTop: 10 }}>Prompt</h3>
      <p className="hint">
        What the Check Halo button copies for Claude in Chrome. Edit it when your classes change. Your open items ({open} right now) are added underneath every time.
      </p>
      <textarea className="halo-prompt" rows={10} value={value} onChange={(e) => actions.updateSettings({ haloAuditPrompt: e.target.value })} aria-label="Check Halo prompt" />
      <div className="settings-actions">
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
