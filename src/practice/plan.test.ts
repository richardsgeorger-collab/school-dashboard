import { describe, expect, it } from 'vitest';
import { computeSchedule } from '../domain/schedule';
import type { Item, Settings } from '../domain/types';
import { DEFAULT_SETTINGS } from '../domain/types';
import { planForTest, testTopics, topicsForTest } from './plan';

const tz = 'America/Phoenix';
const today = '2026-09-28';
const settings: Settings = { ...DEFAULT_SETTINGS, timezone: tz, weekdayMinutes: 120, weekendMinutes: 240 };
const it_ = (id: string, type: Item['type'], due: string, minutes = 60): Item => ({ id, courseId: 'chm', title: id, label: id, type, topic: null, dueAt: `${due}T15:00:00.000Z`, points: 50, status: 'todo', estimatedMinutes: minutes, flags: {}, source: 'manual', updatedAt: 'x' } as unknown as Item);

describe('a plan for one named test', () => {
  const items = [it_('quiz2', 'quiz', '2026-10-06', 120), it_('exam1', 'exam', '2026-10-12', 240), it_('hw', 'homework', '2026-10-02', 60)];
  const schedule = computeSchedule(items, settings, today, { start: '2026-09-08', end: '2026-12-20' }, '2026-09-28T20:00:00Z');
  it('plans the test that was asked for, not the nearest one', () => {
    const p = planForTest(items[1], items, schedule, settings, today);
    expect(p?.exam.id).toBe('exam1');
    expect(p!.sessions.length).toBeGreaterThan(0);
    expect(p!.sessions.length).toBeLessThanOrEqual(4);
    for (const s of p!.sessions) expect(s.minutes).toBeGreaterThanOrEqual(30);
    expect(p!.sessions.reduce((n, s) => n + s.minutes, 0)).toBe(240);
  });
  it('still plans the nearer one when that is what was asked', () => {
    expect(planForTest(items[0], items, schedule, settings, today)?.exam.id).toBe('quiz2');
  });
  it('a test that has passed gets no plan', () => {
    expect(planForTest(it_('old', 'quiz', '2026-09-20'), items, schedule, settings, today)).toBeNull();
  });
  it('the test’s own topics come first in the sessions, then the rest of the material', () => {
    const test = { ...it_('q', 'quiz', '2026-10-06'), topic: 'limiting reagent' } as Item;
    const decks = [
      { id: 'd1', courseId: 'chm', title: 'Topic 3: Moles', tag: 'Moles', date: '2026-09-10', pages: 4 },
      { id: 'd2', courseId: 'chm', title: 'Topic 4: Limiting reagent', tag: 'Limiting reagent', date: '2026-09-23', pages: 4 },
    ] as never;
    const pages = [1, 2, 3, 4].flatMap((n) => [{ deckId: 'd1', n, text: 'x'.repeat(50) }, { deckId: 'd2', n, text: 'y'.repeat(50) }]);
    const topics = topicsForTest(test, 2, decks, pages, undefined);
    expect(topics[0].topic.toLowerCase()).toContain('limiting');
    expect(testTopics(test)).toEqual(['limiting reagent']);
  });
});
