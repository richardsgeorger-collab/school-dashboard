import { describe, expect, it } from 'vitest';
import { AI_CEILING_USD, LIMITS } from '../config/tiers';
import { allowance, costOf, meter, warningLine, type UsageRow } from './meter';

const row = (day: string, kind: string, costUsd: number, calls = 1): UsageRow => ({ day, kind, costUsd, calls });
const TODAY = '2026-09-24';

describe('the meter', () => {
  it('counts this month, today, and this week separately', () => {
    const rows = [row('2026-09-01', 'coach', 0.1), row('2026-09-24', 'coach', 0.05), row('2026-09-24', 'coach', 0.05), row('2026-08-30', 'coach', 5), row('2026-09-22', 'lecture', 0.2), row('2026-09-14', 'lecture', 0.2)];
    const m = meter(rows, 'max', TODAY);
    // 0.1 + 0.05 + 0.05 + the two September lectures; August's $5 does not count.
    expect(m.monthCostUsd).toBeCloseTo(0.6, 5);
    expect(m.messagesToday).toBe(2);
    // Sep 22 is in the week of Sep 21; Sep 14 is the week before.
    expect(m.lecturesThisWeek).toBe(1);
  });

  it('refuses a kind the tier does not have', () => {
    expect(allowance('coach', meter([], 'free', TODAY))).toMatchObject({ ok: false, reason: 'tier' });
    expect(allowance('coach', meter([], 'plus', TODAY))).toMatchObject({ ok: false, reason: 'tier' });
    expect(allowance('lecture', meter([], 'pro', TODAY))).toMatchObject({ ok: false, reason: 'tier' });
    expect(allowance('coach', meter([], 'pro', TODAY)).ok).toBe(true);
  });

  it('stops at the daily message cap, per tier, from config', () => {
    const cap = LIMITS.aiMessagesPerDay.pro;
    const rows = Array.from({ length: cap }, () => row(TODAY, 'coach', 0.01));
    expect(allowance('coach', meter(rows.slice(0, cap - 1), 'pro', TODAY)).ok).toBe(true);
    expect(allowance('coach', meter(rows, 'pro', TODAY))).toMatchObject({ ok: false, reason: 'daily' });
    // Announcements are not messages; they do not count against it.
    expect(allowance('announcement', meter(rows, 'pro', TODAY)).ok).toBe(true);
  });

  it('warns at 80% of the monthly ceiling and pauses at 100%', () => {
    const ceiling = AI_CEILING_USD.max;
    const at79 = meter([row('2026-09-02', 'lecture', ceiling * 0.79)], 'max', TODAY);
    expect(allowance('coach', at79)).toMatchObject({ ok: true, warn: false });
    expect(warningLine(at79)).toBeNull();
    const at85 = meter([row('2026-09-02', 'lecture', ceiling * 0.85)], 'max', TODAY);
    expect(allowance('coach', at85)).toMatchObject({ ok: true, warn: true });
    expect(warningLine(at85)).toBe('You have used 85% of this month\'s AI. It pauses at 100% and comes back on the 1st.');
    const full = meter([row('2026-09-02', 'lecture', ceiling)], 'max', TODAY);
    const a = allowance('coach', full);
    expect(a).toMatchObject({ ok: false, reason: 'ceiling' });
    expect(a.message).toContain('Everything else keeps working');
    // Last month's spend does not count.
    expect(allowance('coach', meter([row('2026-08-02', 'lecture', ceiling * 3)], 'max', TODAY)).ok).toBe(true);
  });

  it('caps lectures per week on Max', () => {
    const rows = Array.from({ length: LIMITS.lecturesPerWeek.max }, () => row('2026-09-23', 'lecture', 0.02));
    expect(allowance('lecture', meter(rows, 'max', TODAY))).toMatchObject({ ok: false, reason: 'lectures' });
    expect(allowance('lecture', meter(rows.slice(1), 'max', TODAY)).ok).toBe(true);
  });

  it('prices a call from the usage the API reported, cached input at a tenth', () => {
    expect(costOf({ input_tokens: 1_000_000 })).toBeCloseTo(1, 6);
    expect(costOf({ output_tokens: 1_000_000 })).toBeCloseTo(5, 6);
    expect(costOf({ cache_read_input_tokens: 1_000_000 })).toBeCloseTo(0.1, 6);
    expect(costOf({ input_tokens: 2000, output_tokens: 300, cache_read_input_tokens: 6000 })).toBeCloseTo(0.0041, 6);
  });
});
