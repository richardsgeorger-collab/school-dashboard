import { describe, expect, it } from 'vitest';
import { mkItem, TZ } from '../halo/fixtures';
import { classNext } from './classNext';
import { cookMeter } from './cook';
import { itemTone } from './status';
import { isQuietPast } from './submission';

/**
 * Participation is never overdue or urgent anywhere (George, 2026-10-24). On his account CHM-113's card said "Next:
 * Chem Participation W7 Day 1 · 3 days late" and "Behind: 1 overdue": that day's post is one Halo files as a
 * DISCUSSION_QUESTION (Halo+ type "discussion"), 0 points, Halo status LATE, so every rule keyed on the "participation"
 * type missed it. The item below is that one, field for field (read only from his data).
 */
const NOW = Date.parse('2026-10-24T18:00:00Z');
const today = '2026-10-24';
const day1 = mkItem({
  id: 'p1',
  courseId: 'chm',
  title: 'Week 7, Day 1 Participation',
  label: 'Chem Participation W7 Day 1',
  type: 'discussion',
  haloType: 'DISCUSSION_QUESTION',
  points: 0,
  source: 'halo',
  status: 'todo',
  dueAt: '2026-10-21T23:59:00-07:00',
  haloLate: '2026-10-22T07:00:00Z',
  halo: { status: 'LATE', submittedAt: null, checkedAt: '' },
});
const homework = mkItem({ id: 'h1', courseId: 'chm', title: 'Topic 4 Homework', label: 'Chem HW 4', type: 'homework', points: 20, dueAt: '2026-10-27T23:59:00-07:00' });

describe('"Chem Participation W7 Day 1": never overdue, never urgent', () => {
  it('quiet once its date passes, like work with no Halo submission', () => {
    expect(isQuietPast(day1, NOW)).toBe(true);
  });
  it('the class card: not overdue, not Behind, not Next', () => {
    const r = classNext([day1, homework], today, TZ);
    expect(r.overdue).toEqual([]);
    expect(r.next?.label).toBe('Chem HW 4');
  });
  it('no Late or Due tone anywhere (rows, pills, Calendar)', () => {
    expect(itemTone(day1, new Date(NOW).toISOString())).toBeNull();
    expect(itemTone({ ...day1, dueAt: '2026-10-25T08:00:00-07:00', haloLate: null }, new Date(NOW).toISOString())).toBeNull();
  });
  it('the Cooked meter counts no overdue', () => {
    expect(cookMeter([day1, homework], today, TZ, (i) => i.estimatedMinutes, NOW).overdue).toBe(0);
  });
});
