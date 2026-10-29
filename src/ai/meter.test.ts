import { describe, expect, it } from 'vitest';
import { AI_CEILING_USD, LIMITS } from '../config/tiers';
import { allowance, costOf, meter, warningLine, type UsageRow } from './meter';
import { HAIKU_4_5 } from './model';

const row = (day: string, kind: string, costUsd: number, calls = 1): UsageRow => ({ day, kind, costUsd, calls });
const TODAY = '2026-09-24';

describe('the meter', () => {
  it('counts this month, today, and this week separately', () => {
    const rows = [row('2026-09-01', 'brief', 0.1), row('2026-09-24', 'brief', 0.05), row('2026-09-24', 'brief', 0.05), row('2026-08-30', 'brief', 5), row('2026-09-22', 'lecture', 0.2), row('2026-09-14', 'lecture', 0.2)];
    const m = meter(rows, 'max', TODAY);
    // 0.1 + 0.05 + 0.05 + the two September lectures; August's $5 does not count.
    expect(m.monthCostUsd).toBeCloseTo(0.6, 5);
    expect(m.messagesToday).toBe(2);
    // Sep 22 is in the week of Sep 21; Sep 14 is the week before.
    expect(m.lecturesThisWeek).toBe(1);
  });

  it('refuses a kind the tier does not have', () => {
    expect(allowance('brief', meter([], 'free', TODAY))).toMatchObject({ ok: false, reason: 'tier' });
    expect(allowance('announcement', meter([], 'free', TODAY))).toMatchObject({ ok: false, reason: 'tier' });
    // Free's one AI call: the locked heads-up's check.
    expect(allowance('changes', meter([], 'free', TODAY)).ok).toBe(true);
    // Plus and Pro are retired and count as Max (2026-10-29).
    expect(allowance('brief', meter([], 'plus', TODAY)).ok).toBe(true);
    expect(allowance('brief', meter([], 'pro', TODAY)).ok).toBe(true);
    expect(allowance('brief', meter([], 'max', TODAY)).ok).toBe(true);
  });

  it('stops at the daily message cap, per tier, from config', () => {
    const cap = LIMITS.aiMessagesPerDay.max;
    const rows = Array.from({ length: cap }, () => row(TODAY, 'brief', 0.01));
    expect(allowance('brief', meter(rows.slice(0, cap - 1), 'max', TODAY)).ok).toBe(true);
    expect(allowance('brief', meter(rows, 'max', TODAY))).toMatchObject({ ok: false, reason: 'daily' });
    // Announcements are not messages; they do not count against it.
    expect(allowance('announcement', meter(rows, 'max', TODAY)).ok).toBe(true);
  });

  it('warns at 80% of the monthly ceiling and pauses at 100%', () => {
    const ceiling = AI_CEILING_USD.max;
    const at79 = meter([row('2026-09-02', 'lecture', ceiling * 0.79)], 'max', TODAY);
    expect(allowance('brief', at79)).toMatchObject({ ok: true, warn: false });
    expect(warningLine(at79)).toBeNull();
    const at85 = meter([row('2026-09-02', 'lecture', ceiling * 0.85)], 'max', TODAY);
    expect(allowance('brief', at85)).toMatchObject({ ok: true, warn: true });
    expect(warningLine(at85)).toBe('You have used 85% of this month\'s AI. It pauses at 100% and comes back on the 1st.');
    const full = meter([row('2026-09-02', 'lecture', ceiling)], 'max', TODAY);
    const a = allowance('brief', full);
    expect(a).toMatchObject({ ok: false, reason: 'ceiling' });
    expect(a.message).toContain('Everything else keeps working');
    // Last month's spend does not count.
    expect(allowance('brief', meter([row('2026-08-02', 'lecture', ceiling * 3)], 'max', TODAY)).ok).toBe(true);
  });

  it('caps lectures per week on Max', () => {
    const rows = Array.from({ length: LIMITS.lecturesPerWeek.max }, () => row('2026-09-23', 'lecture', 0.02));
    expect(allowance('lecture', meter(rows, 'max', TODAY))).toMatchObject({ ok: false, reason: 'lectures' });
    expect(allowance('lecture', meter(rows.slice(1), 'max', TODAY)).ok).toBe(true);
  });

  it('prices a call from the usage the API reported, cached input at a tenth (Haiku 4.5 list; 5.5 in model.test.ts)', () => {
    expect(costOf({ input_tokens: 1_000_000 }, HAIKU_4_5)).toBeCloseTo(1, 6);
    expect(costOf({ output_tokens: 1_000_000 }, HAIKU_4_5)).toBeCloseTo(5, 6);
    expect(costOf({ cache_read_input_tokens: 1_000_000 }, HAIKU_4_5)).toBeCloseTo(0.1, 6);
    expect(costOf({ input_tokens: 2000, output_tokens: 300, cache_read_input_tokens: 6000 }, HAIKU_4_5)).toBeCloseTo(0.0041, 6);
  });
});
