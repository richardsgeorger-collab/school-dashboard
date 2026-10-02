import { describe, expect, it } from 'vitest';
import type { Item } from '../domain/types';
import { computeBadges } from './badges';

const TZ = 'America/Phoenix';
let n = 0;
const item = (due: string, finished: string | null, p: Partial<Item> = {}): Item => ({ id: `i${n++}`, courseId: 'c', title: 't', label: 't', type: 'homework', points: 20, dueAt: `${due}T23:59:00-07:00`, status: finished ? 'done' : 'todo', completedAt: finished ? `${finished}T12:00:00-07:00` : null, score: null, source: 'halo', halo: null, requirements: [], ...p }) as Item;
const run = (items: Item[], today = '2026-10-07') => computeBadges(items, today, TZ, 1);

describe('badges', () => {
  it('Early bird: turned in 2+ days before it was due; Halo submission time counts', () => {
    expect(run([item('2026-10-05', '2026-10-04')]).early_bird.earnedAt).toBeNull();
    expect(run([item('2026-10-05', '2026-10-03')]).early_bird.earnedAt).toBe('2026-10-03T12:00:00-07:00');
    const viaHalo = item('2026-10-05', null, { halo: { status: 'SUBMITTED', submittedAt: '2026-10-01T09:00:00-07:00', checkedAt: '' } });
    expect(run([viaHalo]).early_bird.count).toBe(1);
  });
  it('No late work this week: a finished week with nothing late or missed; not the week still running', () => {
    expect(run([item('2026-09-30', '2026-09-29'), item('2026-10-01', '2026-10-01')]).no_late_week).toEqual({ earnedAt: '2026-10-04', count: 1 });
    expect(run([item('2026-09-30', '2026-09-29'), item('2026-10-01', '2026-10-02')]).no_late_week.earnedAt).toBeNull();
    expect(run([item('2026-09-30', '2026-09-29'), item('2026-10-01', null)]).no_late_week.earnedAt).toBeNull();
    expect(run([item('2026-10-06', '2026-10-06')]).no_late_week.earnedAt).toBeNull();
  });
  it('Survived a heavy week: 5+ things or 300+ points due, all done', () => {
    const five = ['2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02', '2026-10-03'].map((d) => item(d, d));
    expect(run(five).heavy_week.earnedAt).toBe('2026-10-04');
    expect(run(five.slice(0, 4)).heavy_week.earnedAt).toBeNull();
    expect(run([item('2026-10-01', '2026-10-01', { points: 300 })]).heavy_week.count).toBe(1);
    expect(run([...five.slice(0, 4), item('2026-10-03', null)]).heavy_week.earnedAt).toBeNull();
  });
  it('Clean sweep: five days with everything due that day done on time; unchecking takes it back', () => {
    const days = ['2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02', '2026-10-03'];
    const items = days.map((d) => item(d, d));
    expect(run(items.slice(0, 4)).clean_sweep).toEqual({ earnedAt: null, count: 4 });
    expect(run(items).clean_sweep.earnedAt).toBe('2026-10-03');
    expect(run([...items.slice(0, 4), { ...items[4], status: 'todo', completedAt: null }]).clean_sweep.earnedAt).toBeNull();
  });
});
