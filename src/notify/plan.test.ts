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
  it('a part with its own date counts as due that day: the Wednesday initial post inside a Sunday discussion', () => {
    const dq = { ...item('DQ 3', '2026-09-27', 10), requirements: [{ id: 'r1', text: 'Post your initial reply.', dueAt: `${TODAY}T23:59:00-07:00`, done: false, doneAt: null, gradedOn: true, scope: 'instance' as const, source: { kind: 'announcement' as const, id: 'p', title: null, quote: 'q', at: null }, addedAt: NOW }] };
    const n = planNotices({ items: [dq], courses: [course], schedule: schedule(), prefs: { morningTime: '07:30' }, tz: TZ, today: TODAY, now: NOW, lastPull: NOW });
    expect(n.find((x) => x.kind === 'morning')?.body).toBe('1 due today. First: DQ 3: Post your initial reply (CHM-113).');
  });
  it('the Sunday recap at six, on Max, when the coming Sunday is today or tomorrow; nothing without Max or off a Sunday', () => {
    // 2026-09-27 is a Sunday. Planned on Sunday itself (today) and on Saturday (tomorrow), never on a Wednesday.
    const base = { items: [item('Lab 3', '2026-09-30', 50)], courses: [course], schedule: schedule(), prefs: { morningTime: 'off' as const }, tz: TZ, lastPull: NOW, recap: true };
    const onSunday = planNotices({ ...base, today: '2026-09-27', now: '2026-09-27T13:00:00.000Z' }).filter((x) => x.kind === 'sunday');
    expect(onSunday).toHaveLength(1);
    expect(onSunday[0].sendAt).toBe('2026-09-28T01:00:00.000Z');
    expect(onSunday[0].body).toBe('Last week: 0 done. This week: 1 coming, the biggest is Lab 3 on Wed.');
    expect(planNotices({ ...base, today: '2026-09-26', now: '2026-09-26T13:00:00.000Z' }).filter((x) => x.kind === 'sunday')).toHaveLength(1);
    expect(planNotices({ ...base, today: '2026-09-23', now: '2026-09-23T13:00:00.000Z' }).filter((x) => x.kind === 'sunday')).toHaveLength(0);
    expect(planNotices({ ...base, recap: false, today: '2026-09-27', now: '2026-09-27T13:00:00.000Z' }).filter((x) => x.kind === 'sunday')).toHaveLength(0);
    expect(planNotices({ ...base, prefs: { morningTime: 'off', sunday: false }, today: '2026-09-27', now: '2026-09-27T13:00:00.000Z' }).filter((x) => x.kind === 'sunday')).toHaveLength(0);
  });
  it('the trial reminds twice: two days before it ends, and the morning of the last day, each with the recap', () => {
    // Started Sep 28 at 6 PM Phoenix; ends Oct 5 at 6 PM, the last day.
    const base = { items: [], courses: [course], schedule: schedule(), prefs: { morningTime: 'off' as const }, tz: TZ, lastPull: NOW, trialEndsAt: '2026-10-06T01:00:00.000Z', trialRecap: 'Max during your trial: read 12 announcements, found 3 hidden requirements.' };
    const t = planNotices({ ...base, today: '2026-10-01', now: '2026-10-01T13:00:00.000Z' }).filter((x) => x.kind === 'trial_ends');
    expect(t.map((x) => [x.sendAt, x.title])).toEqual([
      ['2026-10-04T01:00:00.000Z', 'Your Max trial ends in 2 days'],
      ['2026-10-05T15:00:00.000Z', 'Last day of your Max trial'],
    ]);
    expect(t[0].body).toBe('Max during your trial: read 12 announcements, found 3 hidden requirements. After that you go back to Free: Halo sync pauses and the study tools lock. Nothing charges.');
    expect(t[1].body).toContain('Tomorrow you go back to Free');
    // After the first has gone, only the last-day one is planned; after the end, none.
    expect(planNotices({ ...base, today: '2026-10-04', now: '2026-10-04T13:00:00.000Z' }).filter((x) => x.kind === 'trial_ends')).toHaveLength(1);
    expect(planNotices({ ...base, today: '2026-10-06', now: '2026-10-06T13:00:00.000Z' }).filter((x) => x.kind === 'trial_ends')).toHaveLength(0);
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

describe('the Saturday participation reminder', () => {
  const part = (status: string) => ({ ...item('Week 4 Participation', '2026-09-27', 10, status, 'participation'), requirements: [] }) as Item;
  const base = { courses: [course], schedule: schedule(), prefs: { morningTime: 'off' }, tz: TZ, lastPull: NOW };
  it('goes out Saturday at nine when participation is still open, and not when it is done or switched off', () => {
    const fri = { ...base, today: '2026-09-25', now: '2026-09-25T20:00:00.000Z' };
    const n = planNotices({ ...fri, items: [part('todo')] }).filter((x) => x.kind === 'participation');
    expect(n).toHaveLength(1);
    expect(n[0].sendAt).toBe('2026-09-26T16:00:00.000Z');
    expect(n[0].body).toBe('1 thing left this week in CHM-113. Open the list on Now.');
    expect(planNotices({ ...fri, items: [part('done')] }).filter((x) => x.kind === 'participation')).toHaveLength(0);
    expect(planNotices({ ...fri, items: [part('todo')], prefs: { morningTime: 'off', participation: false } }).filter((x) => x.kind === 'participation')).toHaveLength(0);
    expect(planNotices({ ...base, today: '2026-09-23', now: '2026-09-23T20:00:00.000Z', items: [part('todo')] }).filter((x) => x.kind === 'participation')).toHaveLength(0);
  });
});
