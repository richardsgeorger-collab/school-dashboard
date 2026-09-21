import { diffDays } from './dates';
import { isNoise } from './requirements';
import { effectivePoints } from './gating';
import type { Schedule } from './schedule';
import type { Course, DateStr, Item } from './types';

export type Pace = { kind: 'behind'; n: number } | { kind: 'on' } | { kind: 'ahead'; days: number } | { kind: 'clear' };

/** The word the planner already uses for a class: the first word of its labels ("Chem Quiz 2" → Chem). */
export function classWord(course: Course, items: Item[]): string {
  const counts = new Map<string, number>();
  for (const i of items) {
    if (i.courseId !== course.id) continue;
    const w = i.label.trim().split(/\s+/)[0];
    if (w && /^[A-Za-z]/.test(w)) counts.set(w, (counts.get(w) ?? 0) + 1);
  }
  const best = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  return best?.[0] ?? course.code.split('-')[0];
}

const AHEAD_DAYS = 3;

/**
 * Where one class stands: behind by the number of open items past their deadline day; ahead by the number of
 * free days before anything needs starting (three or more); otherwise on pace. Clear when nothing is open.
 */
export function paceFor(course: Course, items: Item[], schedule: Schedule, today: DateStr): Pace {
  const open = items.filter((i) => i.courseId === course.id && i.status !== 'done' && !isNoise(i));
  if (open.length === 0) return { kind: 'clear' };
  const behind = open.filter((i) => (schedule.byItem[i.id]?.deadlineDay ?? '9999') < today).length;
  if (behind > 0) return { kind: 'behind', n: behind };
  const starts = open.map((i) => schedule.byItem[i.id]?.startBy ?? today).sort();
  const free = diffDays(today, starts[0]);
  return free >= AHEAD_DAYS ? { kind: 'ahead', days: free } : { kind: 'on' };
}

/** "200 pts due in 3 days, not started." for a big item inside its start window and untouched; rare. */
export function riskLine(items: Item[], schedule: Schedule, today: DateStr): string | null {
  const big = items
    .filter((i) => i.status === 'todo' && !isNoise(i) && effectivePoints(i, items) >= 100 && (schedule.byItem[i.id]?.startBy ?? '9999') <= today && (schedule.byItem[i.id]?.deadlineDay ?? today) >= today)
    .sort((a, b) => (schedule.byItem[a.id]?.deadlineDay ?? '').localeCompare(schedule.byItem[b.id]?.deadlineDay ?? '') || effectivePoints(b, items) - effectivePoints(a, items));
  const i = big[0];
  if (!i) return null;
  const days = diffDays(today, schedule.byItem[i.id]?.deadlineDay ?? today);
  return `${effectivePoints(i, items)} pts due ${days <= 0 ? 'today' : days === 1 ? 'tomorrow' : `in ${days} days`}, not started.`;
}

const list = (words: string[]) => (words.length <= 2 ? words.join(' and ') : `${words.slice(0, -1).join(', ')}, and ${words.at(-1)}`);

/** One word per class. A lab that shares its lecture's word becomes "Chem Lab"; any other clash falls back to the code. */
export function classWords(courses: Course[], items: Item[]): Map<string, string> {
  const words = new Map(courses.map((c) => [c.id, classWord(c, items)]));
  const count = () => {
    const seen = new Map<string, number>();
    for (const w of words.values()) seen.set(w, (seen.get(w) ?? 0) + 1);
    return seen;
  };
  let seen = count();
  for (const c of courses) if ((seen.get(words.get(c.id)!) ?? 0) > 1 && /L$/i.test(c.code)) words.set(c.id, `${words.get(c.id)} Lab`);
  seen = count();
  for (const c of courses) if ((seen.get(words.get(c.id)!) ?? 0) > 1) words.set(c.id, c.code);
  return words;
}

/**
 * One line for Now, in facts rather than labels: what is past its start day, what starts today, what is clear and for
 * how long. "On pace in Math" told the student nothing they could act on; "Math starts today" does.
 */
export function paceLine(courses: Course[], items: Item[], schedule: Schedule, today: DateStr): string | null {
  const ahead: string[] = [];
  const behind: { word: string; n: number }[] = [];
  const starting: string[] = [];
  const words = classWords(courses, items);
  for (const c of courses) {
    const p = paceFor(c, items, schedule, today);
    const w = words.get(c.id) ?? c.code;
    if (p.kind === 'clear') continue;
    if (p.kind === 'on') starting.push(w);
    else if (p.kind === 'ahead') ahead.push(w);
    else behind.push({ word: w, n: p.n });
  }
  // The verdict first, then the one move that changes it. A list of class words is not a verdict.
  if (behind.length > 0) {
    const total = behind.reduce((n, b) => n + b.n, 0);
    const worst = [...behind].sort((a, b) => b.n - a.n)[0];
    return `You are behind in ${list(behind.map((b) => b.word))}: ${total} thing${total === 1 ? '' : 's'} should have been started by now. Clearing ${worst.word} first fixes most of it.`;
  }
  if (starting.length > 0) return `You are on pace. ${list(starting)} start${starting.length === 1 ? 's' : ''} today.`;
  if (ahead.length > 0) return `You are ahead in ${list(ahead)}, and nothing else needs starting today.`;
  return null;
}
