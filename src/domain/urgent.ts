import { addDays, dateOf, diffDays, weekdayOf } from './dates';
import { shortLine } from './shortLine';
import type { DateStr, Item, Requirement } from './types';

/**
 * The one urgent thing a class card warns about (George, 2026-09-30): something an announcement made required that is
 * not done and is due within about three days, or that must happen before something else (a waiver before a lab)
 * which is itself within a week. Gone once ticked or once its date passes.
 */
export interface Urgent {
  item: Item;
  req: Requirement | null;
  line: string;
  due: string;
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const SOON = 3;
const PREREQ_WINDOW = 7;
/** "Sign the lab safety waiver before lab", "Print the contract before class": a step that gates another. */
const PREREQ = /\bbefore\b|\bwaiver\b|\bsafety (?:contract|agreement|form|quiz)\b|\bpermission\b|\bprerequisite\b/i;
const DATED = /\b(?:by|before|on|due)\b.*\b(?:mon|tue|wed|thu|fri|sat|sun|today|tomorrow|tonight|\d{1,2}\/\d{1,2}|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i;

export function urgentFor(courseId: string, items: Item[], today: DateStr, tz: string): Urgent[] {
  const out: Urgent[] = [];
  const within = (due: string, days: number) => {
    const d = diffDays(today, dateOf(due, tz));
    return d >= 0 && d <= days;
  };
  const when = (due: string) => {
    const day = dateOf(due, tz);
    return day === today ? 'today' : day === addDays(today, 1) ? 'tomorrow' : WEEKDAYS[weekdayOf(day)];
  };
  for (const item of items) {
    if (item.courseId !== courseId) continue;
    for (const r of item.requirements ?? []) {
      if (r.done || r.scope === 'reference' || r.scope === 'rule' || r.source?.kind !== 'announcement') continue;
      const gate = PREREQ.test(r.text);
      if (!r.gradedOn && !gate) continue;
      const due = r.dueAt ?? item.dueAt;
      if (!(within(due, SOON) || (gate && within(item.dueAt, PREREQ_WINDOW) && within(due, PREREQ_WINDOW)))) continue;
      const line = shortLine(r.text);
      out.push({ item, req: r, due, line: `Don't forget: ${line}${DATED.test(line) ? '' : ` by ${when(due)}`}` });
    }
    // Work an announcement itself asked for, not yet done.
    if (item.origin?.kind === 'announcement' && !item.haloId && item.status !== 'done' && within(item.dueAt, SOON)) {
      const line = shortLine(item.title);
      out.push({ item, req: null, due: item.dueAt, line: `Don't forget: ${line}${DATED.test(line) ? '' : ` by ${when(item.dueAt)}`}` });
    }
  }
  return out.sort((a, b) => a.due.localeCompare(b.due));
}
