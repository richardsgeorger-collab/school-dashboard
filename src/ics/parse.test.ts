import { describe, expect, it } from 'vitest';
import { mkCourse } from '../halo/fixtures';
import { SAMPLE_ICS } from './fixtures';
import { descriptionFields, icsLocations, parseIcs, splitTitle, suggestCourse, unescapeText, unfoldLines } from './parse';



describe('ics parsing', () => {
  it('unfolds continuation lines and unescapes text', () => {
    expect(unfoldLines('A:one\r\n two\r\nB:three')).toEqual(['A:onetwo', 'B:three']);
    expect(unescapeText('a\\nb\\, c\; d\\\\e')).toBe('a\nb, c; d\\e');
  });
  it('reads every field the export fills in', () => {
    const f = parseIcs(SAMPLE_ICS);
    expect(f.prodId).toContain('BetterHalo');
    expect(f.events.length).toBe(3);
    expect(f.stamp).toBe('2026-09-11T15:30:00.000Z');
    const e = f.events[0];
    expect(e.uid).toBe('assess-111@betterhalo');
    expect(e.summary).toBe('CHM113 Prerequisite Concept Assignment');
    expect(e.dtend).toEqual({ value: '20260913T235959', tzid: null });
    expect(e.location).toBe('General Chemistry I-Lecture');
    expect(e.description).toBe('Points: 10\nType: Assignment\nComplete the prerequisite concepts review, then submit.');
    expect(e.url).toBe('https://halo.gcu.edu/courses/abc/assessments/111');
    expect(f.events[2].uid).toBeNull();
  });
  it('pulls points and type out of the description', () => {
    expect(descriptionFields('Points: 10\nType: Assignment\nRead ch. 1')).toEqual({ points: 10, type: 'ASSIGNMENT', rest: 'Read ch. 1' });
    expect(descriptionFields('Points: 5\nType: Discussion_question')).toEqual({ points: 5, type: 'DISCUSSION_QUESTION', rest: '' });
    expect(descriptionFields('Type: Lti')).toEqual({ points: null, type: 'LTI', rest: '' });
    expect(descriptionFields('')).toEqual({ points: null, type: null, rest: '' });
  });
  it('splits the class code off the title', () => {
    expect(splitTitle('CHM113 Prerequisite Concept Assignment')).toEqual({ title: 'Prerequisite Concept Assignment', codeHint: 'CHM-113' });
    expect(splitTitle('CHM-113L Lab Safety')).toEqual({ title: 'Lab Safety', codeHint: 'CHM-113L' });
    expect(splitTitle('Topic 1 DQ 1')).toEqual({ title: 'Topic 1 DQ 1', codeHint: null });
    expect(splitTitle('CHM113')).toEqual({ title: 'CHM113', codeHint: null });
  });
  it('suggests a class by exact name, then by the code in titles, then by a close name', () => {
    const courses = [mkCourse({ id: 'c1', code: 'CHM-113', name: 'General Chemistry I-Lecture' }), mkCourse({ id: 'c2', code: 'CHM-113L', name: 'General Chemistry I - Lab' }), mkCourse({ id: 'c3', code: 'ESG-162', name: 'Engineering Math' })];
    expect(suggestCourse('General Chemistry I-Lecture', null, courses)?.id).toBe('c1');
    expect(suggestCourse('General Chemistry I - Lab', 'CHM-113', courses)?.id).toBe('c2');
    expect(suggestCourse('Some Other Name', 'ESG-162', courses)?.id).toBe('c3');
    expect(suggestCourse('Engineering Math Lecture', null, courses)?.id).toBe('c3');
    expect(suggestCourse('English Composition I', null, courses)).toBeNull();
  });
  it('lists locations with counts and the code most of their titles carry', () => {
    const locs = icsLocations(parseIcs(SAMPLE_ICS));
    expect(locs.map((l) => [l.location, l.count, l.codeHint])).toEqual([
      ['General Chemistry I-Lecture', 1, 'CHM-113'],
      ['Engineering Math', 1, 'ESG-162'],
      ['University On-Campus Success', 1, null],
    ]);
  });
});
