import { describe, expect, it } from 'vitest';
import {
  addDays,
  dateOf,
  diffDays,
  eachDay,
  fmtDate,
  fmtTime,
  isWeekend,
  makeIso,
  parseGcuDateTime,
  todayStr,
  weekStart,
  weekdayOf,
  zonedParts,
} from './dates';

const PHX = 'America/Phoenix';

describe('dates', () => {
  it('makeIso builds an ISO string with the zone offset', () => {
    expect(makeIso('2026-09-13', '23:59', PHX)).toBe('2026-09-13T23:59:00-07:00');
    expect(makeIso('2026-07-04', '09:30', 'America/New_York')).toBe('2026-07-04T09:30:00-04:00');
    expect(makeIso('2026-01-15', '09:30', 'America/New_York')).toBe('2026-01-15T09:30:00-05:00');
  });

  it('dateOf gives the calendar date in the zone', () => {
    expect(dateOf('2026-09-14T06:59:00Z', PHX)).toBe('2026-09-13');
    expect(dateOf('2026-09-14T07:00:00Z', PHX)).toBe('2026-09-14');
    expect(dateOf('2026-09-13T23:59:00-07:00', PHX)).toBe('2026-09-13');
  });

  it('zonedParts exposes hour, minute and weekday', () => {
    const p = zonedParts('2026-09-25T08:00:00-07:00', PHX);
    expect(p).toMatchObject({ y: 2026, m: 9, d: 25, hh: 8, mm: 0, weekday: 5 });
  });

  it('parseGcuDateTime reads syllabus timestamps', () => {
    expect(parseGcuDateTime('Sep 25, 2026, 8:00 AM')).toBe('2026-09-25T08:00:00-07:00');
    expect(parseGcuDateTime('Sep 13, 2026, 11:59 PM')).toBe('2026-09-13T23:59:00-07:00');
    expect(parseGcuDateTime('Dec 1, 2026, 12:00 AM')).toBe('2026-12-01T00:00:00-07:00');
    expect(parseGcuDateTime('Dec 1, 2026, 12:30 PM')).toBe('2026-12-01T12:30:00-07:00');
    expect(parseGcuDateTime('garbage')).toBeNull();
  });

  it('does day arithmetic on date strings', () => {
    expect(addDays('2026-09-30', 1)).toBe('2026-10-01');
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
    expect(diffDays('2026-09-08', '2026-09-13')).toBe(5);
    expect(diffDays('2026-09-13', '2026-09-08')).toBe(-5);
    expect(eachDay('2026-09-08', '2026-09-10')).toEqual(['2026-09-08', '2026-09-09', '2026-09-10']);
  });

  it('knows weekdays and week starts', () => {
    expect(weekdayOf('2026-09-08')).toBe(2);
    expect(isWeekend('2026-09-12')).toBe(true);
    expect(isWeekend('2026-09-13')).toBe(true);
    expect(isWeekend('2026-09-14')).toBe(false);
    expect(weekStart('2026-09-09', 0)).toBe('2026-09-06');
    expect(weekStart('2026-09-09', 1)).toBe('2026-09-07');
    expect(weekStart('2026-09-06', 1)).toBe('2026-08-31');
  });

  it('todayStr uses the zone', () => {
    expect(todayStr(PHX, new Date('2026-09-10T05:30:00Z'))).toBe('2026-09-09');
  });

  it('formats for display', () => {
    expect(fmtDate('2026-09-13', 'short')).toBe('Sep 13');
    expect(fmtDate('2026-09-13', 'long')).toBe('Sun, Sep 13');
    expect(fmtTime('2026-09-13T23:59:00-07:00', PHX)).toBe('11:59 PM');
    expect(fmtTime('2026-09-25T08:00:00-07:00', PHX)).toBe('8:00 AM');
  });
});
