import { useAccount } from '../auth/AccountContext';
import { aiAvailable } from '../chat/key';
import { can } from './flags';
import type { Feature } from './tiers';

/** Whether this student may use a feature right now, from their plan. */
export function useCan(feature: Feature): boolean {
  const { tier } = useAccount();
  return can(feature, tier);
}

/** An AI feature: the plan allows it and this build can reach a model at all. */
export function useAiAllowed(feature: Feature): boolean {
  const allowed = useCan(feature);
  return allowed && aiAvailable();
}
