import { describe, expect, it } from 'vitest';
import type { Schedule } from '../domain/schedule';
import { planNotices } from './plan';

const TZ = 'America/Phoenix';
const base = { items: [], courses: [], schedule: { byItem: {}, loadByDay: {}, capacityByDay: {}, weekLoad: {} } as unknown as Schedule, tz: TZ, today: '2026-10-02', lastPull: '2026-10-02T19:00:00.000Z' };
const NOW = '2026-10-02T19:05:00.000Z'; // 12:05 PM Phoenix
const up = (code: string, percent: number, at = '2026-10-02T19:00:00.000Z') => ({ courseId: code, code, percent, at });
const prefs = { morning: false, heavyDay: false, notStarted: false, resync: false, participation: false };

describe('the grade-up push', () => {
  it('one push, a minute after the sync saw it: "Your CHM-113 grade went up to 91%."', () => {
    const n = planNotices({ ...base, now: NOW, prefs, gradeUps: [up('CHM-113', 91)] }).filter((x) => x.kind === 'grade_up');
    expect(n).toHaveLength(1);
    expect(n[0]).toMatchObject({ title: 'Grade up', body: 'Your CHM-113 grade went up to 91%.', key: 'grade_up:2026-10-02', url: '#/classes' });
    expect(Date.parse(n[0].sendAt) - Date.parse(NOW)).toBe(60_000);
  });
  it('two classes share one push (one a day); an old one is not sent; the switch turns it off', () => {
    expect(planNotices({ ...base, now: NOW, prefs, gradeUps: [up('CHM-113', 91), up('ENG-105', 88)] }).find((x) => x.kind === 'grade_up')?.body).toBe('Your CHM-113 and ENG-105 grades went up.');
    expect(planNotices({ ...base, now: NOW, prefs, gradeUps: [up('CHM-113', 91, '2026-10-01T03:00:00.000Z')] }).some((x) => x.kind === 'grade_up')).toBe(false);
    expect(planNotices({ ...base, now: NOW, prefs: { ...prefs, gradeUp: false }, gradeUps: [up('CHM-113', 91)] }).some((x) => x.kind === 'grade_up')).toBe(false);
  });
  it('waits out quiet hours', () => {
    const late = '2026-10-03T06:00:00.000Z'; // 11 PM Phoenix
    const n = planNotices({ ...base, today: '2026-10-02', now: late, prefs, gradeUps: [up('CHM-113', 91, '2026-10-03T05:55:00.000Z')] }).find((x) => x.kind === 'grade_up')!;
    expect(new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(n.sendAt))).toBe('07:00');
  });
});
