import { describe, expect, it } from 'vitest';
import { prefsPatch } from './extPrefs';

describe('settings saved before the account move into it (Loop 305)', () => {
  it('the computer’s switches when newer than the account’s, never older, never junk', () => {
    expect(prefsPatch({ feat: { off: ['search', 'confetti'], at: '2026-11-01T10:00:00Z' }, uiOn: { on: false, at: '2026-11-01T10:00:00Z' } }, { stamps: {} })).toEqual({ haloFeaturesOff: ['search', 'confetti'], haloOnHalo: false });
    expect(prefsPatch({ feat: { off: ['search'], at: '2026-10-01T10:00:00Z' } }, { stamps: { haloFeaturesOff: '2026-10-20T00:00:00Z' } })).toEqual({});
    expect(prefsPatch({ feat: { off: ['<script>', 'search'], at: '2026-11-01T10:00:00Z' } }, { stamps: {} })).toEqual({ haloFeaturesOff: ['search'] });
    expect(prefsPatch({}, { stamps: {} })).toEqual({});
  });
});
