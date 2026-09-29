import { addDays, dateOf, diffDays, fmtDate, weekdayOf } from './dates';
import type { Schedule } from './schedule';
import type { Block, BlockReason, Course, DateStr, Item } from './types';

/**
 * Blocked is not snoozed. A snooze says "not today"; a block says "I cannot, because of someone or something else."
 * A blocked item leaves Now, does not count as late, and comes back on its own when the blocker plausibly clears,
 * or when the student says so. When its deadline closes in while it is still blocked, that is its own thing.
 */
export const BLOCK_WORDS: Record<BlockReason, { label: string; waiting: string; chase: string }> = {
  class: { label: "Lab or class hasn't happened", waiting: 'waiting on class', chase: 'start with what you have from class' },
  partner: { label: 'Waiting on a partner', waiting: 'waiting on your partner', chase: 'time to chase your partner' },
  feedback: { label: 'Waiting on feedback', waiting: 'waiting on feedback', chase: 'ask for the feedback today' },
  materials: { label: 'Need materials', waiting: 'waiting on materials', chase: 'find another way to get what you need' },
  instructor: { label: 'Waiting on the professor', waiting: 'waiting on the professor', chase: 'ask the instructor today' },
  other: { label: 'Other', waiting: 'waiting on something', chase: 'see what is still holding it' },
};

/** The answers to "Waiting on what?", in the order they are offered (feedback stays for blocks saved before). */
export const BLOCK_REASONS: BlockReason[] = ['class', 'partner', 'materials', 'instructor', 'other'];

/** Words for a reason, with a stored block from an older shape falling back to "something else" rather than crashing. */
export const wordsFor = (reason: BlockReason | string | undefined): (typeof BLOCK_WORDS)[BlockReason] => BLOCK_WORDS[(reason ?? 'other') as BlockReason] ?? BLOCK_WORDS.other;

/** The next day the class meets after `today`, or null for an online class. */
export function nextMeetingDay(course: Course | undefined, today: DateStr): DateStr | null {
  if (!course || course.online || course.meetings.length === 0) return null;
  for (let k = 1; k <= 7; k++) {
    const d = addDays(today, k);
    if (course.meetings.some((m) => m.day === weekdayOf(d))) return d;
  }
  return null;
}

/**
 * When a blocker plausibly clears: the next class meeting when it is waiting on class or a lab, or on the professor;
 * three days for feedback or anything else, two for a partner or materials. Never later than two days before it is
 * due (George, 2026-09-29), and never before tomorrow.
 */
export function blockUntil(reason: BlockReason, item: Item, course: Course | undefined, today: DateStr, tz: string): DateStr {
  const days = reason === 'feedback' ? 3 : reason === 'other' ? 3 : 2;
  let until = addDays(today, days);
  if (reason === 'instructor' || reason === 'class') until = nextMeetingDay(course, today) ?? until;
  const latest = addDays(dateOf(item.dueAt, tz), -2);
  if (until > latest) until = latest;
  const tomorrow = addDays(today, 1);
  return until < tomorrow ? tomorrow : until;
}

export function makeBlock(reason: BlockReason, item: Item, course: Course | undefined, today: DateStr, tz: string, note = '', at = new Date().toISOString()): Block {
  return { reason, note: note.trim().slice(0, 140), since: at, until: blockUntil(reason, item, course, today, tz) };
}

/** Still waiting, as of today. */
export const isBlocked = (item: Item, today: DateStr): boolean => !!item.blocked && item.blocked.until > today;
/** The wait ran out: back on Now, and the hero says what it was waiting on. */
export const blockRanOut = (item: Item, today: DateStr): boolean => !!item.blocked && item.blocked.until <= today;

/** "waiting on your partner since Mon" for a row or a hero line. */
export function blockPhrase(item: Item, tz: string): string {
  if (!item.blocked) return '';
  const w = wordsFor(item.blocked.reason).waiting;
  const note = item.blocked.note ? ` (${item.blocked.note})` : '';
  return `${w}${note} since ${fmtDate(dateOf(item.blocked.since, tz), 'short')}`;
}

export interface ChaseLine {
  item: Item;
  text: string;
  /** What to do about it, one clause. */
  action: string;
}

const CLOSE_DAYS = 2;

/**
 * A blocked item whose real due date is inside two days: the wait is no longer someone else's problem. One line, the
 * soonest such item, or null. The real date, not a derived one: chasing a partner over a deadline nobody set is noise.
 */
export function blockedLine(items: Item[], courses: Course[], _schedule: Schedule, today: DateStr, tz: string): ChaseLine | null {
  const close = items
    .filter((i) => i.status !== 'done' && isBlocked(i, today))
    .map((i) => ({ i, day: dateOf(i.dueAt, tz) }))
    .filter((x) => diffDays(today, x.day) <= CLOSE_DAYS)
    .sort((a, b) => a.day.localeCompare(b.day));
  if (close.length === 0) return null;
  const { i, day } = close[0];
  const k = diffDays(today, day);
  const when = k <= 0 ? 'today' : k === 1 ? 'tomorrow' : `in ${k} days`;
  const code = courses.find((c) => c.id === i.courseId)?.code ?? '';
  const words = wordsFor(i.blocked!.reason);
  const action = `${words.chase.charAt(0).toUpperCase()}${words.chase.slice(1)}.`;
  return { item: i, text: `${code ? `${code} ` : ''}${i.label} is blocked (${words.waiting}) and due ${when} — ${words.chase}.`, action };
}

/** The small note an item carries on the agenda while it is skipped: "Can't start yet: waiting on lab". */
export function skipNote(item: Item, course: Course | undefined, today: DateStr): string | null {
  if (item.status === 'done') return null;
  if (isBlocked(item, today)) {
    const w = wordsFor(item.blocked!.reason).waiting;
    const lab = item.blocked!.reason === 'class' && (item.type === 'lab' || /L$/.test(course?.code ?? '') || /\blab\b/i.test(item.title));
    return `Can't start yet: ${lab ? 'waiting on lab' : w}`;
  }
  if (item.snoozedUntil && item.snoozedUntil > today) return `Not today: back ${item.snoozedUntil === addDays(today, 1) ? 'tomorrow' : fmtDate(item.snoozedUntil, 'short')}`;
  return null;
}
