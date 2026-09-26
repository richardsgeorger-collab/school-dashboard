import { useEffect, useState, type ReactNode } from 'react';
import { useAccount } from '../auth/AccountContext';
import { TrialOffer } from '../views/TrialOffer';
import { announceDb } from '../halo/announce';
import { recordingsDb } from '../record/db';
import { useStore } from '../storage/store';
import { can, tierFor, trialState } from './flags';
import { FEATURE_LINES, TIER_NAMES, TRIAL, type Feature, type Tier } from './tiers';

/**
 * What a locked feature would do with THIS student's data, from cheap real counts. Never a guess: a count of posts
 * on file, not a claim about what is in them. Null when there is nothing to say.
 */
function usePreview(feature: Feature): string | null {
  const { data } = useStore();
  const [n, setN] = useState<number | null>(null);
  useEffect(() => {
    let live = true;
    if (feature === 'announcementAI') {
      const ids = new Set(data.courses.map((c) => c.id));
      void announceDb.list().then((l) => live && setN(l.filter((a) => ids.has(a.courseId)).length)).catch(() => undefined);
    } else if (feature === 'lectures' || feature === 'flashcards') {
      void recordingsDb.list().then((l) => live && setN(l.length)).catch(() => undefined);
    }
    return () => {
      live = false;
    };
  }, [feature, data.courses]);
  if (feature === 'announcementAI' && n !== null && n > 0) return `You have ${n} announcement${n === 1 ? '' : 's'} on file that Max would read for hidden requirements.`;
  if (feature === 'examPlans') {
    const exams = data.items.filter((i) => i.type === 'exam' && i.status !== 'done').length;
    return exams > 0 ? `You have ${exams} exam${exams === 1 ? '' : 's'} coming up that Max would plan studying for.` : null;
  }
  if ((feature === 'lectures' || feature === 'flashcards') && n !== null && n > 0) return `You have ${n} recording${n === 1 ? '' : 's'} Max would turn into notes and practice.`;
  if (feature === 'aiChat') {
    const open = data.items.filter((i) => i.status !== 'done').length;
    return open > 0 ? `${open} open things to ask about: what first, what can wait, what a professor really wants.` : null;
  }
  return null;
}

/**
 * Wraps anything a tier may not have. On a tier that has it, renders the children. Below it, renders a quiet card
 * that says what the feature does, what it would do with this student's data, and one way up: the free trial when
 * it is still available, otherwise the plan. Never a wall, never a modal: the rest of the screen keeps working.
 */
export function Locked({ feature, tier, children, compact = false }: { feature: Feature; tier: Tier; children: ReactNode; compact?: boolean }) {
  const { profile, auth } = useAccount();
  const preview = usePreview(feature);
  if (can(feature, tier)) return <>{children}</>;
  const need = tierFor(feature);
  const trial = auth.configured && trialState(profile) === 'available' && need === TRIAL.tier;
  return (
    <div className={`locked card${compact ? ' locked-compact' : ''}`} role="note" aria-label={`Included with ${TIER_NAMES[need]}`}>
      <p className="locked-line">{FEATURE_LINES[feature]}</p>
      {preview && <p className="locked-preview">{preview}</p>}
      <div className="locked-actions">
        <span className="locked-tier">{TIER_NAMES[need]}</span>
        {trial ? (
          <span className="locked-trial">
            <TrialOffer variant="button" />
            <span className="hint">{TRIAL.line}</span>
          </span>
        ) : (
          <a className="btn small primary" href={`#/you?s=plan&to=${need}&for=${feature}`}>
            See {TIER_NAMES[need]}
          </a>
        )}
      </div>
    </div>
  );
}

/** A one-line inline lock for menus and buttons: the label, with the plan that has it after it. */
export function LockTag({ feature, tier }: { feature: Feature; tier: Tier }) {
  if (can(feature, tier)) return null;
  return <span className="lock-tag">{TIER_NAMES[tierFor(feature)]}</span>;
}
