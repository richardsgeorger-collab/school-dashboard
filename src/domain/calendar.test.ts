import { describe, expect, it } from 'vitest';
import { meetingsOn, monthGrid, monthKey, shiftMonth } from './calendar';
import type { Course } from './types';

const course = (code: string, meetings: Course['meetings']): Course => ({
  id: code,
  code,
  name: code,
  color: '#000',
  credits: 3,
  instructors: [],
  meetings,
  online: false,
  termStart: '2026-09-08',
  termEnd: '2026-12-20',
  updatedAt: '',
});

describe('monthGrid', () => {
  it('starts on the week boundary before the 1st and fills whole weeks', () => {
    const sep = monthGrid('2026-09', 0);
    expect(sep[0]).toBe('2026-08-30');
    expect(sep).toHaveLength(35);
    expect(sep.at(-1)).toBe('2026-10-03');
  });
  it('uses six rows when needed', () => {
    const aug = monthGrid('2026-08', 0);
    expect(aug[0]).toBe('2026-07-26');
    expect(aug).toHaveLength(42);
  });
  it('honours Monday week start', () => {
    expect(monthGrid('2026-09', 1)[0]).toBe('2026-08-31');
  });
  it('derives and shifts month keys', () => {
    expect(monthKey('2026-09-09')).toBe('2026-09');
    expect(shiftMonth('2026-12', 1)).toBe('2027-01');
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
  });
});

describe('meetingsOn', () => {
  const courses = [
    course('CHM-113', [
      { day: 3, start: '07:00', end: '08:15' },
      { day: 5, start: '07:00', end: '08:15' },
    ]),
    course('ENG-105', [{ day: 3, start: '11:00', end: '12:45' }]),
  ];
  it('lists meetings for the weekday, sorted by start time', () => {
    const m = meetingsOn(courses, '2026-09-09');
    expect(m.map((x) => `${x.course.code}@${x.meeting.start}`)).toEqual(['CHM-113@07:00', 'ENG-105@11:00']);
  });
  it('returns nothing outside the term', () => {
    expect(meetingsOn(courses, '2026-12-23')).toEqual([]);
    expect(meetingsOn(courses, '2026-09-02')).toEqual([]);
  });
});
