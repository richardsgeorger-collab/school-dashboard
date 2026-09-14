import { useState } from 'react';
import { buildAuditPrompt, DEFAULT_AUDIT_PROMPT, openItemsFor } from '../halo/audit';
import { useStore } from '../storage/store';

/** The Check Halo prompt, editable as classes change. The planner's item list is added when it is copied. */
export function HaloCheckPanel() {
  const { data, actions, today } = useStore();
  const tz = data.settings.timezone;
  const value = data.settings.haloAuditPrompt ?? DEFAULT_AUDIT_PROMPT;
  const [note, setNote] = useState<string | null>(null);
  const open = openItemsFor(data, tz, today).length;
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
      <h2 className="section-title">Check Halo prompt</h2>
      <p className="hint">
        What the Check Halo button copies for Claude in Chrome. Edit it when your classes change. Your open items ({open} right now) are added underneath every time.
      </p>
      <textarea className="halo-paste" rows={10} value={value} onChange={(e) => actions.updateSettings({ haloAuditPrompt: e.target.value })} aria-label="Check Halo prompt" />
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
