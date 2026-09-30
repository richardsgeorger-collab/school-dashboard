import { mergeRequirements } from '../domain/requirements';
import type { Item, Requirement } from '../domain/types';

/**
 * Is an assignment an announcement describes one Halo already has? (George, 2026-09-30: a professor mentioning a
 * discussion question made a second copy of it with another date.) Halo's own assignment is the truth; an
 * announcement adds requirements to it and never a second row. Matching is on numbering first ("DQ 3.1", "Topic 3
 * DQ 1" and "Topic 3 Discussion Question 1" are one), then on meaning (the distinctive words of Halo's title, due
 * within a week of each other), never on exact wording.
 */

/** "dq 3.1", "quiz 2", "practice quiz 2", "exam 1", "topic 3 homework", "week 5 participation"; null when unnumbered. */
export function workKey(title: string): string | null {
  const s = title.toLowerCase().replace(/[–—]/g, '-');
  let m = /\bdq\s*#?\s*(\d+)\s*[.-]\s*(\d+)/.exec(s) ?? /\btopic\s*(\d+)\s*[:,-]?\s*(?:dq|discussion(?:\s+question)?)\s*#?\s*(\d+)/.exec(s) ?? /\bdiscussion\s+question\s*(\d+)\s*[.-]\s*(\d+)/.exec(s);
  if (m) return `dq ${Number(m[1])}.${Number(m[2])}`;
  m = /\b(practice\s+)?quiz\s*#?\s*(\d+)/.exec(s);
  if (m) return `${m[1] ? 'practice ' : ''}quiz ${Number(m[2])}`;
  m = /\bexam\s*#?\s*(\d+)/.exec(s);
  if (m) return `exam ${Number(m[1])}`;
  m = /\btopic\s*(\d+)\s*(homework|activity|review|reading)/.exec(s);
  if (m) return `topic ${Number(m[1])} ${m[2]}`;
  m = /\bweek\s*(\d+)\s*participation/.exec(s);
  if (m) return `week ${Number(m[1])} participation`;
  return null;
}

// Words that say what to do or what kind of thing it is, not which one: they never make two titles the same work.
const GENERIC = new Set(
  'a an the and or of for to in on at by with from as is are be your you this that it its all any each due date submit complete completed read reply post upload turn print sign bring make sure please remember before after same week topic lab labs quiz quizzes exam homework assignment assignments activity review report reports discussion question questions dq participation paper essay project final draft part one two three four five pdf file files document documents image images class course professor instructor'.split(
    ' ',
  ),
);
const words = (t: string) => new Set(t.toLowerCase().replace(/[^a-z0-9\s-]/g, ' ').split(/[\s-]+/).filter((w) => w.length > 2 && !GENERIC.has(w) && !/^\d+$/.test(w)));

/** Both titles carry a number and the numbers differ: DQ 3.1 is never DQ 3.2, however alike the wording. */
export function keysDiffer(a: Pick<Item, 'title'>, b: Pick<Item, 'title'>): boolean {
  const x = workKey(a.title);
  const y = workKey(b.title);
  return !!x && !!y && x !== y;
}

export function sameAssignment(halo: Pick<Item, 'title' | 'dueAt'>, made: Pick<Item, 'title' | 'dueAt'>): boolean {
  const a = workKey(halo.title);
  const b = workKey(made.title);
  if (a && b) return a === b;
  const hw = words(halo.title);
  const mw = words(made.title);
  let shared = 0;
  for (const w of hw) if (mw.has(w)) shared++;
  if (shared < 2 && !(shared === 1 && hw.size === 1)) return false;
  const days = Math.abs(Date.parse(halo.dueAt) - Date.parse(made.dueAt)) / 86_400_000;
  return days <= 7;
}

/** Halo says it is turned in or graded: nothing an announcement says can move, reopen or copy it. */
export function isLocked(i: Pick<Item, 'score' | 'halo' | 'status' | 'haloId'>): boolean {
  if (i.score !== null && i.score !== undefined) return true;
  const st = i.halo?.status ?? null;
  if (st === 'SUBMITTED' || st === 'PUBLISHED' || !!i.halo?.submittedAt) return true;
  return !!i.haloId && i.status === 'done' && !!i.halo;
}

/** The Halo assignment an announcement's new work describes, when there is one in the class. */
export function haloMatch<T extends Item>(items: T[], made: Pick<Item, 'title' | 'dueAt' | 'courseId'>): T | undefined {
  return items.find((i) => i.courseId === made.courseId && !!i.haloId && sameAssignment(i, made));
}

/**
 * The one-time cleanup: every announcement-made row that is really a Halo assignment folds into it. Its instruction
 * becomes a requirement on Halo's item (ticked if the copy was done), its own requirements come along with their
 * ticks, and the copy is removed. Halo's date, points and status stay.
 */
export function foldDuplicates(items: Item[], now: string): { upserts: Item[]; deletes: string[]; pairs: { copy: Item; into: Item }[] } {
  const byId = new Map(items.map((i) => [i.id, i]));
  const deletes: string[] = [];
  const pairs: { copy: Item; into: Item }[] = [];
  for (const copy of items) {
    if (copy.haloId || copy.origin?.kind !== 'announcement') continue;
    const target = haloMatch([...byId.values()].filter((i) => !deletes.includes(i.id)), copy);
    if (!target) continue;
    const asReq: Requirement = { id: `fold-${copy.id}`, text: copy.title, dueAt: copy.dueAt !== target.dueAt && !isLocked(target) ? copy.dueAt : null, done: copy.status === 'done', doneAt: copy.status === 'done' ? (copy.completedAt ?? now) : null, gradedOn: true, source: copy.origin, addedAt: now };
    const merged = mergeRequirements(mergeRequirements(target.requirements, copy.requirements ?? []), [asReq]);
    const next = { ...target, requirements: merged, updatedAt: now };
    byId.set(target.id, next);
    byId.delete(copy.id);
    deletes.push(copy.id);
    pairs.push({ copy, into: next });
  }
  const touched = new Set(pairs.map((p) => p.into.id));
  return { upserts: [...touched].map((id) => byId.get(id)!).filter(Boolean), deletes, pairs };
}
