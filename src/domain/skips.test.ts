import { describe, expect, it } from 'vitest';
import { mkItem } from '../halo/fixtures';
import { afterDone, arrange, emptySkips, forDay, skip, unskip, urgent } from './skips';

const now = Date.parse('2026-10-08T20:00:00Z');
const a = mkItem({ id: 'a', courseId: 'c', title: 'Quiz 2', points: 40, dueAt: '2026-10-11T23:59:00-07:00' });
const b = mkItem({ id: 'b', courseId: 'c', title: 'Lab 4', points: 30, dueAt: '2026-10-12T23:59:00-07:00' });
const c = mkItem({ id: 'c', courseId: 'c', title: 'HW 3', points: 20, dueAt: '2026-10-13T23:59:00-07:00' });
const soon = mkItem({ id: 's', courseId: 'c', title: 'DQ reply', points: 10, dueAt: '2026-10-08T15:00:00-07:00' });
const ranked = [a, b, c];

describe('Not now as a quick skip (2026-10-08)', () => {
  it('the next thing takes the card at once; the skipped one waits in the row, one tap from coming back', () => {
    let s = skip(emptySkips('2026-10-08'), 'a');
    expect(arrange(ranked, s).ahead.map((i) => i.id)).toEqual(['b', 'c']);
    expect(arrange(ranked, s).row.map((i) => i.id)).toEqual(['a']);
    s = unskip(s, 'a');
    expect(arrange(ranked, s).ahead.map((i) => i.id)).toEqual(['a', 'b', 'c']);
    expect(s.counts.a).toBe(1);
  });
  it('comes back when something is finished, and when nothing else is left', () => {
    let s = skip(emptySkips('2026-10-08'), 'a');
    expect(afterDone(s, ranked, now).ids).toEqual([]);
    s = skip(skip(s, 'b'), 'c');
    // Everything skipped: they come back in rank order rather than an empty card.
    expect(arrange(ranked, s).ahead.map((i) => i.id)).toEqual(['a', 'b', 'c']);
    expect(arrange(ranked, s).row).toEqual([]);
  });
  it('three skips in a day: to the end of Then, out of the row, until something urgent brings it back', () => {
    let s = emptySkips('2026-10-08');
    for (let k = 0; k < 3; k++) s = skip(s, 'a');
    const out = arrange(ranked, s);
    expect(out.ahead.map((i) => i.id)).toEqual(['b', 'c']);
    expect(out.bench.map((i) => i.id)).toEqual(['a']);
    expect(out.row).toEqual([]);
    // A check-off does not bring a benched thing back…
    expect(afterDone(s, ranked, now).ids).toEqual(['a']);
    // …unless it is due within six hours or overdue.
    let t = emptySkips('2026-10-08');
    for (let k = 0; k < 3; k++) t = skip(t, 's');
    expect(urgent(soon, now)).toBe(true);
    expect(afterDone(t, [soon, ...ranked], now).ids).toEqual([]);
  });
  it('resets with the day', () => {
    const s = skip(emptySkips('2026-10-08'), 'a');
    expect(forDay(s, '2026-10-08')).toBe(s);
    expect(forDay(s, '2026-10-09')).toEqual(emptySkips('2026-10-09'));
  });
});
