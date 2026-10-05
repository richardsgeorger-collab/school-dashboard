import { describe, expect, it } from 'vitest';
import { extNudgeDue, extSetupDue } from './extSetup';

const base = { settings: {}, browser: 'Chrome' as const, touch: false, installed: null, storeUrl: 'https://chromewebstore.google.com/detail/x' };

describe('who sees the extension setup', () => {
  it('desktop Chrome, Edge or Brave with nothing connected: the setup, once', () => {
    expect(extSetupDue(base)).toBe('setup');
    expect(extSetupDue({ ...base, browser: 'Edge' })).toBe('setup');
    expect(extSetupDue({ ...base, settings: { extSetup: { shownAt: '2026-10-04T00:00:00Z' } } })).toBeNull();
    expect(extSetupDue({ ...base, settings: { extSetup: { skippedAt: '2026-10-04T00:00:00Z' } } })).toBeNull();
  });
  it('never with the extension connected (its version here, or a sync that came from it)', () => {
    expect(extSetupDue({ ...base, installed: '0.4.0' })).toBeNull();
    expect(extSetupDue({ ...base, settings: { lastPull: { at: 'x', via: 'extension' } as never } })).toBeNull();
    expect(extSetupDue({ ...base, settings: { lastPull: { at: 'x', via: 'bookmark' } as never } })).toBe('setup');
  });
  it('Safari or Firefox on a computer: that it needs Chrome; a phone or an iPad: nothing', () => {
    expect(extSetupDue({ ...base, browser: null })).toBe('needs-chrome');
    expect(extSetupDue({ ...base, browser: null, touch: true })).toBeNull();
    expect(extSetupDue({ ...base, touch: true })).toBeNull();
  });
  it('no store address set in Admin: no setup', () => {
    expect(extSetupDue({ ...base, storeUrl: null })).toBeNull();
  });
  it('after Skip for now, the line on Now lasts 7 days and then stops', () => {
    const at = Date.parse('2026-10-04T12:00:00Z');
    const settings = { extSetup: { shownAt: '2026-10-04T12:00:00Z', skippedAt: '2026-10-04T12:00:00Z' } };
    expect(extNudgeDue(settings, 'Chrome', null, at + 6.9 * 86_400_000)).toBe(true);
    expect(extNudgeDue(settings, 'Chrome', null, at + 7.1 * 86_400_000)).toBe(false);
    expect(extNudgeDue(settings, 'Chrome', '0.5.2', at)).toBe(false);
    expect(extNudgeDue(settings, null, null, at)).toBe(false);
    expect(extNudgeDue({ extSetup: { shownAt: 'x', doneAt: 'x' } }, 'Chrome', null, at)).toBe(false);
  });
});
