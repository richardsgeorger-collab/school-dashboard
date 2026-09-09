import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseGcuSyllabus } from './gcuSyllabus';
import { toAppData } from './toAppData';

const lines = readFileSync(new URL('./fixtures/chm113.txt', import.meta.url), 'utf8').split('\n');
const parsed = parseGcuSyllabus(lines);

describe('toAppData', () => {
  it('builds a course with defaults and drops zero-point items by default', () => {
    const { course, items } = toAppData(parsed, {
      includeZeroPoint: false,
      tz: 'America/Phoenix',
      defaults: { color: '#e05a4b', meetings: [{ day: 3, start: '07:00', end: '08:15' }], online: false },
    });
    expect(course.code).toBe('CHM-113');
    expect(course.color).toBe('#e05a4b');
    expect(course.meetings).toHaveLength(1);
    expect(course.termEnd).toBe('2026-12-20');
    expect(items).toHaveLength(41);
    expect(items.every((i) => i.points > 0)).toBe(true);
    expect(items.every((i) => i.courseId === course.id)).toBe(true);
  });

  it('keeps zero-point items when asked', () => {
    const { items } = toAppData(parsed, { includeZeroPoint: true, tz: 'America/Phoenix' });
    expect(items).toHaveLength(47);
  });

  it('classifies, estimates and sets flags', () => {
    const { items } = toAppData(parsed, { includeZeroPoint: false, tz: 'America/Phoenix' });
    const quiz = items.find((i) => i.title === 'Quiz #1')!;
    expect(quiz.type).toBe('quiz');
    expect(quiz.estimatedMinutes).toBe(180);
    expect(quiz.flags.inClass).toBe(true);
    expect(quiz.flags.practice).toBe(false);
    expect(quiz.topic).toBe('Topic 2: Electronic Structure of Atoms and Periodicity of Elements');
    expect(quiz.source).toBe('parsed');
    expect(quiz.status).toBe('todo');
    const pq = items.find((i) => i.title === 'Practice Quiz 1')!;
    expect(pq.flags.practice).toBe(true);
    expect(pq.flags.inClass).toBe(false);
    expect(pq.notes).toBe('Complete and submit the practice quiz in ALEKS.');
  });

  it('reuses an existing course id when given', () => {
    const { course } = toAppData(parsed, { includeZeroPoint: false, tz: 'America/Phoenix', existingCourseId: 'keep-me' });
    expect(course.id).toBe('keep-me');
  });
});
