import { describe, expect, it } from 'vitest';
import { isQuietPast, noHaloSubmission } from './submission';
import type { Item } from './types';

const NOW = Date.parse('2026-10-24T18:00:00Z');
const item = (o: Partial<Item>): Item => ({ id: 'x', courseId: 'c', title: 'x', type: 'quiz', points: 50, dueAt: '2026-10-23T15:00:00Z', status: 'todo', score: null, source: 'halo', flags: { inClass: false }, ...o }) as unknown as Item;

describe('work with no Halo submission', () => {
  it('outside tools (LTI) and in-person work have none; Halo quizzes, discussions and dropboxes do', () => {
    expect(noHaloSubmission(item({ haloType: 'LTI' }))).toBe(true);
    expect(noHaloSubmission(item({ haloType: 'ASSIGNMENT', haloInPerson: true }))).toBe(true);
    expect(noHaloSubmission(item({ haloType: 'QUIZ' }))).toBe(false);
    expect(noHaloSubmission(item({ haloType: 'DISCUSSION_QUESTION', type: 'discussion' }))).toBe(false);
    expect(noHaloSubmission(item({ haloType: 'ASSIGNMENT', type: 'paper' }))).toBe(false);
    expect(noHaloSubmission(item({ haloType: 'LTI', source: 'manual' as Item['source'] }))).toBe(false);
    // CHM-113L's labs (2026-10-24): "in class" from the syllabus, a Halo dropbox, so overdue when late.
    expect(noHaloSubmission(item({ haloType: 'ASSIGNMENT', type: 'lab', flags: { inClass: true } as Item['flags'], haloInPerson: false }))).toBe(false);
    expect(noHaloSubmission(item({ haloType: 'ASSIGNMENT', type: 'lab', flags: { inClass: true } as Item['flags'] }))).toBe(false);
    // Anything Halo shows handed in had a submission.
    expect(noHaloSubmission(item({ haloType: 'ASSIGNMENT', haloInPerson: true, halo: { status: 'SUBMITTED', submittedAt: '2026-10-24T02:00:00Z' } as Item['halo'] }))).toBe(false);
  });
  it('quiet once its date passes, unless done or graded', () => {
    const quiz = item({ haloType: 'ASSIGNMENT', haloInPerson: true });
    expect(isQuietPast(quiz, NOW)).toBe(true);
    expect(isQuietPast({ ...quiz, dueAt: '2026-10-25T15:00:00Z' }, NOW)).toBe(false);
    expect(isQuietPast({ ...quiz, status: 'done' }, NOW)).toBe(false);
    expect(isQuietPast({ ...quiz, score: 45 }, NOW)).toBe(false);
    expect(isQuietPast(item({ haloType: 'QUIZ' }), NOW)).toBe(false);
  });
});

describe('past work with no Halo submission leaves the counts', () => {
  const tz = 'America/Phoenix';
  const today = '2026-10-24';
  const quiz = item({ id: 'q', haloType: 'ASSIGNMENT', haloInPerson: true, estimatedMinutes: 60, dueAt: '2026-10-23T15:00:00Z' });
  const report = item({ id: 'r', haloType: 'ASSIGNMENT', type: 'paper', estimatedMinutes: 60, dueAt: '2026-10-23T15:00:00Z' });
  it('the Cooked meter and the schedule: never overdue, no time planned', async () => {
    const { cookMeter } = await import('./cook');
    const { computeSchedule } = await import('./schedule');
    const { DEFAULT_SETTINGS } = await import('./types');
    expect(cookMeter([quiz], today, tz, undefined, NOW).load).toBe(0);
    expect(cookMeter([report], today, tz, undefined, NOW).load).toBeGreaterThan(0);
    const s = computeSchedule([quiz, report], { ...DEFAULT_SETTINGS, timezone: tz }, today, { start: '2026-09-01', end: '2026-12-20' }, new Date(NOW).toISOString());
    expect(s.byItem.q.risk).toBeNull();
    expect(s.byItem.r.risk).toBe('overdue');
  });
});
