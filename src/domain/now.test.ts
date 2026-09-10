import { describe, expect, it } from 'vitest';
import { groupByDeadline, heroFraming, pressureLine, rankItems, termProgress, todayLine } from './now';
import { computeSchedule } from './schedule';
import { DEFAULT_FLAGS, DEFAULT_SETTINGS, type Item } from './types';

const TZ = 'America/Phoenix';
const TODAY = '2026-09-09';
const NOW = '2026-09-09T12:00:00-07:00';
const TERM = { start: '2026-09-08', end: '2026-12-20' };
let n = 0;
function item(over: Partial<Item>): Item {
  n += 1;
  return {
    id: `i${n}`,
    courseId: 'c1',
    title: `Item ${n}`,
    label: `Item ${n}`,
    labelOverridden: false,
    type: 'homework',
    points: 10,
    opensAt: null,
    dueAt: '2026-09-20T23:59:00-07:00',
    estimatedMinutes: 60,
    estimateOverridden: false,
    startByOverride: null,
    status: 'todo',
    completedAt: null,
    score: null,
    notes: '',
    topic: null,
    flags: { ...DEFAULT_FLAGS },
    source: 'manual',
    award: null,
    updatedAt: NOW,
    ...over,
  };
}
const sched = (items: Item[]) => computeSchedule(items, DEFAULT_SETTINGS, TODAY, TERM, NOW);

describe('rankItems', () => {
  it('puts overdue first, then deadline, then longer estimate, then points', () => {
    const overdue = item({ id: 'overdue', dueAt: '2026-09-08T23:59:00-07:00', estimatedMinutes: 30 });
    const soonShort = item({ id: 'soonShort', dueAt: '2026-09-12T23:59:00-07:00', estimatedMinutes: 30, points: 50 });
    const soonLong = item({ id: 'soonLong', dueAt: '2026-09-12T23:59:00-07:00', estimatedMinutes: 120, points: 10 });
    const later = item({ id: 'later', dueAt: '2026-09-15T23:59:00-07:00', estimatedMinutes: 600 });
    const done = item({ id: 'done', dueAt: '2026-09-10T23:59:00-07:00', status: 'done' });
    const items = [later, soonShort, done, soonLong, overdue];
    expect(rankItems(items, sched(items), NOW, TZ).map((i) => i.id)).toEqual(['overdue', 'soonLong', 'soonShort', 'later']);
  });
  it('breaks equal deadline and estimate by points', () => {
    const a = item({ id: 'a', points: 5 });
    const b = item({ id: 'b', points: 50 });
    const items = [a, b];
    expect(rankItems(items, sched(items), NOW, TZ).map((i) => i.id)).toEqual(['b', 'a']);
  });
  it('uses the morning-due rule via the schedule deadline', () => {
    const morning = item({ id: 'morning', dueAt: '2026-09-12T08:00:00-07:00' });
    const evening = item({ id: 'evening', dueAt: '2026-09-12T23:59:00-07:00' });
    const items = [morning, evening];
    expect(rankItems(items, sched(items), NOW, TZ).map((i) => i.id)).toEqual(['morning', 'evening']);
  });
  it('sends snoozed items to the back until the snooze ends', () => {
    const a = item({ id: 'a', dueAt: '2026-09-12T23:59:00-07:00', snoozedUntil: '2026-09-10' });
    const b = item({ id: 'b', dueAt: '2026-09-15T23:59:00-07:00' });
    const c = item({ id: 'c', dueAt: '2026-09-11T23:59:00-07:00', snoozedUntil: '2026-09-09' });
    const items = [a, b, c];
    expect(rankItems(items, sched(items), NOW, TZ).map((i) => i.id)).toEqual(['c', 'b', 'a']);
  });
});

describe('todayLine and heroFraming', () => {
  it('says nothing is due today and names the next deadline', () => {
    const items = [item({ dueAt: '2026-09-13T23:59:00-07:00' }), item({ dueAt: '2026-09-13T23:59:00-07:00' }), item({ dueAt: '2026-09-15T23:59:00-07:00' })];
    expect(todayLine(items, sched(items), TODAY, NOW, TZ)).toBe('Nothing due today. Next deadline Sunday, 2 things.');
  });
  it('counts today and overdue', () => {
    const items = [item({ dueAt: '2026-09-09T23:59:00-07:00' }), item({ dueAt: '2026-09-09T20:00:00-07:00' }), item({ dueAt: '2026-09-08T23:59:00-07:00' })];
    expect(todayLine(items, sched(items), TODAY, NOW, TZ)).toBe('1 overdue, 2 due today.');
    expect(todayLine([items[0]], sched([items[0]]), TODAY, NOW, TZ)).toBe('1 due today.');
  });
  it('is quiet with nothing open', () => {
    expect(todayLine([], sched([]), TODAY, NOW, TZ)).toBe('Nothing open.');
  });
  it('frames the hero as ahead when its start-by is still in the future', () => {
    const ahead = item({ dueAt: '2026-09-20T23:59:00-07:00', estimatedMinutes: 60 });
    const now = item({ dueAt: '2026-09-10T23:59:00-07:00', estimatedMinutes: 60 });
    const items = [ahead, now];
    const s = sched(items);
    expect(heroFraming(ahead, s, TODAY, NOW)).toBe('ahead');
    expect(heroFraming(now, s, TODAY, NOW)).toBe('now');
    expect(heroFraming(item({ dueAt: '2026-09-08T23:59:00-07:00' }), s, TODAY, NOW)).toBe('overdue');
  });
});

describe('pressureLine', () => {
  const run = (items: Item[]) => pressureLine(items, sched(items), DEFAULT_SETTINGS, TODAY, NOW);
  it('is silent when nothing is pressing', () => {
    expect(run([item({ dueAt: '2026-09-25T23:59:00-07:00' })])).toBeNull();
  });
  it('names overdue first', () => {
    const items = [item({ dueAt: '2026-09-08T23:59:00-07:00' }), item({ label: 'Chem HW 1', dueAt: '2026-09-07T23:59:00-07:00' })];
    expect(run(items)).toBe('2 overdue. Chem HW 1 first.');
  });
  it('describes a heavy day with untouched work', () => {
    const items = Array.from({ length: 5 }, (_, k) => item({ dueAt: '2026-09-13T23:59:00-07:00', estimatedMinutes: 60 + k * 30 }));
    expect(run(items)).toBe("Sunday is heavy: 5 items, 10h. You haven't started any.");
  });
  it('counts progress on a heavy day while under half done', () => {
    const items = [
      ...Array.from({ length: 4 }, () => item({ dueAt: '2026-09-13T23:59:00-07:00', estimatedMinutes: 60 })),
      item({ dueAt: '2026-09-13T23:59:00-07:00', estimatedMinutes: 60, status: 'done' }),
    ];
    expect(run(items)).toBe('Sunday is heavy: 5 items, 5h. 1 of 5 done.');
  });
  it('stops calling a day heavy once more than half is done', () => {
    const items = [
      ...Array.from({ length: 4 }, () => item({ dueAt: '2026-09-13T23:59:00-07:00', estimatedMinutes: 60 })),
      ...Array.from({ length: 5 }, () => item({ dueAt: '2026-09-13T23:59:00-07:00', estimatedMinutes: 60, status: 'done' })),
    ];
    expect(run(items)).toBeNull();
    const heavyRemainder = items.map((i) => (i.status === 'todo' ? { ...i, estimatedMinutes: 90 } : i)); // 6h left > 5h Sunday capacity
    expect(run(heavyRemainder)).toBe('Sunday: 4 of 9 left, 6h to go.');
  });
  it('flags an item that will not fit', () => {
    const items = [item({ label: 'Chem Exam 1', dueAt: '2026-09-10T23:59:00-07:00', estimatedMinutes: 900 })];
    expect(run(items)).toBe("Chem Exam 1 won't fit before Thursday unless you start now.");
  });
});

describe('groupByDeadline', () => {
  it('groups items by schedule deadline day in order', () => {
    const a = item({ id: 'a', dueAt: '2026-09-13T23:59:00-07:00' });
    const b = item({ id: 'b', dueAt: '2026-09-14T23:59:00-07:00' });
    const c = item({ id: 'c', dueAt: '2026-09-13T23:59:00-07:00' });
    const items = [a, b, c];
    expect(groupByDeadline([a, c, b], sched(items)).map((g) => [g.day, g.items.map((i) => i.id)])).toEqual([
      ['2026-09-13', ['a', 'c']],
      ['2026-09-14', ['b']],
    ]);
  });
});

describe('termProgress', () => {
  it('banks completed points, using real scores when present, and reports term elapsed', () => {
    const items = [item({ points: 100, status: 'done', score: 90 }), item({ points: 50, status: 'done' }), item({ points: 50 })];
    expect(termProgress(items, TERM, '2026-09-29')).toEqual({ earned: 140, total: 200, pct: 70, elapsedPct: 20 });
  });
  it('handles an empty term', () => {
    expect(termProgress([], TERM, '2026-09-08')).toEqual({ earned: 0, total: 0, pct: 0, elapsedPct: 0 });
  });
});
