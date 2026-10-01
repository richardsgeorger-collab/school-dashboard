import { useAccount } from '../auth/AccountContext';
import { useRoute } from '../router';
import { useStore } from '../storage/store';

/**
 * Who gets the landing page: a stranger at the bare root, with no account signed in and nothing on this device.
 * Anyone signed in, anyone who has synced or started onboarding here, and any real address (#/now, #/you…) get the
 * app. `pending` while the account is still being looked up, so nothing flashes and onboarding does not start.
 */
export type Front = 'landing' | 'app' | 'pending';

export function frontFor(args: { route: string; configured: boolean; loading: boolean; signedIn: boolean; courses: number; onboardingStarted: boolean; /** A session may be on its way: one stored here, or a sign-in link's tokens in the address. Unset counts as maybe. */ maybeSession?: boolean }): Front {
  if (args.route !== 'home') return 'app';
  // A stranger with nothing stored keeps the pre-rendered landing page on screen while the auth library starts
  // (2026-09-30): no blank "pending" frame between the HTML Google reads and the same page drawn by React.
  if (args.configured && args.loading && args.maybeSession !== false) return 'pending';
  if (args.signedIn) return 'app';
  if (args.courses > 0 || args.onboardingStarted) return 'app';
  return 'landing';
}

export function useFront(): Front {
  const { route } = useRoute();
  const { auth } = useAccount();
  const { data } = useStore();
  const maybeSession = !!auth.knownUserId || /access_token|refresh_token|[?&#]code=|error_description/.test(window.location.hash + window.location.search);
  return frontFor({ route, configured: auth.configured, loading: auth.loading, signedIn: !!auth.session, courses: data.courses.length, onboardingStarted: !!data.settings.onboarding, maybeSession });
}
