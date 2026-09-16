import { useState } from 'react';
import { Modal } from '../components/Modal';
import { fmtDate, fmtMinutes } from '../domain/dates';
import type { Confidence, Course } from '../domain/types';
import { countSelected, defaultPlanSelection, gateKey, type PlanSelection } from '../ingest/apply';
import type { PlanDiff } from '../ingest/diff';

/** A small tag when the model was unsure. High confidence says nothing. */
export function Sure({ c }: { c: Confidence }) {
  if (c === 'high') return null;
  return <span className={`ai-sure ai-sure-${c}`}>{c === 'low' ? 'unsure' : 'likely'}</span>;
}

function Section({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  if (count === 0) return null;
  return (
    <section className="diff-section">
      <h3 className="rev-group-title">
        {title} <span className="count">{count}</span>
      </h3>
      <ul className="diff-list plan-review-list">{children}</ul>
    </section>
  );
}

function toggle<T>(set: Set<T>, key: T): Set<T> {
  const next = new Set(set);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  return next;
}

/**
 * The AI plan's changes, checked by default, for the student to approve. Same flow as a Halo sync: nothing here is
 * written until Apply. What is unchecked is remembered and not suggested again.
 */
export function PlanReview({ course, diff, onApply, onClose }: { course: Course; diff: PlanDiff; onApply: (sel: PlanSelection) => void; onClose: () => void }) {
  const [sel, setSel] = useState<PlanSelection>(() => defaultPlanSelection(diff));
  const n = countSelected(sel);
  return (
    <Modal title={`AI plan · ${course.code}`} onClose={onClose}>
      <div className="modal-body">
        <p className="hint">Checked lines are written when you apply. Unchecked ones are remembered and never suggested again. Your own dates, estimates, notes, and progress are never touched.</p>
        <Section title="Start by" count={diff.startBy.length}>
          {diff.startBy.map((c) => (
            <li key={c.itemId}>
              <label className="plan-line">
                <input type="checkbox" checked={sel.startBy.has(c.itemId)} onChange={() => setSel({ ...sel, startBy: toggle(sel.startBy, c.itemId) })} />
                <span>
                  <b>{c.label}</b> <span className="mono">{c.from ? `${fmtDate(c.from, 'short')} → ` : ''}{fmtDate(c.to, 'short')}</span> <Sure c={c.confidence} />
                  {c.why && <span className="hint plan-why">{c.why}</span>}
                </span>
              </label>
            </li>
          ))}
        </Section>
        <Section title="Effort" count={diff.minutes.length}>
          {diff.minutes.map((c) => (
            <li key={c.itemId}>
              <label className="plan-line">
                <input type="checkbox" checked={sel.minutes.has(c.itemId)} onChange={() => setSel({ ...sel, minutes: toggle(sel.minutes, c.itemId) })} />
                <span>
                  <b>{c.label}</b> <span className="mono">{c.from !== null ? `${fmtMinutes(c.from)} → ` : ''}{fmtMinutes(c.to)}</span> <Sure c={c.confidence} />
                  {c.why && <span className="hint plan-why">{c.why}</span>}
                </span>
              </label>
            </li>
          ))}
        </Section>
        <Section title="Milestones" count={diff.steps.length}>
          {diff.steps.map((s) => (
            <li key={s.itemId}>
              <label className="plan-line">
                <input type="checkbox" checked={sel.steps.has(s.itemId)} onChange={() => setSel({ ...sel, steps: toggle(sel.steps, s.itemId) })} />
                <span>
                  <b>{s.label}</b> <span className="hint plan-why">{s.steps.join(' → ')}</span>
                </span>
              </label>
            </li>
          ))}
        </Section>
        <Section title="Prerequisites" count={diff.gates.length}>
          {diff.gates.map((g) => (
            <li key={gateKey(g.from, g.to)}>
              <label className="plan-line">
                <input type="checkbox" checked={sel.gates.has(gateKey(g.from, g.to))} onChange={() => setSel({ ...sel, gates: toggle(sel.gates, gateKey(g.from, g.to)) })} />
                <span>
                  <b>{g.fromLabel}</b> comes before <b>{g.toLabel}</b>
                  <span className="hint plan-why">
                    {g.why} <span className="mono muted">· {g.source}</span>
                  </span>
                </span>
              </label>
            </li>
          ))}
        </Section>
        <Section title="Flags" count={diff.flags.length}>
          {diff.flags.map((f) => (
            <li key={f.itemId}>
              <label className="plan-line">
                <input type="checkbox" checked={sel.flags.has(f.itemId)} onChange={() => setSel({ ...sel, flags: toggle(sel.flags, f.itemId) })} />
                <span>
                  <b>{f.label}</b> <span className="mono">{f.flags.map((x) => ({ lopesWrite: 'LopesWrite', timed: 'timed', group: 'group', inClass: 'in person' })[x]).join(', ')}</span>
                </span>
              </label>
            </li>
          ))}
        </Section>
        <Section title="Found outside Halo" count={diff.discovered.length}>
          {diff.discovered.map((d, i) => (
            <li key={i}>
              <label className="plan-line">
                <input type="checkbox" checked={sel.discovered.has(i)} onChange={() => setSel({ ...sel, discovered: toggle(sel.discovered, i) })} />
                <span>
                  <b>{d.title}</b> <span className="mono">{d.due ? fmtDate(d.due, 'short') : 'no date'}{d.points !== null ? ` · ${d.points} pts` : ''}</span> <Sure c={d.confidence} />
                  <span className="hint plan-why">
                    “{d.quote}” <span className="mono muted">· {d.source}</span>
                  </span>
                </span>
              </label>
            </li>
          ))}
        </Section>
        {diff.skipped.length > 0 && (
          <p className="hint">
            Left alone: {diff.skipped.map((s) => `${s.label} ${s.what === 'startBy' ? 'start' : s.what === 'minutes' ? 'estimate' : 'steps'} (${s.why})`).join('; ')}.
          </p>
        )}
        {diff.missing.length > 0 && <p className="hint">Never read by the model: {diff.missing.join(', ')}. Re-run to try again.</p>}
        <div className="modal-actions">
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <span className="spacer" />
          <button type="button" className="btn primary" onClick={() => onApply(sel)}>
            {n === 0 ? 'Apply (attach only)' : `Apply ${n} change${n === 1 ? '' : 's'}`}
          </button>
        </div>
      </div>
    </Modal>
  );
}
