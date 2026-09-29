import { describe, expect, it } from 'vitest';
import type { Item } from '../domain/types';
import { checkableWork, inDays, testWithin, upcomingTests } from './upcoming';

const tz = 'America/Phoenix';
const today = '2026-09-28';
const it_ = (id: string, type: Item['type'], due: string, points = 50, status: Item['status'] = 'todo'): Item => ({ id, courseId: 'c', title: id, label: id, type, dueAt: `${due}T16:00:00.000Z`, points, status, estimatedMinutes: 60, flags: {} } as unknown as Item);

describe('the tests ahead', () => {
  it('lists quizzes and exams within three weeks, nearest first, and skips done ones and homework', () => {
    const items = [it_('hw', 'homework', '2026-09-30'), it_('q2', 'quiz', '2026-10-05'), it_('e1', 'exam', '2026-10-15'), it_('q1', 'quiz', '2026-09-25', 20, 'done'), it_('far', 'exam', '2026-12-18')];
    expect(upcomingTests(items, today, tz).map((i) => i.id)).toEqual(['q2', 'e1']);
  });
  it('falls back to the next three when nothing is close, so the screen is never empty mid-term', () => {
    const items = [it_('a', 'quiz', '2026-11-05'), it_('b', 'exam', '2026-12-18'), it_('c', 'quiz', '2026-11-20'), it_('d', 'quiz', '2026-12-06')];
    expect(upcomingTests(items, today, tz).map((i) => i.id)).toEqual(['a', 'c', 'd']);
  });
  it('names the one within five days for Now, or none', () => {
    expect(testWithin([it_('q', 'quiz', '2026-10-02')], today, tz)?.id).toBe('q');
    expect(testWithin([it_('q', 'quiz', '2026-10-04')], today, tz)).toBeNull();
    expect(inDays(it_('q', 'quiz', '2026-10-02'), today, tz)).toBe('in 4 days');
    expect(inDays(it_('q', 'quiz', '2026-09-29'), today, tz)).toBe('tomorrow');
  });
  it('the work Check is for: open assignments due within a month or a bit late, no tests', () => {
    const items = [it_('essay', 'paper', '2026-10-09'), it_('late', 'homework', '2026-09-20'), it_('q', 'quiz', '2026-10-05'), it_('old', 'homework', '2026-08-01'), it_('far', 'paper', '2026-12-13')];
    expect(checkableWork(items, today, tz).map((i) => i.id)).toEqual(['late', 'essay']);
  });
});
