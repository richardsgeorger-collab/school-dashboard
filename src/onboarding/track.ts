import { supabase } from '../auth/client';
import { deviceAndBrowser } from '../ui/device';

export type OnboardingEvent = 'enter' | 'complete' | 'skip';

const platform = () => (typeof navigator !== 'undefined' && /iPhone|iPad|Android/i.test(navigator.userAgent) ? 'phone' : 'desktop');

/**
 * One row per step entered, completed or skipped, so the admin screen can see where new students drop off. Only
 * for a signed-in student on a build with accounts; otherwise there is nothing to write to and nothing is written.
 * Each row carries the device ("phone", "tablet", "laptop") and browser it happened on (2026-10-13), so Admin can
 * see that a sign-up on an iPhone in Safari never reached a laptop.
 */
export function track(step: string, event: OnboardingEvent): void {
  const c = supabase();
  if (!c) return;
  const { device, browser } = deviceAndBrowser();
  void c.auth
    .getSession()
    .then(({ data }) => (data.session ? c.from('onboarding_events').insert({ step, event, platform: platform(), device, browser }) : null))
    .catch(() => undefined);
}
