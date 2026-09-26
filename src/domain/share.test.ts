import { describe, expect, it } from 'vitest';
import { gradeShare, shareLine } from './share';

describe('share of the class grade', () => {
  const items = [
    { courseId: 'c', points: 5 },
    { courseId: 'c', points: 175 },
    { courseId: 'c', points: 820 },
    { courseId: 'd', points: 100 },
  ];
  it('is the item over everything in its class', () => {
    expect(gradeShare({ courseId: 'c', points: 175 }, items)).toBe(18);
    expect(shareLine({ courseId: 'c', points: 5 }, items)).toBe('0.5% of grade');
    expect(shareLine({ courseId: 'd', points: 100 }, items)).toBe('100% of grade');
  });
  it('says nothing for a zero-point item or an empty class', () => {
    expect(gradeShare({ courseId: 'c', points: 0 }, items)).toBeNull();
    expect(gradeShare({ courseId: 'zzz', points: 10 }, items)).toBeNull();
  });
});
