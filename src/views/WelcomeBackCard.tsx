import { useAccount } from '../auth/AccountContext';
import { IconCheck } from '../components/Icons';
import { trialState } from '../config/flags';
import { trialUse } from '../config/trialUse';
import type { Change } from '../domain/changes';
import type { Item } from '../domain/types';
import { useStore } from '../storage/store';

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** "3 new assignments · 1 due date moved · 2 caught in announcements · 1 new grade": real counts only, zeros left out. */
export function missedParts(changes: Change[]): string[] {
  const n = (k: Change['kind']) => changes.filter((c) => c.kind === k).length;
  return [
    n('new') ? plural(n('new'), 'new assignment', 'new assignments') : '',
    n('moved') ? plural(n('moved'), 'due date moved', 'due dates moved') : '',
    n('asks') ? `${n('asks')} caught in announcements` : '',
    n('graded') ? plural(n('graded'), 'new grade', 'new grades') : '',
  ].filter(Boolean);
}

/**
 * Back after a day or more away (George, 2026-10-22): a short card at the top of Now, not a screen in front of it.
 * What changed while away (real numbers), where to start, and on the free trial how many days of Max are left (days of
 * use: opening Halo+ today was one). Once per return; the rest of Now is right below it.
 */
export function WelcomeBackCard({ changes, first, onOpen, onClose }: { changes: Change[]; first: Item | null; onOpen: (i: Item) => void; onClose: () => void }) {
  const { profile, tier, planKnown } = useAccount();
  const { actions } = useStore();
  const parts = missedParts(changes);
  const onTrial = trialState(profile) === 'active' && !profile?.friendFrom;
  const max = tier === 'max';
  const use = onTrial ? trialUse(profile) : null;
  const start = () => {
    if (!first) return;
    actions.upsertItem({ ...first, status: 'in_progress', startedAt: new Date().toISOString() });
    onClose();
  };
  // Not before the plan is known: a trial read as Free for a moment would lose "to Max" and its days left.
  if (!planKnown) return null;
  return (
    <section className="card welcome-back-card" aria-label="Welcome back">
      <button type="button" className="welcome-back-x" aria-label="Close" onClick={onClose}>
        ×
      </button>
      <p className="welcome-back-title">{parts.length ? `Welcome back${max ? ' to Max' : ''}! Here's what you missed:` : 'Welcome back!'}</p>
      {parts.length > 0 && (
        <ul className="welcome-back-list">
          {parts.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      )}
      {first && (
        <div className="welcome-back-start">
          <span>
            Start here:{' '}
            <button type="button" className="welcome-link" onClick={() => onOpen(first)}>
              {first.label}
            </button>
          </span>
          <button type="button" className="btn primary small" onClick={start}>
            Start
          </button>
        </div>
      )}
      {use && <p className="welcome-back-days">{use.left <= 1 ? 'Today is your last day of Max.' : `${use.left} days of Max left.`}</p>}
      {!first && !use && (
        <p className="welcome-back-days">
          <IconCheck /> Nothing due right now.
        </p>
      )}
    </section>
  );
}
