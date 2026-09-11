import { describe, expect, it } from 'vitest';
import { applyHaloPlan, defaultSelection, planFromDiff } from '../halo/apply';
import { diffHalo } from '../halo/diff';
import { mkCourse, mkData, mkItem, NOW, TZ } from '../halo/fixtures';
import { icsToExport, parseIcs } from './parse';
import { SAMPLE_ICS } from './fixtures';

const chm = mkCourse({ id: 'c1', code: 'CHM-113', name: 'General Chemistry I-Lecture' });
const esg = mkCourse({ id: 'c3', code: 'ESG-162', name: 'Engineering Math' });
const unv = mkCourse({ id: 'c6', code: 'UNV-106', name: 'University On-Campus Success' });
const courses = [chm, esg, unv];
const mapping = { 'General Chemistry I-Lecture': 'c1', 'Engineering Math': 'c3', 'University On-Campus Success': 'c6' };
const file = parseIcs(SAMPLE_ICS);
const payload = icsToExport(file, mapping, courses, TZ, NOW);
const opts = { tz: TZ, now: NOW, source: 'ics' as const, resolveCourse: (c: { name: string }) => courses.find((x) => x.id === mapping[c.name as keyof typeof mapping]) };

describe('ics → export payload', () => {
  it('maps fields: DTEND due, LOCATION class, description points and type, URL, UID or a fallback key', () => {
    expect(payload.source).toBe('ics');
    expect(payload.exportedAt).toBe('2026-09-11T15:30:00.000Z');
    expect(payload.classes.map((c) => [c.name, c.courseCode, c.assessments.length])).toEqual([
      ['General Chemistry I-Lecture', 'CHM-113', 1],
      ['Engineering Math', 'ESG-162', 1],
      ['University On-Campus Success', 'UNV-106', 1],
    ]);
    const a = payload.classes[0].assessments[0];
    expect(a).toMatchObject({ id: 'assess-111@betterhalo', title: 'Prerequisite Concept Assignment', dueDate: '2026-09-13T23:59:00-07:00', points: 10, type: 'ASSIGNMENT', inPerson: false, status: null, url: 'https://halo.gcu.edu/courses/abc/assessments/111' });
    expect(a.description).toBe('Complete the prerequisite concepts review, then submit.');
    expect(payload.classes[1].assessments[0]).toMatchObject({ dueDate: '2026-09-16T08:00:00-07:00', inPerson: true, type: 'QUIZ' });
    expect(payload.classes[2].assessments[0].id).toBe('ics|topic 1 dq 1|UNV-106|2026-09-20');
  });
  it('leaves unmapped locations out', () => {
    const partial = icsToExport(file, { 'Engineering Math': 'c3' }, courses, TZ, NOW);
    expect(partial.classes.length).toBe(1);
  });
});

describe('ics diff never touches completion or the user’s own fields', () => {
  const items = [
    mkItem({ id: 'prereq', courseId: 'c1', title: 'Prerequisite Concept Assignment', status: 'done', completedAt: NOW, score: 9, award: { base: 10, multiplier: 1.5, earnedAt: NOW, scoreFactor: 0.9 }, dueAt: '2026-09-12T23:59:00-07:00', estimatedMinutes: 20, estimateOverridden: true, notes: 'my notes', snoozedUntil: '2026-09-12' }),
    mkItem({ id: 'quiz2', courseId: 'c3', title: 'Topic 2 Quiz', type: 'quiz', points: 20, status: 'in_progress', dueAt: '2026-09-16T08:00:00-07:00' }),
    mkItem({ id: 'mine', courseId: 'c1', title: 'My own reminder', source: 'manual' }),
    mkItem({ id: 'gone', courseId: 'c3', title: 'Old thing', icsUid: 'assess-999@betterhalo' }),
    mkItem({ id: 'gone-started', courseId: 'c3', title: 'Old started thing', icsUid: 'assess-998@betterhalo', status: 'in_progress' }),
  ];
  const data = mkData(courses, items);
  const diff = diffHalo(payload, data, opts);
  it('classifies without a submitted section and without stamping Halo ids on classes', () => {
    expect(diff.submitted).toEqual([]);
    expect(diff.courses.linked).toEqual([]);
    expect(diff.courses.created).toEqual([]);
    expect(diff.added.map((e) => e.item.title)).toEqual(['Topic 1 DQ 1']);
    expect(diff.added[0].item.source).toBe('ics');
    expect(diff.added[0].item.icsUid).toBe('ics|topic 1 dq 1|UNV-106|2026-09-20');
    expect(diff.added[0].item.haloId).toBeNull();
    expect(diff.changed.map((e) => [e.key, e.changes.map((c) => c.field)])).toEqual([['prereq', ['dueAt']]]);
    expect(diff.unchanged.map((e) => e.key)).toEqual(['quiz2']);
    expect(diff.missing.map((e) => [e.key, e.suggestRemove])).toEqual([
      ['gone', true],
      ['gone-started', false],
    ]);
    expect(diff.untouched.map((i) => i.id)).toEqual(['mine']);
    expect(diff.bareDates).toBe(false);
    expect(diff.zoneWarning).toBeNull();
  });
  it('applies dates and links, keeps done, award, score, estimate, notes, snooze, and the manual item', () => {
    const r = applyHaloPlan(data, planFromDiff(diff, defaultSelection(diff)), () => undefined, NOW, TZ);
    const byId = new Map(r.data.items.map((i) => [i.id, i]));
    const p = byId.get('prereq')!;
    expect(p.dueAt).toBe('2026-09-13T23:59:00-07:00');
    expect(p.status).toBe('done');
    expect(p.completedAt).toBe(NOW);
    expect(p.score).toBe(9);
    expect(p.award).toEqual({ base: 10, multiplier: 1.5, earnedAt: NOW, scoreFactor: 0.9 });
    expect(p.estimatedMinutes).toBe(20);
    expect(p.notes).toBe('my notes');
    expect(p.snoozedUntil).toBe('2026-09-12');
    expect(p.icsUid).toBe('assess-111@betterhalo');
    expect(p.url).toBe('https://halo.gcu.edu/courses/abc/assessments/111');
    expect(p.source).toBe('ics');
    expect(byId.get('quiz2')?.status).toBe('in_progress');
    expect(byId.get('mine')).toEqual(items[2]);
    expect(byId.has('gone')).toBe(false);
    expect(byId.get('gone-started')?.status).toBe('in_progress');
    expect(r.data.courses.find((c) => c.id === 'c1')?.haloClassId).toBeUndefined();
  });
  it('a class new to the export is created only through the mapping, and an item matched by uid follows a rename', () => {
    const fresh = mkCourse({ id: 'new1', code: 'ENG-105', name: 'English Composition I' });
    const eng = parseIcs(SAMPLE_ICS.replace('LOCATION:Engineering Math', 'LOCATION:English Composition I'));
    const p2 = icsToExport(eng, { ...mapping, 'English Composition I': 'new1' }, [...courses, fresh], TZ, NOW);
    const d2 = diffHalo(p2, data, { ...opts, resolveCourse: (c) => [...courses, fresh].find((x) => x.id === { ...mapping, 'English Composition I': 'new1' }[c.name as string]) });
    expect(d2.courses.created.map((c) => c.code)).toEqual(['ENG-105']);
    const renamed = icsToExport(parseIcs(SAMPLE_ICS.replace('SUMMARY:CHM113 Prerequisite Concept Assignment', 'SUMMARY:CHM113 Prereq Concepts (revised)')), mapping, courses, TZ, NOW);
    const linked = mkData(courses, [{ ...items[0], icsUid: 'assess-111@betterhalo' }]);
    const d3 = diffHalo(renamed, linked, opts);
    expect(d3.added.map((e) => e.item.title)).not.toContain('Prereq Concepts (revised)');
    expect(d3.changed[0]?.changes.map((c) => c.field)).toContain('title');
  });
});
