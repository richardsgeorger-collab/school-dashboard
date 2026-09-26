import { describe, expect, it } from 'vitest';
import { frontFor } from './useShowLanding';

const base = { route: 'home', configured: true, loading: false, signedIn: false, courses: 0, onboardingStarted: false };

describe('the front door', () => {
  it('a stranger at the root gets the landing page', () => {
    expect(frontFor(base)).toBe('landing');
  });
  it('waits while the account is being looked up', () => {
    expect(frontFor({ ...base, loading: true })).toBe('pending');
  });
  it('anyone signed in, or with classes, or who started onboarding here, gets the app', () => {
    expect(frontFor({ ...base, signedIn: true })).toBe('app');
    expect(frontFor({ ...base, courses: 3 })).toBe('app');
    expect(frontFor({ ...base, onboardingStarted: true })).toBe('app');
  });
  it('a real address is always the app', () => {
    expect(frontFor({ ...base, route: 'now' })).toBe('app');
    expect(frontFor({ ...base, route: 'login' })).toBe('app');
  });
  it('a build without accounts still shows a stranger the landing page', () => {
    expect(frontFor({ ...base, configured: false, loading: false })).toBe('landing');
  });
});
