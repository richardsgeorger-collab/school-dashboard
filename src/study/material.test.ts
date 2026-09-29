import { describe, expect, it } from 'vitest';
import type { Course } from '../domain/types';
import { materialLine } from './material';

const c = (id: string, code: string) => ({ id, code }) as Course;
const courses = [c('chm', 'CHM-113'), c('eng', 'ENG-105'), c('esg', 'ESG-162')];

describe('what Practice has to build from', () => {
  it('names the classes with material and the ones without', () => {
    const r = materialLine(courses, [{ courseId: 'chm' }, { courseId: 'chm' }], [{ courseId: 'esg' }]);
    expect(r.text).toBe('On file: CHM-113 (2 decks) · ESG-162 (1 lecture). Nothing yet for ENG-105.');
    expect(r.empty.map((x) => x.code)).toEqual(['ENG-105']);
  });
  it('says what to do when nothing is on file at all', () => {
    const r = materialLine(courses, [], []);
    expect(r.text).toMatch(/^Nothing on file yet: drop/);
    expect(r.empty).toHaveLength(3);
  });
  it('says nothing with no classes', () => {
    expect(materialLine([], [], []).text).toBe('');
  });
});
