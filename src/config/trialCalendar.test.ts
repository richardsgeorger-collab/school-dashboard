import { describe, expect, it } from 'vitest';
import { trialCalendar, trialChipText } from './trialCalendar';

const TZ = 'America/Phoenix';

describe('the trial calendar', () => {
  // Started Mon Sep 28 at 6 PM Phoenix: ends Mon Oct 5 at 6 PM, so Oct 5 is the last day.
  const endsAt = '2026-10-06T01:00:00.000Z';
  it('counts whole 24-hour days left: 7 at the start, 1 in the last day', () => {
    expect(trialCalendar(endsAt, TZ, '2026-09-29T01:00:00.000Z').daysLeft).toBe(7);
    expect(trialCalendar(endsAt, TZ, '2026-10-03T13:00:00.000Z').daysLeft).toBe(3);
    expect(trialCalendar(endsAt, TZ, '2026-10-05T15:00:00.000Z').daysLeft).toBe(1);
    expect(trialCalendar(endsAt, TZ, '2026-10-05T15:00:00.000Z').lastDay).toBe('2026-10-05');
  });
  it('reminds two days before, in the evening, and the morning of the last day', () => {
    const r = trialCalendar(endsAt, TZ, '2026-09-29T01:00:00.000Z').reminders;
    expect(r.map((x) => [x.day, x.sendAt, x.daysBefore])).toEqual([
      ['2026-10-03', '2026-10-04T01:00:00.000Z', 2],
      ['2026-10-05', '2026-10-05T15:00:00.000Z', 0],
    ]);
  });
  it('a trial that ends in the small hours has its last day the day before', () => {
    const early = '2026-10-05T08:30:00.000Z'; // 1:30 AM Oct 5 in Phoenix
    expect(trialCalendar(early, TZ, '2026-10-01T12:00:00.000Z').lastDay).toBe('2026-10-04');
  });
  it('the chip', () => {
    expect(trialChipText(5)).toBe('Free trial · 5 days left');
    expect(trialChipText(1)).toBe('Free trial · last day');
  });
});
