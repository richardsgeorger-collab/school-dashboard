import { useAccount } from '../auth/AccountContext';
import { useRoute } from '../router';
import { useStore } from '../storage/store';

/**
 * Who gets the landing page: a stranger at the bare root, with no account signed in and nothing on this device.
 * Anyone signed in, anyone who has synced or started onboarding here, and any real address (#/now, #/you…) get the
 * app. `pending` while the account is still being looked up, so nothing flashes and onboarding does not start.
 */
export type Front = 'landing' | 'app' | 'pending';

export function frontFor(args: { route: string; configured: boolean; loading: boolean; signedIn: boolean; courses: number; onboardingStarted: boolean }): Front {
  if (args.route !== 'home') return 'app';
  if (args.configured && args.loading) return 'pending';
  if (args.signedIn) return 'app';
  if (args.courses > 0 || args.onboardingStarted) return 'app';
  return 'landing';
}

export function useFront(): Front {
  const { route } = useRoute();
  const { auth } = useAccount();
  const { data } = useStore();
  return frontFor({ route, configured: auth.configured, loading: auth.loading, signedIn: !!auth.session, courses: data.courses.length, onboardingStarted: !!data.settings.onboarding });
}
