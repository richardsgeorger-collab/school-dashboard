import { submissionCheck } from './confirm';
import { addDays, dateOf, diffDays, fmtDate } from './dates';
import { gradeFloor } from './floor';
import { unlocks } from './gating';
import { pileupAhead } from './pileup';
import type { Schedule } from './schedule';
import type { AppData, DateStr, Item } from './types';
import { blockedLine } from './blocked';
import { isBlocked } from './now';
import { weakSpots } from './weak';

export interface Okay {
  verdict: 'fine' | 'handle';
  /** One paragraph, plain words, ending in "You're fine." or the one thing to handle first. */
  text: string;
  /** The item to open when there is one. */
  first: Item | null;
}

const list = (xs: string[]) => (xs.length <= 1 ? xs.join('') : xs.length === 2 ? `${xs[0]} and ${xs[1]}` : `${xs.slice(0, -1).join(', ')}, and ${xs.at(-1)}`);

/**
 * Everything at once, as a person would say it: what is late, what Halo disagrees with, what is piling up,
 * where a grade is at risk, whether the sync is stale, what gates something. Then either "You're fine." or the
 * one thing to handle first.
 */
export function amIOkay(data: AppData, schedule: Schedule, today: DateStr, now: string, tz: string): Okay {
  const items = data.items.filter((i) => i.type !== 'participation');
  const waiting = items.filter((i) => i.status !== 'done' && isBlocked(i, today));
  const open = items.filter((i) => i.status !== 'done' && !isBlocked(i, today));
  const nowMs = new Date(now).getTime();
  const overdue = open.filter((i) => new Date(i.dueAt).getTime() < nowMs).sort((a, b) => a.dueAt.localeCompare(b.dueAt));
  const sub = submissionCheck(items, today, tz);
  const pile = pileupAhead(items, schedule, today);
  const gates = open
    .filter((i) => unlocks(i, items).length > 0 && diffDays(today, dateOf(i.dueAt, tz)) <= 7)
    .sort((a, b) => a.dueAt.localeCompare(b.dueAt));
  const risky = data.courses
    .map((c) => ({ c, floor: gradeFloor(c.id, items), weak: weakSpots(c.id, items) }))
    .filter((x) => x.floor.letter !== null && x.floor.line !== null && /out of reach|cannot lift|needs \d+% on what's left/.test(x.floor.line) && x.weak.length > 0);
  const lastCheck = [...(data.settings.haloChecks ?? [])].sort((a, b) => a.at.localeCompare(b.at)).at(-1);
  const lastSync = data.settings.syncedAt ?? null;
  const freshest = [lastCheck?.at, lastSync].filter((x): x is string => !!x).sort().at(-1) ?? null;
  const staleDays = freshest ? diffDays(dateOf(freshest, tz), today) : null;
  const dueToday = open.filter((i) => dateOf(i.dueAt, tz) === today && new Date(i.dueAt).getTime() >= nowMs);
  const week = open.filter((i) => dateOf(i.dueAt, tz) > today && dateOf(i.dueAt, tz) <= addDays(today, 6));

  const parts: string[] = [];
  let first: Item | null = null;
  let handle: string | null = null;

  if (sub.mismatches.length) {
    const m = sub.mismatches[0];
    parts.push(`Halo shows ${m.label} unsubmitted even though you marked it done here${sub.mismatches.length > 1 ? `, and ${sub.mismatches.length - 1} more like it` : ''}.`);
    handle = handle ?? `Check ${m.label} in Halo first; if it really went in, the next sync clears this.`;
    first = first ?? m;
  }
  if (overdue.length) {
    const named = overdue.slice(0, 2).map((i) => i.label);
    parts.push(`${overdue.length === 1 ? `${named[0]} is` : `${overdue.length} things are`} past ${overdue.length === 1 ? 'its' : 'their'} date${overdue.length > 1 ? `: ${overdue.length > 2 ? `${named.join(', ')}, and ${overdue.length - 2} more` : list(named)}` : ''}.`);
    handle = handle ?? `Handle ${overdue[0].label} first; it's the oldest.`;
    first = first ?? overdue[0];
  }
  if (gates.length) {
    const g = gates[0];
    const gated = unlocks(g, items);
    parts.push(`${g.label} is due ${fmtDate(dateOf(g.dueAt, tz), 'short')} and unlocks ${list(gated.slice(0, 2).map((x) => x.label))}.`);
    handle = handle ?? `Do ${g.label} first; it's small and it holds up bigger work.`;
    first = first ?? g;
  }
  const chase = blockedLine(items, data.courses, schedule, today, tz);
  if (chase) {
    parts.push(chase.text);
    handle = handle ?? chase.action;
    first = first ?? chase.item;
  } else if (waiting.length) parts.push(`${waiting.length === 1 ? `${waiting[0].label} is` : `${waiting.length} things are`} waiting on someone else, and that is not on you.`);
  if (dueToday.length) parts.push(`${dueToday.length === 1 ? `${dueToday[0].label} is` : `${dueToday.length} things are`} due today.`);
  else if (week.length) parts.push(`Nothing else is due today; ${week.length} thing${week.length === 1 ? '' : 's'} land${week.length === 1 ? 's' : ''} this week.`);
  else if (!overdue.length) parts.push('Nothing is due today or this week.');
  if (pile) parts.push(`Ahead: ${pile.line}`);
  if (risky.length) {
    const r = risky[0];
    parts.push(`${r.c.code} is the grade to watch: ${r.floor.line!.charAt(0).toLowerCase()}${r.floor.line!.slice(1)}`);
  }
  if (sub.line && sub.level !== 'alarm') parts.push(sub.line);
  if (staleDays === null) parts.push('Halo has not been checked yet, so this is only what the planner knows.');
  else if (staleDays >= 7) parts.push(`Halo was last checked ${staleDays} days ago, so anything newer than that is not here yet.`);
  else parts.push(`Halo was checked ${staleDays === 0 ? 'today' : staleDays === 1 ? 'yesterday' : `${staleDays} days ago`}.`);

  if (handle) return { verdict: 'handle', text: `${parts.join(' ')} ${handle}`, first };
  if (dueToday.length) {
    const d = dueToday[0];
    return { verdict: 'handle', text: `${parts.join(' ')} Do ${d.label} first, then you're clear.`, first: d };
  }
  if (pile && diffDays(today, pile.startBy) <= 0) return { verdict: 'handle', text: `${parts.join(' ')} Start ${pile.lead.label} today and the pileup stays manageable.`, first: pile.lead };
  return { verdict: 'fine', text: `${parts.join(' ')} You're fine.`, first: null };
}
