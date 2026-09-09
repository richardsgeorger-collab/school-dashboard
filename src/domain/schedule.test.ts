import { describe, expect, it } from 'vitest';
import { computeSchedule, deadlineDay } from './schedule';
import { DEFAULT_FLAGS, DEFAULT_SETTINGS, type Item } from './types';

const TERM = { start: '2026-09-08', end: '2026-12-20' };
const TODAY = '2026-09-09';
const NOW = '2026-09-09T12:00:00-07:00';

let n = 0;
function item(over: Partial<Item>): Item {
  n += 1;
  return {
    id: `i${n}`,
    courseId: 'c1',
    title: `Item ${n}`,
    type: 'homework',
    points: 10,
    opensAt: null,
    dueAt: '2026-09-20T23:59:00-07:00',
    estimatedMinutes: 120,
    estimateOverridden: false,
    startByOverride: null,
    status: 'todo',
    completedAt: null,
    score: null,
    notes: '',
    topic: null,
    flags: { ...DEFAULT_FLAGS },
    source: 'manual',
    updatedAt: NOW,
    ...over,
  };
}

const run = (items: Item[], today = TODAY, now = NOW) => computeSchedule(items, DEFAULT_SETTINGS, today, TERM, now);

describe('deadlineDay', () => {
  it('uses the due date when due late in the day', () => {
    expect(deadlineDay(item({ dueAt: '2026-09-13T23:59:00-07:00' }), 'America/Phoenix')).toBe('2026-09-13');
  });
  it('uses the previous day when due before 6 PM', () => {
    expect(deadlineDay(item({ dueAt: '2026-09-25T08:00:00-07:00' }), 'America/Phoenix')).toBe('2026-09-24');
    expect(deadlineDay(item({ dueAt: '2026-10-07T12:45:00-07:00' }), 'America/Phoenix')).toBe('2026-10-06');
  });
});

describe('computeSchedule', () => {
  it('plans a single item to finish a day before its deadline', () => {
    const a = item({ estimatedMinutes: 120, dueAt: '2026-09-13T23:59:00-07:00' });
    const s = run([a]).byItem[a.id];
    expect(s.deadlineDay).toBe('2026-09-13');
    expect(s.latestStart).toBe('2026-09-12');
    expect(s.startBy).toBe('2026-09-12');
    expect(s.fits).toBe(true);
    expect(s.plannedByDay).toEqual({ '2026-09-12': 120 });
  });

  it('spills into the buffer days rather than failing when the buffered window is tight', () => {
    const a = item({ estimatedMinutes: 300, dueAt: '2026-09-11T23:59:00-07:00' });
    const s = run([a]).byItem[a.id];
    expect(s.plannedByDay).toEqual({ '2026-09-09': 180, '2026-09-10': 120 });
    expect(s.fits).toBe(true);
    expect(s.startBy).toBe('2026-09-09');
  });

  it('gives tiny items no allocation and start-by the day before', () => {
    const a = item({ estimatedMinutes: 30, dueAt: '2026-09-13T23:59:00-07:00' });
    const r = run([a]);
    expect(r.byItem[a.id].startBy).toBe('2026-09-12');
    expect(r.byItem[a.id].plannedByDay).toEqual({});
    expect(r.loadByDay['2026-09-13'] ?? 0).toBe(0);
  });

  it('pushes earlier-due work earlier when later-due work claims the days first', () => {
    const a = item({ id: 'A', estimatedMinutes: 600, dueAt: '2026-09-20T23:59:00-07:00' });
    const b = item({ id: 'B', estimatedMinutes: 600, dueAt: '2026-09-21T23:59:00-07:00' });
    const r = run([a, b]);
    expect(r.byItem.B.plannedByDay).toEqual({ '2026-09-19': 300, '2026-09-18': 180, '2026-09-17': 120 });
    expect(r.byItem.B.startBy).toBe('2026-09-17');
    expect(r.byItem.A.plannedByDay).toEqual({ '2026-09-17': 60, '2026-09-16': 180, '2026-09-15': 180, '2026-09-14': 180 });
    expect(r.byItem.A.latestStart).toBe('2026-09-14');
    expect(r.byItem.A.startBy).toBe('2026-09-14');
    expect(r.loadByDay['2026-09-17']).toBe(180);
  });

  it('never plans before the item opens and flags overflow as at risk', () => {
    const a = item({
      estimatedMinutes: 1000,
      opensAt: '2026-09-14T00:00:00-07:00',
      dueAt: '2026-09-16T23:59:00-07:00',
    });
    const s = run([a]).byItem[a.id];
    expect(Object.keys(s.plannedByDay).sort()).toEqual(['2026-09-14', '2026-09-15', '2026-09-16']);
    expect(s.fits).toBe(false);
    expect(s.risk).toBe('at_risk');
    expect(s.startBy).toBe('2026-09-14');
  });

  it('ignores an open date that falls on the due day (in-class quiz opening the morning of)', () => {
    const a = item({
      estimatedMinutes: 180,
      opensAt: '2026-09-25T00:00:00-07:00',
      dueAt: '2026-09-25T08:00:00-07:00',
    });
    const s = run([a]).byItem[a.id];
    expect(s.deadlineDay).toBe('2026-09-24');
    expect(s.plannedByDay).toEqual({ '2026-09-23': 180 });
    expect(s.fits).toBe(true);
    expect(s.startBy).toBe('2026-09-23');
    expect(s.risk).toBeNull();
  });

  it('never plans before today', () => {
    const a = item({ estimatedMinutes: 600, dueAt: '2026-09-10T23:59:00-07:00' });
    const s = run([a]).byItem[a.id];
    expect(Object.keys(s.plannedByDay).sort()).toEqual(['2026-09-09', '2026-09-10']);
    expect(s.fits).toBe(false);
  });

  it('assigns risk flags with precedence overdue > at_risk > due_soon > start_today', () => {
    const overdue = item({ dueAt: '2026-09-08T23:59:00-07:00' });
    const dueSoon = item({ estimatedMinutes: 60, dueAt: '2026-09-10T18:00:00-07:00' });
    const startToday = item({ estimatedMinutes: 300, dueAt: '2026-09-11T23:59:00-07:00' });
    const fine = item({ estimatedMinutes: 60, dueAt: '2026-09-30T23:59:00-07:00' });
    const r = run([overdue, dueSoon, startToday, fine]);
    expect(r.byItem[overdue.id].risk).toBe('overdue');
    expect(r.byItem[dueSoon.id].risk).toBe('due_soon');
    expect(r.byItem[startToday.id].risk).toBe('start_today');
    expect(r.byItem[fine.id].risk).toBeNull();
  });

  it('does not flag start_today for items already in progress', () => {
    const a = item({ estimatedMinutes: 300, dueAt: '2026-09-12T23:59:00-07:00', status: 'in_progress' });
    expect(run([a]).byItem[a.id].risk).toBeNull();
  });

  it('done items free capacity and carry no risk', () => {
    const done = item({ estimatedMinutes: 600, dueAt: '2026-09-08T23:59:00-07:00', status: 'done' });
    const r = run([done]);
    expect(r.byItem[done.id].risk).toBeNull();
    expect(r.byItem[done.id].plannedByDay).toEqual({});
    expect(Object.values(r.loadByDay).reduce((a, b) => a + b, 0)).toBe(0);
  });

  it('honours a manual start-by override', () => {
    const a = item({ estimatedMinutes: 120, dueAt: '2026-09-20T23:59:00-07:00', startByOverride: '2026-09-10' });
    expect(run([a]).byItem[a.id].startBy).toBe('2026-09-10');
  });

  it('accumulates weekly load per course and in total', () => {
    const a = item({ courseId: 'c1', estimatedMinutes: 120, dueAt: '2026-09-16T23:59:00-07:00' });
    const b = item({ courseId: 'c2', estimatedMinutes: 60, dueAt: '2026-09-17T23:59:00-07:00' });
    const r = run([a, b]);
    expect(r.weekLoad['2026-09-13']).toEqual({ c1: 120, c2: 60, total: 180 });
    expect(r.capacityByDay['2026-09-12']).toBe(300);
    expect(r.capacityByDay['2026-09-14']).toBe(180);
  });
});
