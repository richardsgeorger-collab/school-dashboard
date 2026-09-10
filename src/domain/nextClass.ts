import { addDays, dateOf, diffDays, fmtMinutes, makeIso, weekdayOf } from './dates';
import type { Nudge } from './deadlines';
import type { Schedule } from './schedule';
import type { Course, DateStr, Item, Meeting } from './types';

const WEEKDAY_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const LOOKAHEAD_DAYS = 14;

export interface NextMeeting {
  course: Course;
  meeting: Meeting;
  day: DateStr;
  startAt: string;
  endAt: string;
}

/** The next class meeting that has not started yet, across all in-person courses. */
export function nextMeeting(courses: Course[], nowIso: string, tz: string): NextMeeting | null {
  const nowMs = new Date(nowIso).getTime();
  const today = dateOf(nowIso, tz);
  let best: NextMeeting | null = null;
  for (let k = 0; k <= LOOKAHEAD_DAYS; k++) {
    const d = addDays(today, k);
    const wd = weekdayOf(d);
    for (const course of courses) {
      if (course.online || d < course.termStart || d > course.termEnd) continue;
      for (const meeting of course.meetings) {
        if (meeting.day !== wd) continue;
        const startAt = makeIso(d, meeting.start, tz);
        if (new Date(startAt).getTime() <= nowMs) continue;
        if (!best || startAt < best.startAt) best = { course, meeting, day: d, startAt, endAt: makeIso(d, meeting.end, tz) };
      }
    }
    if (best) return best;
  }
  return null;
}

function nextSameCourseDay(course: Course, afterDay: DateStr): DateStr {
  for (let k = 1; k <= 7; k++) {
    const d = addDays(afterDay, k);
    if (course.meetings.some((m) => m.day === weekdayOf(d))) return d;
  }
  return addDays(afterDay, 7);
}

export interface Prep {
  text: string;
  item: Item | null;
  nudge: Nudge | null;
  /** True when the suggestion came from something the app inferred, not the syllabus. */
  inferred: boolean;
}

const approx = (min: number) => `~${fmtMinutes(min)}`;

function dayWord(today: DateStr, d: DateStr): string {
  const k = diffDays(today, d);
  if (k === 0) return 'tonight';
  if (k === 1) return 'tomorrow';
  return WEEKDAY_LONG[weekdayOf(d)];
}

/** What, if anything, the next class needs from you before or right after it. */
export function nextClassPrep(meeting: NextMeeting, items: Item[], schedule: Schedule, nudges: Nudge[], today: DateStr, tz: string): Prep {
  const course = meeting.course;
  const isLab = /L$/i.test(course.code);
  const ownIds = new Set(items.filter((i) => i.courseId === course.id).map((i) => i.id));

  const nudge = nudges.filter((nd) => ownIds.has(nd.itemId) && nd.day <= meeting.day).sort((a, b) => a.day.localeCompare(b.day))[0];
  if (nudge) {
    const item = items.find((i) => i.id === nudge.itemId) ?? null;
    return { text: `${nudge.label} — ${approx(nudge.minutes)} before ${WEEKDAY_LONG[weekdayOf(meeting.day)]}'s ${isLab ? 'lab' : 'class'}.`, item, nudge, inferred: true };
  }

  // Anything due before this class meets again is "for this class."
  const window = addDays(nextSameCourseDay(course, meeting.day), -1);
  const candidates = items
    .filter((i) => i.courseId === course.id && i.status !== 'done' && i.type !== 'participation')
    .map((i) => ({ i, due: dateOf(i.dueAt, tz), deadline: schedule.byItem[i.id]?.deadlineDay ?? dateOf(i.dueAt, tz) }))
    .filter((c) => c.due <= window)
    .sort((a, b) => a.due.localeCompare(b.due) || a.deadline.localeCompare(b.deadline));
  const pick = candidates[0];
  if (!pick) return { text: 'Nothing to prep.', item: null, nudge: null, inferred: false };

  const { i, due } = pick;
  const est = approx(i.estimatedMinutes);
  if (i.flags.inClass && due === meeting.day) return { text: `${i.label} is in class — ${est} of prep tonight.`, item: i, nudge: null, inferred: false };
  if (due < meeting.day) {
    const when = dayWord(today, due);
    return { text: `${i.label} is due ${when} — ${est}.${when === 'tonight' ? '' : ' Due before class.'}`, item: i, nudge: null, inferred: false };
  }
  const tail = i.estimatedMinutes >= 60 ? ' Worth starting tonight.' : ' Quick one.';
  return { text: `${i.label} is due ${dayWord(today, due)} — ${est}.${tail}`, item: i, nudge: null, inferred: false };
}
