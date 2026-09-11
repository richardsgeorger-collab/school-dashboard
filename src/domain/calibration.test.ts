import { describe, expect, it } from 'vitest';
import { mkCourse, mkItem } from '../halo/fixtures';
import { actualStats, calibrate, MIN_SAMPLES, withCalibration } from './calibration';

const chm = mkCourse({ id: 'c1', code: 'CHM-113' });
const done = (id: string, actualMinutes: number, type: 'homework' | 'quiz' = 'homework') => mkItem({ id, courseId: 'c1', title: id, type, status: 'done', completedAt: 'x', actualMinutes });

describe('time calibration', () => {
  it('averages real minutes per class and type, ignoring open items and untimed ones', () => {
    const stats = actualStats([done('a', 40), done('b', 50), done('c', 30), done('q', 20, 'quiz'), mkItem({ id: 'open', courseId: 'c1', title: 'open', actualMinutes: 90 }), done('z', 0)]);
    expect(stats.get('c1|homework')).toEqual({ n: 3, mean: 40 });
    expect(stats.get('c1|quiz')).toEqual({ n: 1, mean: 20 });
  });
  it('uses the average only after enough samples, rounded to five, with a plain label', () => {
    const two = actualStats([done('a', 40), done('b', 50)]);
    const item = mkItem({ id: 'n', courseId: 'c1', title: 'Topic 4 Homework', type: 'homework', estimatedMinutes: 75 });
    expect(calibrate(item, two, chm)).toEqual({ minutes: 75, basis: 'estimate', label: 'estimate' });
    const three = actualStats([done('a', 40), done('b', 50), done('c', 33)]);
    expect(MIN_SAMPLES).toBe(3);
    expect(calibrate(item, three, chm)).toEqual({ minutes: 40, basis: 'actual', label: 'your average for chem homework' });
    const quiz = mkItem({ id: 'q', courseId: 'c1', title: 'Quiz 4', type: 'quiz', estimatedMinutes: 60 });
    expect(calibrate(quiz, actualStats([done('1', 22, 'quiz'), done('2', 18, 'quiz'), done('3', 26, 'quiz')]), chm).label).toBe('your average for chem quizzes');
    expect(calibrate({ ...item, estimateOverridden: true, estimatedMinutes: 25 }, three, chm)).toEqual({ minutes: 25, basis: 'override', label: 'your estimate' });
  });
  it('feeds the scheduler calibrated minutes without writing anything back', () => {
    const three = actualStats([done('a', 40), done('b', 50), done('c', 33)]);
    const open = mkItem({ id: 'n', courseId: 'c1', title: 'HW', type: 'homework', estimatedMinutes: 75 });
    const kept = mkItem({ id: 'k', courseId: 'c1', title: 'Quiz', type: 'quiz', estimatedMinutes: 60 });
    const out = withCalibration([open, kept], three);
    expect(out[0].estimatedMinutes).toBe(40);
    expect(out[1].estimatedMinutes).toBe(60);
    expect(open.estimatedMinutes).toBe(75);
    expect(withCalibration([open], new Map())).toBe;
  });
});
