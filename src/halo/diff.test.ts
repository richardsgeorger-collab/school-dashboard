import { describe, expect, it } from 'vitest';
import { diffHalo, findMatch, mergeItem } from './diff';
import { mkAssessment, mkClass, mkCourse, mkData, mkExport, mkItem, NOW, TZ } from './fixtures';
import { haloItemId, toItem } from './normalize';

const opts = { tz: TZ, now: NOW };
const chm = mkCourse({ id: 'c1', code: 'CHM-113' });

describe('findMatch', () => {
  const course = chm;
  it('prefers the Halo link, then exact title, then a close title on the same day', () => {
    const linked = mkItem({ id: 'i1', courseId: 'c1', title: 'Old name', haloId: 'h1' });
    const exact = mkItem({ id: 'i2', courseId: 'c1', title: 'Topic 1 Quiz' });
    const close = mkItem({ id: 'i3', courseId: 'c1', title: 'Topic 2 Quiz: Stoichiometry', dueAt: '2026-09-13T23:59:00-07:00' });
    const far = mkItem({ id: 'i4', courseId: 'c1', title: 'Topic 2 Quiz', dueAt: '2026-10-13T23:59:00-07:00' });
    const nextLinked = toItem(mkAssessment({ id: 'h1', title: 'Whatever' }), course, opts);
    expect(findMatch([linked, exact], nextLinked, TZ)?.id).toBe('i1');
    const nextExact = toItem(mkAssessment({ id: 'h2', title: 'topic 1 quiz' }), course, opts);
    expect(findMatch([linked, exact], nextExact, TZ)?.id).toBe('i2');
    const nextClose = toItem(mkAssessment({ id: 'h3', title: 'Topic 2 Quiz Stoichiometry Review' }), course, opts);
    expect(findMatch([close, far], nextClose, TZ)?.id).toBe('i3');
    const nextNone = toItem(mkAssessment({ id: 'h4', title: 'Lab Safety Contract' }), course, opts);
    expect(findMatch([linked, exact, close, far], nextNone, TZ)).toBeUndefined();
  });
});

describe('mergeItem', () => {
  it('keeps everything the user owns and takes Halo facts', () => {
    const existing = mkItem({
      id: 'i1',
      courseId: 'c1',
      title: 'Topic 1 Quiz',
      label: 'My Quiz',
      labelOverridden: true,
      status: 'in_progress',
      estimatedMinutes: 25,
      estimateOverridden: true,
      startByOverride: '2026-09-10',
      snoozedUntil: '2026-09-12',
      notes: 'my notes',
      score: null,
      award: null,
      type: 'exam',
    });
    const next = toItem(mkAssessment({ id: 'h1', title: 'Topic 1 Quiz (updated)', points: 25, dueDate: '2026-09-16T06:59:00Z', tags: ['TIMED'], description: 'halo notes' }), chm, opts);
    const m = mergeItem(existing, next, chm, NOW);
    expect(m.id).toBe('i1');
    expect(m.haloId).toBe('h1');
    expect(m.title).toBe('Topic 1 Quiz (updated)');
    expect(m.label).toBe('My Quiz');
    expect(m.status).toBe('in_progress');
    expect(m.estimatedMinutes).toBe(25);
    expect(m.startByOverride).toBe('2026-09-10');
    expect(m.snoozedUntil).toBe('2026-09-12');
    expect(m.notes).toBe('my notes');
    expect(m.type).toBe('exam');
    expect(m.points).toBe(25);
    expect(m.dueAt).toBe('2026-09-15T23:59:00-07:00');
    expect(m.flags.timed).toBe(true);
    expect(m.source).toBe('halo');
  });
  it('re-estimates untouched items and keeps manual source', () => {
    const existing = mkItem({ id: 'i1', courseId: 'c1', title: 'Essay', source: 'manual', estimatedMinutes: 60, points: 10 });
    const next = toItem(mkAssessment({ id: 'h1', title: 'Essay', points: 150 }), chm, opts);
    const m = mergeItem(existing, next, chm, NOW);
    expect(m.source).toBe('manual');
    expect(m.estimatedMinutes).not.toBe(60);
  });
});

describe('diffHalo', () => {
  const items = [
    mkItem({ id: 'same', courseId: 'c1', title: 'Topic 1 Quiz', points: 10, dueAt: '2026-09-13T23:59:00-07:00' }),
    mkItem({ id: 'moved', courseId: 'c1', title: 'Topic 1 Homework', points: 10, dueAt: '2026-09-13T23:59:00-07:00' }),
    mkItem({ id: 'gone', courseId: 'c1', title: 'Removed thing', haloId: 'h-gone' }),
    mkItem({ id: 'gone-done', courseId: 'c1', title: 'Removed but done', haloId: 'h-gone2', status: 'done', completedAt: NOW }),
    mkItem({ id: 'syll', courseId: 'c1', title: 'Only on the syllabus' }),
    mkItem({ id: 'turned', courseId: 'c1', title: 'Lab Safety', points: 5 }),
  ];
  const payload = mkExport([
    mkClass({
      id: 'hc1',
      courseCode: 'CHM-113',
      assessments: [
        mkAssessment({ id: 'h-same', title: 'Topic 1 Quiz', points: 10, dueDate: '2026-09-14T06:59:00Z' }),
        mkAssessment({ id: 'h-moved', title: 'Topic 1 Homework', points: 15, dueDate: '2026-09-19T06:59:00Z' }),
        mkAssessment({ id: 'h-new', title: 'Brand New Assignment', points: 30, dueDate: '2026-09-21T06:59:00Z' }),
        mkAssessment({ id: 'h-turned', title: 'Lab Safety', points: 5, status: 'PUBLISHED', submittedAt: '2026-09-10T20:00:00Z', score: 5 }),
        mkAssessment({ id: 'h-new-sub', title: 'Intro Survey', points: 2, status: 'SUBMITTED', submittedAt: '2026-09-09T20:00:00Z' }),
        mkAssessment({ id: 'h-zero', title: 'Ungraded Reading', points: 0 }),
        mkAssessment({ id: 'h-nodate', title: 'Participation', type: 'PARTICIPATION', dueDate: null }),
      ],
    }),
    mkClass({ id: 'hc2', courseCode: 'MAT-261', name: 'Calculus I', assessments: [mkAssessment({ id: 'h-mat', title: 'Section 1.1 Homework', points: 10 })] }),
    mkClass({ id: 'hc-old', courseCode: 'OLD-100', stage: 'CLOSED', assessments: [mkAssessment({ id: 'h-old', title: 'Old', points: 10 })] }),
  ]);
  const diff = diffHalo(payload, mkData([chm], items), opts);

  it('links known classes and creates unknown ones, skipping closed classes', () => {
    expect(diff.courses.linked.map((c) => c.id)).toEqual(['c1']);
    expect(diff.courses.linked[0].haloClassId).toBe('hc1');
    expect(diff.courses.created.map((c) => c.code)).toEqual(['MAT-261']);
  });
  it('sorts assessments into added, changed, unchanged, missing, submitted, skipped, untouched', () => {
    expect(diff.added.map((e) => e.item.title).sort()).toEqual(['Brand New Assignment', 'Intro Survey', 'Section 1.1 Homework']);
    expect(diff.changed.map((e) => e.key)).toEqual(['moved']);
    expect(diff.changed[0].changes.map((c) => c.field).sort()).toEqual(['dueAt', 'points']);
    expect(diff.changed[0].changes.find((c) => c.field === 'dueAt')).toEqual({ field: 'dueAt', from: '2026-09-13T23:59:00-07:00', to: '2026-09-18T23:59:00-07:00' });
    expect(diff.unchanged.map((e) => e.key).sort()).toEqual(['same', 'turned']);
    expect(diff.unchanged.find((e) => e.key === 'same')?.next.haloId).toBe('h-same');
    expect(diff.missing.map((e) => [e.key, e.suggestRemove])).toEqual([
      ['gone', true],
      ['gone-done', false],
    ]);
    expect(diff.submitted.map((e) => [e.id, e.isNew, e.score])).toEqual([
      ['turned', false, 5],
      [haloItemId('h-new-sub'), true, null],
    ]);
    expect(diff.submitted[0].at).toBe('2026-09-10T13:00:00-07:00');
    expect(diff.skipped.map((s) => [s.title, s.reason])).toEqual([
      ['Ungraded Reading', 'worth 0 points'],
      ['Participation', 'no due date'],
    ]);
    expect(diff.untouched.map((i) => i.id)).toEqual(['syll']);
  });
  it('records raw dates for the trust line', () => {
    expect(diff.rawDates[0]).toBe('2026-09-14T06:59:00Z');
    expect(diff.bareDates).toBe(false);
  });
  it('matches by link on a second sync even when the title changed', () => {
    const linked = mkItem({ id: 'same', courseId: 'c1', title: 'Topic 1 Quiz', haloId: 'h-same' });
    const p2 = mkExport([mkClass({ id: 'hc1', courseCode: 'CHM-113', assessments: [mkAssessment({ id: 'h-same', title: 'Topic 1 Quiz (Revised)' })] })]);
    const d2 = diffHalo(p2, mkData([{ ...chm, haloClassId: 'hc1' }], [linked]), opts);
    expect(d2.added).toEqual([]);
    expect(d2.changed[0]?.key).toBe('same');
    expect(d2.changed[0]?.changes.map((c) => c.field)).toEqual(['title']);
  });
  it('flags bare dates and lets the caller re-read them as local', () => {
    const p = mkExport([mkClass({ id: 'hc1', courseCode: 'CHM-113', assessments: [mkAssessment({ id: 'h1', title: 'X', dueDate: '2026-09-14 06:59:00' })] })]);
    const d = diffHalo(p, mkData([chm], []), opts);
    expect(d.bareDates).toBe(true);
    expect(d.added[0].item.dueAt).toBe('2026-09-13T23:59:00-07:00');
    const local = diffHalo(p, mkData([chm], []), { ...opts, bareAs: 'local' });
    expect(local.added[0].item.dueAt).toBe('2026-09-14T06:59:00-07:00');
  });
});

describe('zone warning', () => {
  const chm2 = mkCourse({ id: 'c1', code: 'CHM-113' });
  const bareLocal = mkExport([
    mkClass({
      id: 'hc1',
      courseCode: 'CHM-113',
      assessments: [
        mkAssessment({ id: 'h1', title: 'Quiz 1', dueDate: '2026-09-14 23:59:00' }),
        mkAssessment({ id: 'h2', title: 'Quiz 2', dueDate: '2026-09-21 23:59:00' }),
        mkAssessment({ id: 'h3', title: 'In-class activity', dueDate: '2026-09-16 08:15:00' }),
      ],
    }),
  ]);
  it('flags :59 landings away from 11 PM and clears when the reading is flipped', () => {
    const wrong = diffHalo(bareLocal, mkData([chm2], []), { tz: TZ, now: NOW, bareAs: 'utc' });
    expect(wrong.zoneSuspects.map((s) => s.time)).toEqual(['4:59 PM', '4:59 PM']);
    expect(wrong.zoneWarning).toMatch(/2 due times land at 4:59 PM/);
    expect(wrong.zoneWarning).toMatch(/Flip the reading/);
    expect(wrong.added.find((e) => e.item.title === 'Quiz 1')?.oddTime).toBe('4:59 PM');
    const right = diffHalo(bareLocal, mkData([chm2], []), { tz: TZ, now: NOW, bareAs: 'local' });
    expect(right.zoneSuspects).toEqual([]);
    expect(right.zoneWarning).toBeNull();
  });
  it('stays quiet for zoned strings that land at 11:59 PM', () => {
    const d = diffHalo(payloadZoned(), mkData([chm2], []), { tz: TZ, now: NOW });
    expect(d.zoneWarning).toBeNull();
  });
  function payloadZoned() {
    return mkExport([mkClass({ id: 'hc1', courseCode: 'CHM-113', assessments: [mkAssessment({ id: 'h1', title: 'Quiz 1', dueDate: '2026-09-15T06:59:00Z' })] })]);
  }
});
