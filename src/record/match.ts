import { classifyItem } from '../domain/classify';
import { addDays, dateOf, makeIso, weekdayOf, zonedParts } from '../domain/dates';
import { estimateMinutes } from '../domain/estimate';
import { newId } from '../domain/ids';
import { shortLabel } from '../domain/labels';
import { DEFAULT_FLAGS, type Course, type DateStr, type Item } from '../domain/types';
import { normTitle } from '../halo/normalize';
import type { Mention } from './notes';

const NUMBER_WORDS: Record<string, string> = { one: '1', two: '2', three: '3', four: '4', five: '5', six: '6', seven: '7', eight: '8', nine: '9', ten: '10', eleven: '11', twelve: '12' };
/** Words that say what kind of thing it is without saying which one. */
const GENERIC = new Set(['homework', 'assignment', 'hw', 'the', 'this', 'that', 'week', 'class', 'due', 'chapter', 'ch', 'topic', 'for', 'and']);
function words(s: string): string[] {
  return normTitle(s)
    .split(' ')
    .map((w) => NUMBER_WORDS[w] ?? w)
    .filter((w) => w.length > 0);
}
function tokens(s: string): Set<string> {
  return new Set(words(s).filter((w) => (w.length > 1 || /^\d$/.test(w)) && !GENERIC.has(w)));
}
export function titleSimilarity(a: string, b: string): number {
  const A = tokens(a);
  const B = tokens(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const w of A) if (B.has(w)) inter++;
  return inter / (A.size + B.size - inter);
}

/** The planner item a mention is about: the model's pick if it exists, else the closest open title in that class. */
export function matchMention(m: Mention, items: Item[], courseId: string): Item | null {
  const pool = items.filter((i) => i.courseId === courseId && i.status !== 'done');
  if (m.itemId) {
    const hit = pool.find((i) => i.id === m.itemId);
    if (hit) return hit;
  }
  const q = words(m.title).join(' ');
  if (!q) return null;
  const scores = new Map<string, number>();
  for (const i of pool) {
    const t = words(i.title).join(' ');
    const l = words(i.label).join(' ');
    let s = Math.max(titleSimilarity(q, t), titleSimilarity(q, l));
    if (` ${t} `.includes(` ${q} `) || ` ${l} `.includes(` ${q} `)) s = Math.max(s, 0.9);
    scores.set(i.id, s);
  }
  // A distinctive word (ALEKS, LopesWrite) that appears in exactly one open item is a match on its own,
  // unless the mention names a number that item does not carry ("Quiz 1" is not "Quiz 2").
  const isNum = (w: string) => /^\d+$/.test(w);
  const nums = [...tokens(m.title)].filter(isNum);
  for (const w of tokens(m.title)) {
    if (w.length < 3 || isNum(w)) continue;
    const owners = pool.filter((i) => tokens(i.title).has(w) || tokens(i.label).has(w));
    if (owners.length !== 1) continue;
    const theirs = [...tokens(owners[0].title), ...tokens(owners[0].label)].filter(isNum);
    if (nums.length && theirs.length && !nums.some((n) => theirs.includes(n))) continue;
    scores.set(owners[0].id, Math.max(scores.get(owners[0].id) ?? 0, 0.75));
  }
  let best: { item: Item; s: number } | null = null;
  for (const i of pool) {
    const s = scores.get(i.id) ?? 0;
    if (s > (best?.s ?? 0)) best = { item: i, s };
  }
  return best && best.s >= 0.5 ? best.item : null;
}

export type Proposal =
  | { kind: 'update'; item: Item; dueAt: string }
  | { kind: 'add'; item: Item }
  | { kind: 'remove'; item: Item }
  | { kind: 'confirm'; item: Item | null; text: string }
  | { kind: 'none'; text: string };

export function newItemFrom(m: Mention, course: Course, dueAt: string, lectureDate: DateStr, now: string): Item {
  const title = m.title.trim();
  const classified = classifyItem(title, course.code);
  // Something a professor assigns in class with no better cue is homework, not "other".
  const type = classified === 'other' ? 'homework' : classified;
  const points = m.points ?? 10;
  return {
    id: newId(),
    courseId: course.id,
    title,
    label: shortLabel({ title, courseCode: course.code, type }),
    labelOverridden: false,
    type,
    points,
    opensAt: null,
    dueAt,
    estimatedMinutes: estimateMinutes({ title, type, points, courseCode: course.code }),
    estimateOverridden: false,
    startByOverride: null,
    status: 'todo',
    completedAt: null,
    score: null,
    notes: `From the ${lectureDate} lecture: "${m.quote}"`,
    topic: null,
    flags: { ...DEFAULT_FLAGS },
    source: 'manual',
    award: null,
    updatedAt: now,
  };
}

/** What approving a mention would do. Nothing here writes anything. */
const pad2 = (n: number) => String(n).padStart(2, '0');
/** Wall-clock time of an item's deadline, so a moved in-class quiz stays at class time. */
function timeOf(item: Item, tz: string): string {
  const p = zonedParts(item.dueAt, tz);
  return `${pad2(p.hh)}:${pad2(p.mm)}`;
}

export function proposalFor(m: Mention, match: Item | null, course: Course, tz: string, lectureDate: DateStr, now: string): Proposal {
  const dueAt = m.date ? makeIso(m.date, m.time ?? (match ? timeOf(match, tz) : '23:59'), tz) : null;
  const sameDay = match && dueAt ? dateOf(match.dueAt, tz) === dateOf(dueAt, tz) : false;
  switch (m.kind) {
    case 'date_change':
      if (match && dueAt) return sameDay ? { kind: 'confirm', item: match, text: `${match.label} is already due that day.` } : { kind: 'update', item: match, dueAt };
      if (!match && dueAt) return { kind: 'add', item: newItemFrom(m, course, dueAt, lectureDate, now) };
      return { kind: 'none', text: 'No date could be read from this. Nothing to change.' };
    case 'new':
      if (match) return dueAt && !sameDay ? { kind: 'update', item: match, dueAt } : { kind: 'confirm', item: match, text: `Already in the planner as ${match.label}.` };
      if (dueAt) return { kind: 'add', item: newItemFrom(m, course, dueAt, lectureDate, now) };
      return { kind: 'none', text: 'No date given. Add it by hand if it matters.' };
    case 'cancel':
      return match ? { kind: 'remove', item: match } : { kind: 'none', text: 'Nothing in the planner matches this.' };
    case 'info':
    default:
      if (match && dueAt && !sameDay) return { kind: 'update', item: match, dueAt };
      return { kind: 'confirm', item: match, text: match ? `Matches ${match.label}. Nothing to change.` : 'Nothing to change.' };
  }
}

const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
/** "Friday" said on a Wednesday is that Friday; said on a Friday it is the next one. */
export function nextWeekday(name: string, from: DateStr): DateStr | null {
  const key = name.trim().toLowerCase().slice(0, 3);
  const idx = DAYS.findIndex((d) => d.startsWith(key));
  if (idx < 0) return null;
  let delta = (idx - weekdayOf(from) + 7) % 7;
  if (delta === 0) delta = 7;
  return addDays(from, delta);
}
