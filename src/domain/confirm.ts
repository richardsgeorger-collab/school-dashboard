import { addDays, dateOf, diffDays, fmtDate } from './dates';
import type { DateStr, Item } from './types';

/** Halo states that mean the work went in. */
const IN = new Set(['SUBMITTED', 'LATE', 'PUBLISHED', 'REASSIGNED']);
/** Halo states that mean it did not. */
const NOT_IN = new Set(['UPCOMING', 'ACTIVE', 'IN_PROGRESS', 'OVERDUE']);

export const haloSaysIn = (i: Item): boolean => !!i.halo && (IN.has(i.halo.status ?? '') || !!i.halo.submittedAt);
export const haloSaysNotIn = (i: Item): boolean => !!i.halo && !i.halo.submittedAt && NOT_IN.has(i.halo.status ?? '');

export interface SubmissionCheck {
  /** Marked done here, but Halo, checked after the due date, shows it never went in. */
  mismatches: Item[];
  /** Done here, due already, and Halo has not been asked since. */
  unconfirmed: Item[];
  /** Done here and Halo agrees, among items due in the last seven days. */
  confirmed: Item[];
  /** Items due in the last seven days that are done here. */
  dueWeek: Item[];
  /** The one line for Now, or null when there is nothing due yet. */
  line: string | null;
  level: 'quiet' | 'amber' | 'alarm';
}

/**
 * Does Halo agree that what you marked done actually went in? Looks at the last seven days of due dates.
 * A mismatch is the nightmare case and always wins the line.
 */
export function submissionCheck(items: Item[], today: DateStr, tz: string): SubmissionCheck {
  const weekAgo = addDays(today, -7);
  const due = (i: Item) => dateOf(i.dueAt, tz);
  const work = items.filter((i) => i.type !== 'participation' && i.points > 0);
  const past = work.filter((i) => due(i) < today);
  const mismatches = past
    .filter((i) => i.status === 'done' && i.halo && haloSaysNotIn(i) && i.halo.checkedAt > i.dueAt)
    .sort((a, b) => a.dueAt.localeCompare(b.dueAt));
  const dueWeek = past.filter((i) => due(i) >= weekAgo && i.status === 'done');
  const confirmed = dueWeek.filter(haloSaysIn);
  const unconfirmed = dueWeek.filter((i) => !haloSaysIn(i) && !mismatches.includes(i));
  let line: string | null = null;
  let level: SubmissionCheck['level'] = 'quiet';
  if (mismatches.length) {
    const m = mismatches[0];
    const more = mismatches.length > 1 ? ` and ${mismatches.length - 1} more` : '';
    line = `Halo shows ${m.label} unsubmitted${more} — you marked it done here. Check it in Halo.`;
    level = 'alarm';
  } else if (dueWeek.length && unconfirmed.length === 0) {
    line = `Halo shows all ${dueWeek.length} item${dueWeek.length === 1 ? '' : 's'} due this week submitted.`;
  } else if (dueWeek.length) {
    const days = Math.min(...unconfirmed.map((i) => diffDays(due(i), today)));
    line = `${confirmed.length} of ${dueWeek.length} items due this week confirmed in Halo; ${unconfirmed.length} not asked since ${days === 0 ? 'today' : fmtDate(due(unconfirmed[0]), 'short')}.`;
    level = 'amber';
  }
  return { mismatches, unconfirmed, confirmed, dueWeek, line, level };
}
