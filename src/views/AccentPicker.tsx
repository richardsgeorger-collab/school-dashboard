import { useAccount } from '../auth/AccountContext';
import { ACCENTS, type AccentId } from '../config/accents';
import { trialState } from '../config/flags';
import { TIER_NAMES, TRIAL } from '../config/tiers';
import { useStore } from '../storage/store';
import { TrialOffer } from './TrialOffer';

/**
 * The six accent swatches. With Max (or the Max trial) a tap changes the whole app; without it the swatches are
 * shown but locked, with the one honest way in. `compact` drops the lock line for the Max welcome, where the
 * account already has the feature.
 */
export function AccentPicker({ value, onChange, allowed }: { value: AccentId; onChange: (a: AccentId) => void; allowed: boolean }) {
  const { isDark } = useStore();
  const { auth, profile } = useAccount();
  const trial = auth.configured && trialState(profile) === 'available';
  return (
    <div className="accent-picker" data-locked={!allowed}>
      <div className="accent-swatches" role="radiogroup" aria-label="Accent colour">
        {ACCENTS.map((a) => (
          <button
            key={a.id}
            type="button"
            role="radio"
            aria-checked={value === a.id}
            aria-label={a.name}
            title={a.name}
            className="accent-swatch"
            style={{ '--sw': isDark ? a.dark : a.light } as React.CSSProperties}
            disabled={!allowed}
            onClick={() => onChange(a.id)}
          >
            <span className="accent-swatch-name">{a.name}</span>
          </button>
        ))}
      </div>
      {!allowed && (
        <div className="locked-actions accent-lock">
          <span className="locked-tier">{TIER_NAMES.max}</span>
          <span className="hint">Your colour is part of Max. Everyone else wears gold.</span>
          {trial ? (
            <span className="locked-trial">
              <TrialOffer variant="button" label="Try Max free" />
              <span className="hint">{TRIAL.line}</span>
            </span>
          ) : (
            <a className="btn small primary" href="#/you?s=plan&to=max&for=themes">
              See {TIER_NAMES.max}
            </a>
          )}
        </div>
      )}
    </div>
  );
}
