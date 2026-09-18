import { describe, expect, it } from 'vitest';
import { diffHalo } from './diff';
import { mkAssessment, mkClass, mkCourse, mkData, mkExport, mkItem, TZ } from './fixtures';
import { referenceLine, referencePlan, referenceTotal, type ReferenceCounts } from './reference';

const NOW = '2026-09-18T12:00:00.000Z';
const opts = { tz: TZ, now: NOW, bareAs: '23:59', includeZeroPoint: false, source: 'halo' as const, resolveCourse: undefined };

const rubric = { id: 'R', name: 'Lab Rubric', criteria: [] };
const feedback = { comment: 'Watch your sig figs.', gradedAt: null, criteria: [], files: [], post: null };

describe('the half of a sync with nothing to approve', () => {
  const course = mkCourse({ id: 'c1', code: 'CHM-113', haloClassId: 'h1' });
  const known = mkItem({ id: 'i1', courseId: 'c1', title: 'Flame Test Lab', haloId: 'a1' });
  const data = mkData([course], [known]);
  const payload = mkExport([
    mkClass({
      id: 'h1',
      courseCode: 'CHM-113',
      gradeScale: [{ label: 'A', minPercent: 90, maxPercent: 100 }],
      assessments: [
        mkAssessment({ id: 'a1', title: 'Flame Test Lab', rubric, feedback }),
        // A brand new assignment: its rubric is not reference data yet, because the item itself needs approving.
        mkAssessment({ id: 'a2', title: 'Titration Lab', rubric, feedback }),
      ],
    }),
  ]);

  it('carries facts for items already in the planner, and nothing for items that are not', () => {
    const diff = diffHalo(payload, data, opts);
    const plan = referencePlan(diff, data);
    expect(plan.facts.map((f) => f.id)).toEqual(['i1']);
    expect(plan.facts[0].rubric?.name).toBe('Lab Rubric');
    expect(plan.facts[0].feedback?.comment).toContain('sig figs');
    // Nothing that needs approving rides along.
    expect(plan.upserts).toEqual([]);
    expect(plan.deletes).toEqual([]);
    expect(plan.complete).toEqual([]);
    expect(plan.scores).toEqual([]);
  });

  it('refreshes classes that exist and never creates one', () => {
    const diff = diffHalo(payload, data, opts);
    const plan = referencePlan(diff, data);
    expect(plan.courses.map((c) => c.code)).toEqual(['CHM-113']);
    expect(plan.courses[0].gradeScale).toHaveLength(1);

    const fresh = diffHalo(mkExport([mkClass({ id: 'h9', courseCode: 'PHY-111', assessments: [] })]), data, opts);
    expect(fresh.courses.created).toHaveLength(1);
    expect(referencePlan(fresh, data).courses).toEqual([]);
  });

  it('says what it kept, so a screen with no changes still accounts for the sync', () => {
    const c: ReferenceCounts = { facts: 24, classes: 6, announcements: 47, fresh: 12, messages: 1, resources: 9, alerts: 3 };
    expect(referenceLine(c)).toBe('Saved already, nothing to approve: 47 announcements (12 new), rubrics, feedback and quiz results on 24 assignments, class facts for 6 classes, 9 class resources, 1 message and 3 alerts.');
    expect(referenceTotal(c)).toBe(90);
    expect(referenceLine({ facts: 0, classes: 0, announcements: 1, fresh: 0, messages: 0, resources: 0, alerts: 0 })).toBe('Saved already, nothing to approve: 1 announcement.');
    expect(referenceLine({ facts: 0, classes: 0, announcements: 0, fresh: 0, messages: 0, resources: 0, alerts: 0 })).toBeNull();
    expect(referenceTotal({ facts: 0, classes: 0, announcements: 0, fresh: 0, messages: 0, resources: 0, alerts: 0 })).toBe(0);
  });

  it('a sync whose assignments are unchanged still has reference data to keep', () => {
    // This is the case that lost 47 announcements: the diff offers nothing, so the button read "Nothing to apply".
    const same = mkExport([mkClass({ id: 'h1', courseCode: 'CHM-113', assessments: [mkAssessment({ id: 'a1', title: 'Flame Test Lab', rubric, feedback })] })]);
    const diff = diffHalo(same, data, opts);
    expect(diff.added).toEqual([]);
    expect(diff.changed).toEqual([]);
    expect(referencePlan(diff, data).facts).toHaveLength(1);
  });
});
