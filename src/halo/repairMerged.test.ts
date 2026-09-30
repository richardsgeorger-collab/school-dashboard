import { describe, expect, it } from 'vitest';
import { mkCourse, mkItem, NOW } from './fixtures';
import { emptyKnowledge, isMerged, learn, mergedClasses, planRepair } from './repairMerged';

const lab = mkCourse({ id: 'lab', code: 'CHM-113L', name: 'General Chemistry I-Lab', haloClassId: 'hc-lab', haloSlugId: 'CHM-113L-M600A-20260908' });
const labItems = [mkItem({ id: 'x1', courseId: 'lab', title: 'Stoichiometry Lab', haloId: 'a-stoich', haloUnitId: 'u-lab-1', source: 'halo' }), mkItem({ id: 'x2', courseId: 'lab', title: 'Formal Lab Report', haloId: 'a-formal', haloUnitId: 'u-lab-2', source: 'halo' })];
const merged = mkCourse({ id: 'c1', code: 'CHM-113', name: 'General Chemistry I-Lecture', haloClassId: 'hc-lab', haloSlugId: 'CHM-113L-M600A-20260908', haloGrade: { letter: 'B-', points: 176, maxPoints: 215, percent: 82, at: NOW } });
const mine = [
  mkItem({ id: 'm1', courseId: 'c1', title: 'Stoichiometry Lab', haloId: 'a-stoich', haloUnitId: 'u-lab-1', source: 'halo', status: 'done', score: 28 }),
  mkItem({ id: 'm2', courseId: 'c1', title: 'Chemical Safety', haloId: 'a-safety', haloUnitId: 'u-lab-2', source: 'halo' }),
  mkItem({ id: 'm3', courseId: 'c1', title: 'Topic 5 Homework', haloId: 'a-hw5', haloUnitId: 'u-lec-5', source: 'halo', notes: 'mine' }),
];

describe('repairing a lab merged into its lecture, without a sync', () => {
  it('spots a class linked to another course\'s section', () => {
    expect(isMerged(merged)).toBe(true);
    expect(isMerged(lab)).toBe(false);
    expect(isMerged(mkCourse({ id: 'e', code: 'ENG-105-ONL4', haloSlugId: 'ENG-105-ONL4-20260914' }))).toBe(false);
    expect(isMerged(mkCourse({ id: 'h', code: 'HUM-109HN', haloSlugId: 'HUM-109HN-WF300A-20260908' }))).toBe(false);
    expect(mergedClasses([merged, lab]).map((c) => c.id)).toEqual(['c1']);
  });
  it('learns the lab\'s units from another account and moves exactly those items, with their done marks', () => {
    const k = emptyKnowledge();
    learn(k, [lab], labItems, [{ courseId: 'lab', forumId: 'f-lab' }]);
    const posts = [{ id: 'p1', courseId: 'c1', forumId: 'f-lab' }, { id: 'p2', courseId: 'c1', forumId: 'f-lec' }];
    const plan = planRepair(merged, mine, posts, k, [merged], NOW)!;
    expect(plan.moveItems).toEqual(['m1', 'm2']);
    expect(plan.movePosts).toEqual(['p1']);
    expect(plan.restored).toMatchObject({ code: 'CHM-113L', name: 'General Chemistry I-Lab', haloClassId: 'hc-lab', meetings: [{ day: 1, start: '18:00', end: '20:50' }] });
    expect(plan.restored.haloGrade?.letter).toBe('B-');
    expect(plan.kept).toMatchObject({ id: 'c1', code: 'CHM-113', haloClassId: null, haloSlugId: null });
    expect(plan.kept.haloGrade).toBeUndefined();
    expect(isMerged(plan.kept)).toBe(false);
  });
  it('does nothing without evidence (the app asks for one sync instead)', () => {
    expect(planRepair(merged, mine, [], emptyKnowledge(), [merged], NOW)).toBeNull();
  });
});
