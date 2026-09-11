import { describe, expect, it } from 'vitest';
import { mkCourse } from '../halo/fixtures';
import { syllabusContext, tidySyllabusText } from './context';

describe('syllabus context for the coach', () => {
  it('tidies extracted text and caps it', () => {
    expect(tidySyllabusText('Late  work:   10%   \n\n\n\nper day  \r\n')).toBe('Late work: 10%\n\nper day');
    const long = tidySyllabusText('x'.repeat(40_000), 100);
    expect(long.length).toBeLessThan(130);
    expect(long.endsWith('[syllabus truncated]')).toBe(true);
  });
  it('sections by class in course order and skips classes without one', () => {
    const courses = [mkCourse({ id: 'c1', code: 'CHM-113', name: 'General Chemistry I-Lecture' }), mkCourse({ id: 'c2', code: 'ENG-105', name: 'English Composition I' })];
    const ctx = syllabusContext(courses, [{ courseId: 'c2', name: 'eng.pdf', text: 'Late policy: 10% per day.', chars: 25, addedAt: 'x' }]);
    expect(ctx).toBe('## ENG-105 English Composition I (syllabus, eng.pdf)\nLate policy: 10% per day.');
    expect(syllabusContext(courses, [])).toBe('');
  });
});
