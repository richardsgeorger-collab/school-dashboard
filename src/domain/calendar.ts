import { addDays, weekStart, weekdayOf } from './dates';
import type { Course, DateStr, Meeting } from './types';

const pad = (n: number) => String(n).padStart(2, '0');

/** "2026-09-09" -> "2026-09" */
export function monthKey(d: DateStr): string {
  return d.slice(0, 7);
}

export function shiftMonth(key: string, n: number): string {
  const [y, m] = key.split('-').map(Number);
  const total = y * 12 + (m - 1) + n;
  return `${Math.floor(total / 12)}-${pad((total % 12) + 1)}`;
}

/** Calendar cells for a month: whole weeks from the week containing the 1st through the week containing the last day. */
export function monthGrid(key: string, weekStartsOn: 0 | 1): DateStr[] {
  const first = `${key}-01`;
  const next = `${shiftMonth(key, 1)}-01`;
  const last = addDays(next, -1);
  const start = weekStart(first, weekStartsOn);
  const end = addDays(weekStart(last, weekStartsOn), 6);
  const out: DateStr[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) out.push(d);
  return out;
}

export interface MeetingOn {
  course: Course;
  meeting: Meeting;
}

export function meetingsOn(courses: Course[], date: DateStr): MeetingOn[] {
  const wd = weekdayOf(date);
  const out: MeetingOn[] = [];
  for (const course of courses) {
    if (date < course.termStart || date > course.termEnd) continue;
    for (const meeting of course.meetings) {
      if (meeting.day === wd) out.push({ course, meeting });
    }
  }
  return out.sort((a, b) => a.meeting.start.localeCompare(b.meeting.start));
}
