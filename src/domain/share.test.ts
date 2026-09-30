import { describe, expect, it } from 'vitest';
import { gradeShare, shareLine } from './share';

describe('share of the class grade', () => {
  const c = (points: number) => ({ courseId: 'c', points });
  const items = [c(5), c(175), c(820), c(100), c(100), c(100), { courseId: 'd', points: 100 }];
  it('is the item over everything in its class', () => {
    expect(gradeShare(c(175), items)).toBe(13);
    expect(shareLine(c(5), items)).toBe('0.4% of grade');
  });
  it('says nothing until the class has enough on file to be the whole term', () => {
    // A 10-point discussion in a class with 15 points synced so far is not "67% of grade".
    const early = [{ courseId: 'e', points: 10 }, { courseId: 'e', points: 5 }];
    expect(shareLine({ courseId: 'e', points: 10 }, early)).toBeNull();
    expect(shareLine({ courseId: 'd', points: 100 }, items)).toBeNull();
  });
  it('says nothing for a zero-point item or an empty class', () => {
    expect(gradeShare(c(0), items)).toBeNull();
    expect(gradeShare({ courseId: 'zzz', points: 10 }, items)).toBeNull();
  });
});
