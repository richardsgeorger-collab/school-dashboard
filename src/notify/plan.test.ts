import { describe, expect, it } from 'vitest';
import type { Schedule } from '../domain/schedule';
import type { Course, Item } from '../domain/types';
import { outsideQuiet, planNotices } from './plan';

const TZ = 'America/Phoenix';
const TODAY = '2026-09-24';
const NOW = '2026-09-24T13:00:00.000Z'; // 6:00 AM Phoenix
const course = { id: 'c1', code: 'CHM-113' } as Course;
const item = (id: string, due: string, points: number, status = 'todo', type = 'homework'): Item => ({ id, courseId: 'c1', title: id, label: id, dueAt: `${due}T23:59:00-07:00`, points, status, type, source: 'halo', estimatedMinutes: 60, score: null, updatedAt: NOW }) as unknown as Item;
const schedule = (over: Partial<Schedule> = {}): Schedule => ({ byItem: {}, loadByDay: {}, capacityByDay: {}, weekLoad: {}, ...over }) as Schedule;

describe('what to send and when', () => {
  it('a morning note at the chosen time with the first thing due, and one for tomorrow', () => {
    const n = planNotices({ items: [item('Lab 3', TODAY, 50), item('DQ', TODAY, 5)], courses: [course], schedule: schedule(), prefs: { morningTime: '07:30' }, tz: TZ, today: TODAY, now: NOW, lastPull: NOW });
    const morning = n.filter((x) => x.kind === 'morning');
    expect(morning).toHaveLength(2);
    expect(morning[0].sendAt).toBe('2026-09-24T14:30:00.000Z');
    expect(morning[0].body).toBe('2 due today. First: Lab 3 (CHM-113, 50 pts).');
    expect(morning[1].body).toContain('Nothing due today');
  });
  it('no morning note when it is off, no notes at all when every switch is off', () => {
    const items = [item('x', TODAY, 50)];
    expect(planNotices({ items, courses: [course], schedule: schedule(), prefs: { morningTime: 'off' }, tz: TZ, today: TODAY, now: NOW, lastPull: NOW }).some((x) => x.kind === 'morning')).toBe(false);
    expect(planNotices({ items, courses: [course], schedule: schedule(), prefs: { morning: false, heavyDay: false, notStarted: false, resync: false }, tz: TZ, today: TODAY, now: NOW, lastPull: NOW })).toEqual([]);
  });
  it('warns the night before a heavy day, at 8 PM', () => {
    const tomorrow = '2026-09-25';
    const n = planNotices({ items: [item('a', tomorrow, 10), item('b', tomorrow, 10), item('c', tomorrow, 30)], courses: [course], schedule: schedule({ loadByDay: { [tomorrow]: 240 }, capacityByDay: { [tomorrow]: 180 } }), prefs: {}, tz: TZ, today: TODAY, now: NOW, lastPull: NOW });
    const heavy = n.find((x) => x.kind === 'heavy_day')!;
    expect(heavy.sendAt).toBe('2026-09-25T03:00:00.000Z');
    expect(heavy.body).toBe('3 due tomorrow, about 4h planned against 3h. Start tonight: c.');
    expect(planNotices({ items: [item('a', tomorrow, 10)], courses: [course], schedule: schedule(), prefs: {}, tz: TZ, today: TODAY, now: NOW, lastPull: NOW }).some((x) => x.kind === 'heavy_day')).toBe(false);
  });
  it('nudges about big work not started within two days, once, at 6 PM, and never about small or started work', () => {
    const n = planNotices({ items: [item('Exam 1', '2026-09-26', 150, 'todo', 'exam'), item('tiny', '2026-09-25', 5), item('going', '2026-09-25', 100, 'in_progress')], courses: [course], schedule: schedule(), prefs: { morning: false, heavyDay: false, resync: false }, tz: TZ, today: TODAY, now: NOW, lastPull: NOW });
    expect(n).toHaveLength(1);
    expect(n[0].kind).toBe('not_started');
    expect(n[0].sendAt).toBe('2026-09-25T01:00:00.000Z');
    expect(n[0].body).toContain('Exam 1 (due Sep 26)');
    expect(n[0].body).not.toContain('tiny');
  });
  it('asks for a sync after three days, or when there never was one', () => {
    const stale = planNotices({ items: [], courses: [course], schedule: schedule(), prefs: { morning: false }, tz: TZ, today: TODAY, now: NOW, lastPull: '2026-09-20T12:00:00.000Z' }).find((x) => x.kind === 'resync')!;
    expect(stale.body).toContain('4 days ago');
    expect(stale.url).toBe('#/now?sync=1');
    expect(planNotices({ items: [], courses: [course], schedule: schedule(), prefs: { morning: false }, tz: TZ, today: TODAY, now: NOW, lastPull: '2026-09-23T12:00:00.000Z' }).some((x) => x.kind === 'resync')).toBe(false);
    expect(planNotices({ items: [], courses: [course], schedule: schedule(), prefs: { morning: false }, tz: TZ, today: TODAY, now: NOW, lastPull: null }).find((x) => x.kind === 'resync')!.body).toContain('not been synced yet');
  });
  it('nothing lands inside quiet hours: it waits for them to end', () => {
    // 11 PM Phoenix is 06:00Z next day; quiet 22:00 to 07:00 moves it to 07:00 Phoenix = 14:00Z.
    expect(outsideQuiet('2026-09-25T06:00:00.000Z', TZ, '22:00', '07:00')).toBe('2026-09-25T14:00:00.000Z');
    expect(outsideQuiet('2026-09-25T20:00:00.000Z', TZ, '22:00', '07:00')).toBe('2026-09-25T20:00:00.000Z');
    const n = planNotices({ items: [item('a', '2026-09-25', 10), item('b', '2026-09-25', 10), item('c', '2026-09-25', 10)], courses: [course], schedule: schedule(), prefs: { quietFrom: '19:00', quietTo: '21:30', morning: false, notStarted: false, resync: false }, tz: TZ, today: TODAY, now: NOW, lastPull: NOW });
    expect(n.find((x) => x.kind === 'heavy_day')!.sendAt).toBe('2026-09-25T04:30:00.000Z');
  });
  it('never plans anything already in the past', () => {
    const late = '2026-09-25T02:00:00.000Z'; // 7 PM Phoenix
    const n = planNotices({ items: [item('Exam 1', '2026-09-26', 150, 'todo', 'exam')], courses: [course], schedule: schedule(), prefs: { morningTime: '07:30', heavyDay: false, resync: false }, tz: TZ, today: TODAY, now: late, lastPull: late });
    for (const x of n) expect(x.sendAt > late).toBe(true);
    expect(n.filter((x) => x.kind === 'morning')).toHaveLength(1);
  });
});
