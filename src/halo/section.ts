import type { Meeting } from '../domain/types';
import { normCode } from './normalize';

/**
 * GCU's section code carries the meeting days and the start time (read from real class slugs across eleven accounts
 * on 2026-09-30, and checked against George's own timetable, four of four right): "WF700A" is Wednesday and Friday
 * at 7:00, "M600A" Monday at 6:00, "TR1100B" Tuesday and Thursday at 11:00, "T1230A" Tuesday at 12:30. The trailing
 * letters are the section; online sections read "ONL4", "TO105" or "TOENGN05". Halo's gateway has no schedule field,
 * so this is the only source of meeting times a sync has. The end time is not in the code: a lecture is given GCU's
 * usual 75 minutes and a lab 170, and the class page says so, so the student fixes it once if it is off.
 */
const DAY_OF: Record<string, Meeting['day']> = { U: 0, M: 1, T: 2, W: 3, R: 4, F: 5, S: 6 };
const SECTION = /^([MTWRFSU]{1,5})(\d{3,4})[A-Z]{0,6}$/;
const LECTURE_MIN = 75;
const LAB_MIN = 170;

/** "CHM-113L-M600A-20260908", "CHM-113L-M600A" and "ENG-105-ONL4" all yield the section piece: M600A, ONL4. */
export function sectionOf(codeOrSlug: string | null | undefined): string | null {
  const parts = (codeOrSlug ?? '').trim().toUpperCase().split('-');
  if (parts.length < 3) return null;
  const tail = parts.slice(2).filter((p) => !/^\d{8}$/.test(p));
  return tail[0] || null;
}

/** A lab's course code ends in L after the number: CHM-113L, ESG-162L. */
export const isLabCode = (courseCode: string): boolean => /\d{3}L$/i.test((courseCode ?? '').trim());

/** Whether the section is an online one: ONL4, TO105, TOENGN05. Anything the day-and-time pattern does not read. */
export const sectionOnline = (codeOrSlug: string | null | undefined): boolean => /^(ONL|TO)/.test(sectionOf(codeOrSlug) ?? '');

const pad = (n: number) => String(n).padStart(2, '0');

/** The meetings a section code describes, or null when it carries no day and time (online, or a code Halo+ has not seen). */
export function sectionMeetings(codeOrSlug: string | null | undefined, lab: boolean): Meeting[] | null {
  const m = SECTION.exec(sectionOf(codeOrSlug) ?? '');
  if (!m) return null;
  const digits = m[2];
  let hour = Number(digits.slice(0, -2));
  const minute = Number(digits.slice(-2));
  if (!Number.isFinite(hour) || hour < 1 || hour > 12 || minute > 59) return null;
  // No AM or PM in the code. Classes start between 7 AM and 9 PM: 7 to 11 are morning, 12 to 6 afternoon and evening.
  if (hour <= 6) hour += 12;
  const start = hour * 60 + minute;
  const end = start + (lab ? LAB_MIN : LECTURE_MIN);
  const days = [...new Set([...m[1]].map((d) => DAY_OF[d]))];
  return days.map((day) => ({ day, start: `${pad(Math.floor(start / 60))}:${pad(start % 60)}`, end: `${pad(Math.floor(end / 60) % 24)}:${pad(end % 60)}` }));
}

/**
 * The timetable Halo+ used to give EVERY account for these six codes (it was George's own, from the first week of
 * the project, and it made a student's ENG-105 meet Wednesday and Friday at 11 whatever their section). Kept only so
 * a sync can recognise it on a class and replace it with the class's own section; never applied to anything new.
 */
export const LEGACY_DEFAULT_MEETINGS: Record<string, { online: boolean; meetings: Meeting[] }> = {
  CHM113: { online: false, meetings: [{ day: 3, start: '07:00', end: '08:15' }, { day: 5, start: '07:00', end: '08:15' }] },
  CHM113L: { online: false, meetings: [{ day: 1, start: '18:00', end: '20:50' }] },
  ENG105: { online: false, meetings: [{ day: 3, start: '11:00', end: '12:45' }, { day: 5, start: '11:00', end: '12:45' }] },
  ESG162: { online: false, meetings: [{ day: 2, start: '07:00', end: '08:15' }, { day: 4, start: '07:00', end: '08:15' }] },
  ESG162L: { online: false, meetings: [{ day: 2, start: '12:30', end: '14:20' }] },
  UNV106: { online: true, meetings: [] },
};

/** Same days and start times (end times are the part a student edits, and the part the code cannot know). */
export const sameSlots = (a: Meeting[], b: Meeting[]): boolean => {
  const key = (ms: Meeting[]) => [...ms].map((m) => `${m.day}@${m.start}`).sort().join('|');
  return key(a) === key(b);
};

export interface Setup {
  online: boolean;
  meetings: Meeting[];
  meetingsFrom: 'section' | null;
}

/** What a class's own code says about it: online, or on the ground on these days at this time. */
export function setupFromHalo(c: { classCode?: string | null; slugId?: string | null; courseCode?: string | null; modality?: string | null }): Setup {
  const code = c.classCode || c.slugId || '';
  const derived = sectionMeetings(code, isLabCode(c.courseCode ?? ''));
  const online = c.modality === 'ONLINE' || c.modality === 'TRADONLINE' || (derived === null && sectionOnline(code));
  return { online, meetings: online ? [] : (derived ?? []), meetingsFrom: derived && !online ? 'section' : null };
}

/**
 * On a sync, what to change about a class Halo+ already has. Nothing, unless its setup is the legacy timetable
 * (never chosen by this student) or was read from a section before: then the class's own section decides. A class
 * whose legacy days and starts match its section (George's own, or a classmate in his section) keeps its exact times.
 */
export function repairSetup(existing: { code: string; online: boolean; meetings: Meeting[]; meetingsFrom?: 'section' | null }, c: Parameters<typeof setupFromHalo>[0]): Partial<Setup> {
  const legacy = LEGACY_DEFAULT_MEETINGS[normCode(existing.code)];
  const fromLegacy = !!legacy && legacy.online === existing.online && sameSlots(legacy.meetings, existing.meetings);
  if (!fromLegacy && existing.meetingsFrom !== 'section') return {};
  const own = setupFromHalo(c);
  if (own.online === existing.online && sameSlots(own.meetings, existing.meetings)) return {};
  return own;
}
