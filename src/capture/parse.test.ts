import { describe, expect, it } from 'vitest';
import { mkCourse } from '../halo/fixtures';
import { guessCourse, guessKind, parseCapture, parseDate, parseTime } from './parse';

const courses = [
  mkCourse({ id: 'chm', code: 'CHM-113', name: 'General Chemistry I-Lecture', meetings: [{ day: 3, start: '07:00', end: '08:15' }, { day: 5, start: '07:00', end: '08:15' }] }),
  mkCourse({ id: 'chml', code: 'CHM-113L', name: 'General Chemistry I - Lab' }),
  mkCourse({ id: 'eng', code: 'ENG-105', name: 'English Composition I' }),
  mkCourse({ id: 'esg', code: 'ESG-162', name: 'Engineering Math' }),
  mkCourse({ id: 'esgl', code: 'ESG-162L', name: 'Engineering Math Lab' }),
  mkCourse({ id: 'unv', code: 'UNV-106', name: 'University On-Campus Success' }),
];
const FRI = '2026-09-11'; // a Friday

describe('quick capture parsing', () => {
  it('names the class from a code, a class word, or a name word, and lab when said', () => {
    expect(guessCourse('chem quiz moved to friday', courses)?.id).toBe('chm');
    expect(guessCourse('chem lab report due monday', courses)?.id).toBe('chml');
    expect(guessCourse('CHM-113L notebook', courses)?.id).toBe('chml');
    expect(guessCourse('eng math hw 3 pushed', courses)?.id).toBe('esg');
    expect(guessCourse('esg162 exam', courses)?.id).toBe('esg');
    expect(guessCourse('english essay draft', courses)?.id).toBe('eng');
    expect(guessCourse('unv reflection', courses)?.id).toBe('unv');
    expect(guessCourse('buy a calculator', courses)).toBeNull();
  });
  it('resolves relative and absolute dates from today', () => {
    expect(parseDate('moved to friday', FRI).date).toBe('2026-09-18');
    expect(parseDate('read ch 4 before wednesday', FRI).date).toBe('2026-09-16');
    expect(parseDate('next friday', FRI).date).toBe('2026-09-25');
    expect(parseDate('tomorrow', FRI).date).toBe('2026-09-12');
    expect(parseDate('tonight', FRI).date).toBe(FRI);
    expect(parseDate('next week', FRI).date).toBe('2026-09-14');
    expect(parseDate('in 3 days', FRI).date).toBe('2026-09-14');
    expect(parseDate('due sep 25', FRI).date).toBe('2026-09-25');
    expect(parseDate('exam on 10/2', FRI).date).toBe('2026-10-02');
    expect(parseDate('jan 5', FRI).date).toBe('2027-01-05');
    expect(parseDate('the 25th', FRI).date).toBe('2026-09-25');
    expect(parseDate('the 3rd', FRI).date).toBe('2026-10-03');
    expect(parseDate('whenever', FRI).date).toBeNull();
  });
  it('reads clock times', () => {
    expect(parseTime('office hours thursday 2pm').time).toBe('14:00');
    expect(parseTime('at 2:30 pm').time).toBe('14:30');
    expect(parseTime('14:15 sharp').time).toBe('14:15');
    expect(parseTime('12 am').time).toBe('00:00');
    expect(parseTime('noon').time).toBe('12:00');
    expect(parseTime('before class').beforeClass).toBe(true);
    expect(parseTime('nothing').time).toBeNull();
  });
  it('guesses the intent', () => {
    expect(guessKind('chem quiz moved to friday')).toBe('date_change');
    expect(guessKind('no homework this week')).toBe('cancel');
    expect(guessKind('office hours thursday 2pm')).toBe('info');
    expect(guessKind('read ch 4 before wednesday')).toBe('new');
  });
  it('turns the three examples into mentions', () => {
    const a = parseCapture('chem quiz moved to friday', courses, FRI);
    expect(a.courseId).toBe('chm');
    expect(a.mention).toMatchObject({ kind: 'date_change', title: 'Quiz', date: '2026-09-18', time: null, confidence: 'high' });
    const b = parseCapture('read ch 4 before wednesday', courses, FRI);
    expect(b.courseId).toBeNull();
    expect(b.mention).toMatchObject({ kind: 'new', title: 'Read ch 4', date: '2026-09-16', confidence: 'medium' });
    const c = parseCapture('chem: read ch 4 before wednesday class', courses, FRI);
    expect(c.mention.time).toBe('07:00');
    const d = parseCapture('office hours thursday 2pm', courses, FRI);
    expect(d.mention).toMatchObject({ kind: 'info', title: 'Office hours', date: '2026-09-17', time: '14:00' });
    const e = parseCapture('eng math worksheet 5 due monday 20 pts', courses, FRI);
    expect(e.courseId).toBe('esg');
    expect(e.mention).toMatchObject({ kind: 'new', title: 'Worksheet 5', date: '2026-09-14', points: 20 });
  });
});
