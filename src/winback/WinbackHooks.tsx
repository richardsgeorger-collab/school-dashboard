import { useEffect } from 'react';
import { bump } from '../analytics/usage';
import { useAccount } from '../auth/AccountContext';
import { trialState } from '../config/flags';
import { useInviteProgress, useMyGrants } from '../referral/Invite';
import { useRoute } from '../router';
import { useStore } from '../storage/store';
import { syncPress } from '../ui/presses';

/** Free after the Max week, not in a referral, never upgraded: the only students win-back messages are for. */
export function useWinbackEligible(): boolean {
  const { tier, profile, auth } = useAccount();
  const invites = useInviteProgress();
  const grants = useMyGrants();
  return !!auth.session && tier === 'free' && trialState(profile) === 'used' && !profile?.referredBy && !profile?.friendFrom && (invites?.joined ?? 0) === 0 && grants.length === 0;
}

/**
 * A visit from a win-back push is counted as opened (for the funnel); any other visit is the student opening Halo+ on
 * their own, which resets the ignored count. The out-of-date push lands on #/now?peek=1 and opens the peek.
 */
export function WinbackOpens() {
  const { route, params } = useRoute();
  const { actions } = useStore();
  const { reloadProfile } = useAccount();
  const checkout = params.get('checkout');
  // Read from the address the page loaded with: startup can rewrite the hash before this mounts.
  const wb = LANDED.get('wb') ?? params.get('wb');
  const peek = (LANDED.get('peek') ?? params.get('peek')) === '1';
  useEffect(() => {
    if (wb && /^[a-z]+$/.test(wb)) {
      bump(`winback:open:${wb}`);
      try {
        sessionStorage.setItem(WB_KEY, wb);
      } catch {
        /* the upgrade is then counted as a plain peek */
      }
    }
    else actions.updateSettings({ winbackOwnOpenAt: new Date().toISOString() });
    // Once per page load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (!peek) return;
    const t = setTimeout(() => syncPress.current?.(), 1200);
    return () => clearTimeout(t);
  }, [peek]);
  // Checkout can return to Practice (the exam-week offer) instead of You; the plan still has to show up.
  useEffect(() => {
    if (checkout !== 'success' || route === 'you') return;
    const t = [setTimeout(reloadProfile, 4000), setTimeout(reloadProfile, 12000)];
    return () => t.forEach(clearTimeout);
  }, [checkout, route, reloadProfile]);
  return null;
}

const WB_KEY = 'hp-winback-from';
const LANDED = new URLSearchParams(typeof window === 'undefined' ? '' : (window.location.hash.split('?')[1] ?? ''));
/** Which win-back push this visit came from, so a peek opened by the out-of-date push counts its upgrade as "stale". */
export function winbackFrom(): string | null {
  try {
    return sessionStorage.getItem(WB_KEY);
  } catch {
    return null;
  }
}
