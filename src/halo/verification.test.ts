import { describe, expect, it } from 'vitest';
import { TZ } from './fixtures';
import { cleanStreak, MAX_CHECKS, recordCheck, verificationLine } from './verification';

const rec = (at: string, clean: boolean, findings = 0) => ({ at, clean, findings });

describe('verification receipt', () => {
  it('says when Halo was last checked and how it went, amber past ten days or never', () => {
    expect(verificationLine(undefined, '2026-09-14', TZ)).toEqual({ text: 'Not yet verified against Halo.', level: 'amber' });
    expect(verificationLine([rec('2026-09-12T20:00:00-07:00', true)], '2026-09-14', TZ)).toEqual({ text: 'Verified against Halo 2 days ago — clean.', level: 'quiet' });
    expect(verificationLine([rec('2026-09-14T08:00:00-07:00', false, 3)], '2026-09-14', TZ)).toEqual({ text: 'Verified against Halo today — 3 findings, reviewed.', level: 'quiet' });
    expect(verificationLine([rec('2026-09-13T08:00:00-07:00', false, 1)], '2026-09-14', TZ).text).toBe('Verified against Halo yesterday — 1 finding, reviewed.');
    expect(verificationLine([rec('2026-09-03T08:00:00-07:00', true)], '2026-09-14', TZ).level).toBe('amber');
    expect(verificationLine([rec('2026-09-04T08:00:00-07:00', true)], '2026-09-14', TZ).level).toBe('quiet');
  });
  it('counts the trailing clean streak and caps the history', () => {
    const list = [rec('a', false, 2), rec('b', true), rec('c', true), rec('d', true)];
    expect(cleanStreak(list)).toBe(3);
    expect(cleanStreak([rec('a', true), rec('b', false, 1)])).toBe(0);
    expect(cleanStreak(undefined)).toBe(0);
    let h: ReturnType<typeof recordCheck> = [];
    for (let i = 0; i < MAX_CHECKS + 5; i++) h = recordCheck(h, rec(String(i), true));
    expect(h.length).toBe(MAX_CHECKS);
    expect(h[0].at).toBe('5');
  });
});
