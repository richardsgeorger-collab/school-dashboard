import { afterEach, describe, expect, it, vi } from 'vitest';
import { can, effectiveTier } from '../config/flags';
import { FEATURES, type Feature } from '../config/tiers';
import { isConfigured } from './client';
import { LOCAL_PROFILE } from './useProfile';

/** A build with no Supabase config has no account to check. It must fail closed: Free, nothing paid unlocked. */
describe('a build with no backend', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('is not configured when the Supabase variables are missing, empty, or placeholders', () => {
    vi.stubEnv('VITE_SUPABASE_URL', '');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', '');
    expect(isConfigured()).toBe(false);
    vi.stubEnv('VITE_SUPABASE_URL', 'https://xxxx.supabase.co');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'eyJ...');
    expect(isConfigured()).toBe(false);
  });

  it('runs as Free', () => {
    expect(LOCAL_PROFILE.tier).toBe('free');
    expect(effectiveTier(LOCAL_PROFILE)).toBe('free');
    expect(LOCAL_PROFILE.isAdmin).toBe(false);
  });

  it('unlocks nothing above Free', () => {
    const tier = effectiveTier(LOCAL_PROFILE);
    for (const f of Object.keys(FEATURES) as Feature[]) {
      expect(can(f, tier), f).toBe(FEATURES[f] === 'free');
    }
  });
});
