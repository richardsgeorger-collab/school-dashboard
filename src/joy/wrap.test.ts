import { describe, expect, it } from 'vitest';
import type { Item } from '../domain/types';
import { weekWrap, wrapLine } from './wrap';

const TZ = 'America/Phoenix';
let n = 0;
const fin = (day: string, points: number, viaHalo = false): Item => ({ id: `i${n++}`, courseId: 'c', type: 'homework', points, status: viaHalo ? 'todo' : 'done', completedAt: viaHalo ? null : `${day}T12:00:00-07:00`, score: null, source: 'halo', halo: viaHalo ? { status: 'SUBMITTED', submittedAt: `${day}T12:00:00-07:00`, checkedAt: '' } : null }) as unknown as Item;
const SUN = '2026-10-04'; // the week Sep 28 – Oct 4

describe('the Sunday wrap', () => {
  it('counts what was turned in Monday to Sunday, in real points', () => {
    const w = weekWrap([fin('2026-09-28', 100), fin('2026-10-02', 20, true), fin('2026-10-04', 50), fin('2026-09-27', 500), fin('2026-10-05', 40)], SUN, TZ);
    expect(w).toMatchObject({ weekStart: '2026-09-28', turnedIn: 3, points: 170 });
  });
  it('"Best week yet" only when it is true', () => {
    expect(weekWrap([fin('2026-10-01', 300), fin('2026-09-23', 200), fin('2026-09-15', 250)], SUN, TZ).best).toBe(true);
    expect(weekWrap([fin('2026-10-01', 200), fin('2026-09-23', 200)], SUN, TZ).best).toBe(false);
    expect(weekWrap([fin('2026-10-01', 300)], SUN, TZ).best).toBe(false); // no earlier week to beat
  });
  it('the line, and nothing when nothing was turned in', () => {
    expect(wrapLine(weekWrap([fin('2026-10-01', 300), fin('2026-10-02', 320), fin('2026-09-23', 100)], SUN, TZ), 'This week')).toBe('This week: 2 things turned in, 620 pts. Best week yet.');
    expect(wrapLine(weekWrap([], SUN, TZ), 'This week')).toBeNull();
  });
});
