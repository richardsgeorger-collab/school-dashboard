import { describe, expect, it } from 'vitest';
import { mkItem, TZ } from '../halo/fixtures';
import { cookMeter } from './cook';

const at = (d: string) => `${d}T23:59:00-07:00`;
const today = '2026-09-17';
let n = 0;
const item = (type: Parameters<typeof mkItem>[0]['type'], due: string, minutes = 30, extra = {}) => mkItem({ id: `i${(n += 1)}`, courseId: 'c', title: `${type} ${n}`, label: `${type} ${n}`, type, points: 10, dueAt: at(due), estimatedMinutes: minutes, ...extra });

describe('the Cook meter', () => {
  it('is Chillin with nothing due, and says so', () => {
    const c = cookMeter([], today, TZ);
    expect(c.level).toBe('Chillin');
    expect(c.fill).toBe(0);
    expect(c.why).toBe('Nothing due in the next 2 weeks.');
  });
  it('counts a discussion post a little', () => {
    const c = cookMeter([item('discussion', '2026-09-19', 25)], today, TZ);
    expect(c.level).toBe('Chillin');
    expect(c.why).toBe('A discussion post in the next 2 days.');
  });
  it('names the heaviest things first: 2 essays and a quiz in the next 10 days', () => {
    const c = cookMeter([item('paper', '2026-09-22', 180), item('paper', '2026-09-27', 180), item('quiz', '2026-09-24', 60)], today, TZ);
    expect(c.why).toBe('2 essays and a quiz in the next 10 days.');
    expect(['Cooking', 'Cooked']).toContain(c.level);
  });
  it('weighs an exam more as it gets close', () => {
    const far = cookMeter([item('exam', '2026-09-26', 60)], today, TZ).score;
    const near = cookMeter([item('exam', '2026-09-19', 60)], today, TZ).score;
    expect(near).toBeGreaterThan(far);
  });
  it('ignores what is done and what is beyond two weeks', () => {
    const c = cookMeter([item('paper', '2026-09-20', 180, { status: 'done' }), item('exam', '2026-10-20', 60)], today, TZ);
    expect(c.score).toBe(0);
  });
  it('adds overdue work, and says it', () => {
    const c = cookMeter([item('homework', '2026-09-15', 60), item('lab', '2026-09-20', 120)], today, TZ);
    expect(c.why).toBe('A lab in the next 3 days, plus 1 overdue.');
  });
  it('is Cooked under a pile, red only then', () => {
    const pile = [item('exam', '2026-09-18', 120), item('paper', '2026-09-19', 240), item('project', '2026-09-20', 240), item('lab', '2026-09-21', 120), item('homework', '2026-09-16', 60)];
    const c = cookMeter(pile, today, TZ);
    expect(c.level).toBe('Cooked');
    expect(c.fill).toBe(1);
    expect(c.why).toBe('An exam, an essay, a project and 1 more in the next 4 days, plus 1 overdue.');
  });
});
