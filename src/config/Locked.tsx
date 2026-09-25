import type { ReactNode } from 'react';
import { can, tierFor } from './flags';
import { FEATURE_LINES, TIER_NAMES, type Feature, type Tier } from './tiers';

/**
 * Wraps anything a tier may not have. On a tier that has it, renders the children. Below it, renders a quiet card
 * that says what the feature does and which plan has it, with one button to the upgrade sheet. Never a wall, never a
 * modal: the rest of the screen keeps working.
 */
export function Locked({ feature, tier, children, compact = false }: { feature: Feature; tier: Tier; children: ReactNode; compact?: boolean }) {
  if (can(feature, tier)) return <>{children}</>;
  const need = tierFor(feature);
  return (
    <div className={`locked card${compact ? ' locked-compact' : ''}`} role="note" aria-label={`Included with ${TIER_NAMES[need]}`}>
      <p className="locked-line">{FEATURE_LINES[feature]}</p>
      <div className="locked-actions">
        <span className="locked-tier">{TIER_NAMES[need]}</span>
        <a className="btn small primary" href={`#/you?s=plan&to=${need}&for=${feature}`}>
          See {TIER_NAMES[need]}
        </a>
      </div>
    </div>
  );
}

/** A one-line inline lock for menus and buttons: the label, with the plan that has it after it. */
export function LockTag({ feature, tier }: { feature: Feature; tier: Tier }) {
  if (can(feature, tier)) return null;
  return <span className="lock-tag">{TIER_NAMES[tierFor(feature)]}</span>;
}
