import { describe, expect, it } from 'vitest';
import { derive, deriveDeadlines } from './deadlines';
import { DEFAULT_FLAGS, DEFAULT_SETTINGS, type Course, type Item } from './types';

const settings = DEFAULT_SETTINGS;
let n = 0;
function item(over: Partial<Item>): Item {
  n += 1;
  return {
    id: over.id ?? `i${n}`,
    courseId: 'lec',
    title: `Item ${n}`,
    label: `Item ${n}`,
    labelOverridden: false,
    type: 'homework',
    points: 10,
    opensAt: null,
    dueAt: '2026-09-16T23:59:00-07:00', // Wednesday
    estimatedMinutes: 60,
    estimateOverridden: false,
    startByOverride: null,
    status: 'todo',
    completedAt: null,
    score: null,
    notes: '',
    topic: null,
    flags: { ...DEFAULT_FLAGS },
    source: 'parsed',
    award: null,
    updatedAt: '',
    ...over,
  };
}
const course = (id: string, code: string, meetings: Course['meetings'] = []): Course => ({
  id,
  code,
  name: code,
  color: '#000',
  credits: 3,
  instructors: [],
  meetings,
  online: false,
  termStart: '2026-09-08',
  termEnd: '2026-12-20',
  updatedAt: '',
});
const lec = course('lec', 'CHM-113');
const lab = course('lab', 'CHM-113L', [{ day: 1, start: '18:00', end: '20:50' }]);
const eng = course('eng', 'ENG-105');
const courses = [lec, lab, eng];
const run = (items: Item[]) => deriveDeadlines(items, courses, settings);
const day = (iso: string) => iso.slice(0, 10);

describe('deriveDeadlines', () => {
  it('leaves ordinary items alone', () => {
    const a = item({ points: 10, estimatedMinutes: 60 });
    expect(run([a])[a.id]).toBeUndefined();
  });

  it('pulls big items two days early', () => {
    const exam = item({ id: 'exam', type: 'exam', points: 150, estimatedMinutes: 630, dueAt: '2026-10-30T23:59:00-07:00' });
    const long = item({ id: 'long', points: 40, estimatedMinutes: 180, dueAt: '2026-10-14T23:59:00-07:00' });
    const r = run([exam, long]);
    expect(day(r.exam.deadlineAt)).toBe('2026-10-28');
    expect(r.exam.reasons).toEqual(['big item, 2 days early']);
    expect(day(r.long.deadlineAt)).toBe('2026-10-12');
  });

  it('gives participation and discussion a first-touch deadline two days early', () => {
    const p = item({ id: 'p', type: 'participation', dueAt: '2026-09-16T23:59:00-07:00' });
    const dq = item({ id: 'dq', type: 'discussion', dueAt: '2026-09-18T23:59:00-07:00' });
    const r = run([p, dq]);
    expect(day(r.p.deadlineAt)).toBe('2026-09-14');
    expect(r.p.reasons).toEqual(['first touch: post, then reply']);
    expect(day(r.dq.deadlineAt)).toBe('2026-09-16');
  });

  it('keeps lab notebooks on their due date but adds a pre-lab nudge before the lab meeting', () => {
    const labItem = item({ id: 'labItem', courseId: 'lab', type: 'lab', dueAt: '2026-09-25T23:59:00-07:00' }); // Friday; lab meets Mon 21
    const d = derive([labItem], courses, settings);
    expect(d.deadlines.labItem).toBeUndefined();
    expect(d.nudges).toEqual([{ key: 'prelab:labItem', itemId: 'labItem', day: '2026-09-19', label: `Pre-lab prep for ${labItem.label}`, minutes: 45 }]);
  });

  it('moves Sunday deadlines to Saturday', () => {
    const sun = item({ id: 'sun', dueAt: '2026-09-13T23:59:00-07:00' });
    const r = run([sun]);
    expect(r.sun.deadlineAt).toBe('2026-09-12T23:59:00-07:00');
    expect(r.sun.reasons).toEqual(['Sunday due → Saturday']);
  });

  it('never loosens a deadline and stacks reasons', () => {
    const p = item({ id: 'p', type: 'participation', dueAt: '2026-09-15T23:59:00-07:00' }); // Tue → Sun 13 → Sat 12
    const r = run([p]);
    expect(day(r.p.deadlineAt)).toBe('2026-09-12');
    expect(r.p.reasons).toEqual(['first touch: post, then reply', 'Sunday due → Saturday']);
  });

  it('pushes a prerequisite ahead of the dependent draft and final', () => {
    const first = item({ id: 'first', courseId: 'eng', type: 'paper', title: 'First Draft of a Review Assignment (On-Ground)', dueAt: '2026-11-13T12:45:00-07:00', estimatedMinutes: 150 });
    const final = item({ id: 'final', courseId: 'eng', type: 'paper', title: 'Final Draft of a Review Assignment (On-Ground)', dueAt: '2026-11-15T23:59:00-07:00', estimatedMinutes: 300, points: 220 });
    const r = run([first, final]);
    // final: big → Nov 13; first draft must be done before the final's start-by (Nov 13 − 2 days buffer − 5h ≈ Nov 10)
    expect(day(r.final.deadlineAt)).toBe('2026-11-13');
    expect(r.first.reasons).toContain(`needed before ${final.label}`);
    expect(day(r.first.deadlineAt) < '2026-11-13').toBe(true);
  });

  it('holds the essay draft to before the presentation that summarizes it', () => {
    const talk = item({ id: 'talk', courseId: 'lab', type: 'paper', title: 'Chemistry Connections Presentation', dueAt: '2026-09-27T23:59:00-07:00', estimatedMinutes: 180, points: 75 });
    const essay = item({ id: 'essay', courseId: 'lab', type: 'paper', title: 'Chemistry Connections Essay', dueAt: '2026-10-09T23:59:00-07:00', estimatedMinutes: 360, points: 75 });
    const r = run([talk, essay]);
    expect(day(r.essay.deadlineAt) < '2026-09-26').toBe(true);
    expect(r.essay.reasons).toContain(`needed before ${talk.label}`);
  });

  it('spreads a cluster of four or more by pulling the smallest earlier', () => {
    const items = [
      item({ id: 'a', estimatedMinutes: 30, dueAt: '2026-09-16T23:59:00-07:00' }),
      item({ id: 'b', estimatedMinutes: 45, dueAt: '2026-09-16T23:59:00-07:00' }),
      item({ id: 'c', estimatedMinutes: 60, dueAt: '2026-09-16T23:59:00-07:00' }),
      item({ id: 'd', estimatedMinutes: 90, dueAt: '2026-09-16T23:59:00-07:00' }),
      item({ id: 'e', estimatedMinutes: 120, dueAt: '2026-09-16T23:59:00-07:00' }),
    ];
    const r = run(items);
    expect(day(r.a.deadlineAt)).toBe('2026-09-15');
    expect(r.a.reasons).toEqual(['5 items that day, pulled a day earlier']);
    expect(day(r.b.deadlineAt)).toBe('2026-09-15');
    expect(r.c).toBeUndefined();
    expect(r.d).toBeUndefined();
    expect(r.e).toBeUndefined();
  });

  it('moves an item at most one day for clustering', () => {
    const items = Array.from({ length: 8 }, (_, k) => item({ id: `k${k}`, estimatedMinutes: 30 + k, dueAt: '2026-09-16T23:59:00-07:00' }));
    const r = run(items);
    const days = items.map((i) => (r[i.id] ? day(r[i.id].deadlineAt) : '2026-09-16'));
    expect(days.every((d) => d === '2026-09-15' || d === '2026-09-16')).toBe(true);
    expect(days.filter((d) => d === '2026-09-16').length).toBe(3);
  });

  it('never moves a deadline before the item opens', () => {
    const quiz = item({ id: 'quiz', type: 'quiz', points: 60, opensAt: '2026-09-14T00:00:00-07:00', dueAt: '2026-09-15T23:59:00-07:00', estimatedMinutes: 200 });
    const r = run([quiz]);
    expect(day(r.quiz.deadlineAt)).toBe('2026-09-14');
  });

  it('ignores done items when counting clusters', () => {
    const items = [
      ...['a', 'b', 'c'].map((id) => item({ id, estimatedMinutes: 30, dueAt: '2026-09-16T23:59:00-07:00' })),
      item({ id: 'done', status: 'done', dueAt: '2026-09-16T23:59:00-07:00' }),
    ];
    expect(Object.keys(run(items))).toEqual([]);
  });
});
