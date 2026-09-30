import { describe, expect, it } from 'vitest';
import { LEGACY_DEFAULT_MEETINGS, isLabCode, repairSetup, sectionMeetings, sectionOf, sectionOnline, setupFromHalo } from './section';

describe('the section code', () => {
  it('is the piece after the course code, date dropped', () => {
    expect(sectionOf('CHM-113L-M600A-20260908')).toBe('M600A');
    expect(sectionOf('CHM-113L-M600A')).toBe('M600A');
    expect(sectionOf('ENG-105-ONL4-20260914')).toBe('ONL4');
    expect(sectionOf('HUM-109HN-WF300A-20260908')).toBe('WF300A');
    expect(sectionOf('CHM-113')).toBeNull();
    expect(sectionOf('')).toBeNull();
  });
  it('reads the days and the start: mornings from 7, afternoons and evenings after (real slugs, 2026-09-30)', () => {
    expect(sectionMeetings('CHM-113-WF700A-20260908', false)).toEqual([{ day: 3, start: '07:00', end: '08:15' }, { day: 5, start: '07:00', end: '08:15' }]);
    expect(sectionMeetings('CHM-113L-M600A-20260908', true)).toEqual([{ day: 1, start: '18:00', end: '20:50' }]);
    expect(sectionMeetings('ESG-162-MW100A-20260908', false)).toEqual([{ day: 1, start: '13:00', end: '14:15' }, { day: 3, start: '13:00', end: '14:15' }]);
    expect(sectionMeetings('ESG-162L-T1230A-20260908', true)).toEqual([{ day: 2, start: '12:30', end: '15:20' }]);
    expect(sectionMeetings('ENG-105-TR1100B-20260908', false)).toEqual([{ day: 2, start: '11:00', end: '12:15' }, { day: 4, start: '11:00', end: '12:15' }]);
    expect(sectionMeetings('HON-110-M300CCOB-20260908', false)).toEqual([{ day: 1, start: '15:00', end: '16:15' }]);
    expect(sectionMeetings('PSY-102-TR900A', false)?.map((m) => m.start)).toEqual(['09:00', '09:00']);
  });
  it('gives nothing for an online section or a code without a time', () => {
    expect(sectionMeetings('ENG-105-ONL4-20260914', false)).toBeNull();
    expect(sectionMeetings('UNV-106-TOENGN05-20260908', false)).toBeNull();
    expect(sectionMeetings('CWV-101-TO105-20260908', false)).toBeNull();
    expect(sectionOnline('UNV-106-TOENGN05-20260908')).toBe(true);
    expect(sectionOnline('ENG-105-ONL8-20260914')).toBe(true);
    expect(sectionOnline('CHM-113-WF700A-20260908')).toBe(false);
    expect(isLabCode('CHM-113L')).toBe(true);
    expect(isLabCode('CHM-113')).toBe(false);
  });
  it('sets up a class from its own code and modality, never from anyone else\'s timetable', () => {
    expect(setupFromHalo({ classCode: 'ENG-105-ONL4', courseCode: 'ENG-105', modality: 'ONLINE' })).toEqual({ online: true, meetings: [], meetingsFrom: null });
    expect(setupFromHalo({ classCode: 'ENG-105-WF900D', courseCode: 'ENG-105', modality: 'ONGROUND' })).toEqual({ online: false, meetings: [{ day: 3, start: '09:00', end: '10:15' }, { day: 5, start: '09:00', end: '10:15' }], meetingsFrom: 'section' });
    expect(setupFromHalo({ classCode: 'UNV-106-TOENGN05', courseCode: 'UNV-106', modality: 'ONGROUND' }).online).toBe(true);
  });
});

describe('repairing a class that got the legacy timetable', () => {
  const eng = LEGACY_DEFAULT_MEETINGS.ENG105;
  it('an online ENG-105 that was given Wednesday and Friday at 11 becomes online', () => {
    expect(repairSetup({ code: 'ENG-105', online: false, meetings: eng.meetings }, { classCode: 'ENG-105-ONL4', courseCode: 'ENG-105', modality: 'ONLINE' })).toEqual({ online: true, meetings: [], meetingsFrom: null });
  });
  it('another section gets its own days and start', () => {
    expect(repairSetup({ code: 'ENG-105', online: false, meetings: eng.meetings }, { classCode: 'ENG-105-TR1100B', courseCode: 'ENG-105', modality: 'ONGROUND' })).toEqual({ online: false, meetings: [{ day: 2, start: '11:00', end: '12:15' }, { day: 4, start: '11:00', end: '12:15' }], meetingsFrom: 'section' });
  });
  it('the same section keeps its exact times (George, or a classmate in his section)', () => {
    expect(repairSetup({ code: 'ESG-162L', online: false, meetings: LEGACY_DEFAULT_MEETINGS.ESG162L.meetings }, { classCode: 'ESG-162L-T1230A', courseCode: 'ESG-162L', modality: 'ONGROUND' })).toEqual({});
  });
  it('times the student set themselves are never touched', () => {
    expect(repairSetup({ code: 'ENG-105', online: false, meetings: [{ day: 1, start: '08:00', end: '09:15' }] }, { classCode: 'ENG-105-TR1100B', courseCode: 'ENG-105', modality: 'ONGROUND' })).toEqual({});
    expect(repairSetup({ code: 'MAT-261', online: false, meetings: [] }, { classCode: 'MAT-261-MW100A', courseCode: 'MAT-261', modality: 'ONGROUND' })).toEqual({});
  });
  it('times read from the section follow the section if it changes', () => {
    expect(repairSetup({ code: 'MAT-261', online: false, meetings: [{ day: 1, start: '13:00', end: '14:15' }, { day: 3, start: '13:00', end: '14:15' }], meetingsFrom: 'section' }, { classCode: 'MAT-261-TR900A', courseCode: 'MAT-261', modality: 'ONGROUND' }).meetings?.map((m) => `${m.day}@${m.start}`)).toEqual(['2@09:00', '4@09:00']);
  });
});
