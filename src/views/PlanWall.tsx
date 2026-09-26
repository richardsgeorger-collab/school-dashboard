import { useAccount } from '../auth/AccountContext';
import { needsPlan } from '../config/flags';
import { FREE_PLAN_ENABLED, PRICES, TIER_NAMES } from '../config/tiers';

/** With the free plan off: after a used trial, one calm card that asks for a plan. Data stays; nothing is hidden. */
export function useNeedsPlan(): boolean {
  const { profile, auth } = useAccount();
  return auth.configured && !!auth.session && needsPlan(profile, FREE_PLAN_ENABLED);
}

export function PlanWall({ context = 'now' }: { context?: 'now' | 'sync' }) {
  return (
    <section className="card plan-wall" aria-label="Choose a plan">
      <p className="eyebrow">Your Max trial has ended</p>
      <p className="trial-lead">
        {context === 'sync' ? 'Pick a plan to keep syncing Halo.' : 'Everything you have stays. Pick a plan to keep syncing Halo and to keep what Max was doing.'}
      </p>
      <p className="hint">
        {TIER_NAMES.plus} from ${PRICES.plus.month.toFixed(2)} a month. Change or cancel any time; a cancelled plan runs to the end of what was paid for.
      </p>
      <div className="settings-actions">
        <a className="btn small primary" href="#/you?s=plan">
          See plans
        </a>
      </div>
    </section>
  );
}
