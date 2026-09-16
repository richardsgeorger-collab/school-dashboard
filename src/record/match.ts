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

/** The audit says this was already handed in. */
export const saysSubmitted = (m: Mention): boolean => /\b(already )?(submitted|turned in|handed in|completed|done)\b/i.test(m.note ?? '') && !/\b(not( yet)? submitted|unsubmitted|never submitted|not turned in)\b/i.test(m.note ?? '');

/** A finding that gates other work: it names what it unlocks, or its note calls it a prerequisite. */
/** A finding that gates other work: it names what it unlocks, its note calls it a prerequisite, or it is a post that claims a topic for later work. */
export const isGating = (m: Mention): boolean =>
  (m.gates?.length ?? 0) > 0 ||
  /\b(gates?|gating|prerequisite|required before|must be (done|claimed|completed|submitted) before|before (you|the student) can)\b/i.test(m.note ?? '') ||
  /\b(name-claiming|claim(ing)? (your|a|the) [^.]{0,30}topic|pick your [^.]{0,40}topic)\b/i.test(`${m.title} ${m.note ?? ''}`);

/** The numbers in a title, in the order written: "Topic 2 DQ 1" is [2, 1] and "DQ 1.2" is [1, 2]. */
const numbersOf = (s: string): string[] => words(s).filter((w) => /^\d+$/.test(w));
const inOrder = (a: string[], b: string[]): boolean => {
  let i = 0;
  for (const x of b) if (i < a.length && a[i] === x) i++;
  return i === a.length;
};
/** Titles whose numbers come in a different order name different things: "Topic 2 DQ 1" is not "DQ 1.2". One title's numbers may extend the other's. */
export const numbersAgree = (a: string, b: string): boolean => {
  const A = numbersOf(a);
  const B = numbersOf(b);
  return !A.length || !B.length || inOrder(A, B) || inOrder(B, A);
};
/** The most a title can score when its numbers disagree with the item's: below the match line. */
const DISAGREE = 0.4;

function likeness(q: string, m: Mention, item: Item): number {
  if (normTitle(item.title) === normTitle(m.title)) return 1;
  const t = words(item.title).join(' ');
  const l = words(item.label).join(' ');
  let s = Math.max(titleSimilarity(q, t), titleSimilarity(q, l));
  if (` ${t} `.includes(` ${q} `) || ` ${l} `.includes(` ${q} `)) s = Math.max(s, 0.9);
  if (!numbersAgree(m.title, item.title) && !numbersAgree(m.title, item.label)) s = Math.min(s, DISAGREE);
  return s;
}

/** How alike a mention and an item are, by title or label; 1 is the same words, and numbers must come in the same order. */
export function matchScore(m: Mention, item: Item): number {
  const q = words(m.title).join(' ');
  return q ? likeness(q, m, item) : 0;
}

/** The planner item a mention is about: the model's pick if it exists, else the closest open title in that class. */
export function matchMention(m: Mention, items: Item[], courseId: string): Item | null {
  // A posted score or a late flag is about work already handed in, so done items count for those.
  const includeDone = m.kind === 'grade' || m.audit?.status === 'overdue';
  const gating = isGating(m);
  // A gating finding is its own item: never the thing it unlocks, and only an item with (nearly) the same title.
  const pool = items.filter((i) => i.courseId === courseId && (includeDone || i.status !== 'done') && !(gating && (m.gates ?? []).some((g) => titleSimilarity(g, i.title) >= 0.5 || titleSimilarity(g, i.label) >= 0.5)));
  if (gating) {
    const q = words(m.title).join(' ');
    const self = pool.find((i) => titleSimilarity(q, words(i.title).join(' ')) >= 0.8 || normTitle(i.title) === normTitle(m.title));
    return self ?? null;
  }
  if (m.itemId) {
    const hit = pool.find((i) => i.id === m.itemId);
    if (hit) return hit;
  }
  const q = words(m.title).join(' ');
  if (!q) return null;
  const scores = new Map<string, number>();
  for (const i of pool) scores.set(i.id, likeness(q, m, i));
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
  | { kind: 'score'; item: Item; score: number }
  | { kind: 'flag'; item: Item; text: string }
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
  if (m.audit?.prefix === 'ENG105-PENDING') return { kind: 'none', text: 'ENG-105 is waiting on the section switch. Nothing to do until Halo updates.' };
  if (m.audit?.prefix === 'OLD-SECTION') return { kind: 'none', text: 'Old Engineering Math section. Ignored.' };
  const dueAt = m.date ? makeIso(m.date, m.time ?? (match ? timeOf(match, tz) : '23:59'), tz) : null;
  const sameDay = match && dueAt ? dateOf(match.dueAt, tz) === dateOf(dueAt, tz) : false;
  switch (m.kind) {
    case 'date_change':
      if (match && dueAt) return sameDay ? { kind: 'confirm', item: match, text: `${match.label} is already due that day.` } : { kind: 'update', item: match, dueAt };
      if (!match && dueAt) return { kind: 'add', item: newItemFrom(m, course, dueAt, lectureDate, now) };
      return { kind: 'none', text: `"${m.title}": no date could be read from this. Nothing to change.` };
    case 'new': {
      if (match) return dueAt && !sameDay ? { kind: 'update', item: match, dueAt } : { kind: 'confirm', item: match, text: `Already in the planner as ${match.label}.` };
      const handedIn = saysSubmitted(m);
      if (handedIn && (m.points ?? 0) === 0) return { kind: 'confirm', item: null, text: `"${m.title}" is a 0-point item already submitted in Halo. Nothing to track.` };
      // A 0-point item whose date has passed without Halo flagging it late would only sit on Now as a stale row.
      if (m.points === 0 && m.date && m.date < lectureDate) return { kind: 'confirm', item: null, text: `"${m.title}" is a 0-point item already past its date, and Halo does not flag it late. Nothing to track.` };
      if (dueAt) {
        const fresh = newItemFrom(m, course, dueAt, lectureDate, now);
        return { kind: 'add', item: handedIn ? { ...fresh, status: 'done', completedAt: dueAt } : fresh };
      }
      return { kind: 'none', text: `"${m.title}": no date given. Add it by hand if it matters.` };
    }
    case 'cancel':
      return match ? { kind: 'remove', item: match } : { kind: 'none', text: `"${m.title}": nothing in the planner matches it.` };
    case 'grade':
      if (match && m.score != null) return match.score === m.score ? { kind: 'confirm', item: match, text: `${match.label} already has ${m.score}.` } : { kind: 'score', item: match, score: m.score };
      // A posted grade for something the planner never had: bring it in done, with its score, so Grades sees it.
      if (!match && m.score != null && dueAt && (m.points ?? 0) > 0) {
        const fresh = newItemFrom(m, course, dueAt, lectureDate, now);
        return { kind: 'add', item: { ...fresh, status: 'done', completedAt: dueAt, score: m.score, scoreSource: 'halo', points: m.points ?? fresh.points } };
      }
      return { kind: 'none', text: match ? `No score could be read for ${match.label}.` : `"${m.title}"${m.score != null ? ` scored ${m.score}` : ''}: nothing in the planner matches it, so there is nowhere to put the score.` };
    case 'info':
    default:
      if (m.audit?.status === 'overdue') return match ? { kind: 'flag', item: match, text: `Halo says ${match.label} is late${match.status === 'done' ? ' even though it is marked done here' : ''} — check this.` } : { kind: 'none', text: `Halo says "${m.title}" is late; nothing in the planner matches it. Check it in Halo.` };
      if (m.audit?.status === 'schedule') return { kind: 'none', text: `"${m.title}": meeting days or times differ in Halo. Edit the class in Settings if Halo is right.` };
      if (m.audit?.status === 'note') return { kind: 'none', text: `Could not read: "${m.quote}". Left here so it is not lost.` };
      if (match && dueAt && !sameDay) return { kind: 'update', item: match, dueAt };
      return { kind: 'confirm', item: match, text: match ? `"${m.title}" matches ${match.label}. Nothing to change.` : `"${m.title}": nothing to change.` };
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
