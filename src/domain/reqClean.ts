import { dateOf } from './dates';
import type { DateStr, Item, ReqSource, Requirement } from './types';

/**
 * The announcement pass produces a pile: the same instruction from four posts in four wordings, parts that only
 * restate the assignment's own title and date, and class-wide rules dated as if they were tasks for today. This
 * cleans that up at read time, so data already extracted is fixed without asking the model again, and the same
 * rules go into the prompt so new extractions arrive clean.
 */

export type ReqScope =
  /** A concrete thing to do, usually with a date. Belongs on the agenda. */
  | 'instance'
  /** A standing class rule. True all term, never a task for a particular day. */
  | 'rule'
  /** Worth knowing, not itself an action. */
  | 'reference';

const STOP = new Set(['the', 'a', 'an', 'your', 'you', 'to', 'of', 'in', 'on', 'by', 'for', 'and', 'or', 'is', 'are', 'be', 'must', 'should', 'will', 'please', 'make', 'sure', 'at', 'least', 'this', 'that', 'it', 'as', 'with', 'from', 'do', 'does', 'have', 'has']);

/** Words that carry meaning, lowercased, stripped of punctuation and dates. */
export function tokens(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/\(?\d{4}-\d{2}-\d{2}\)?/g, ' ')
    .replace(/\b(mon|tues|wednes|thurs|fri|satur|sun)day\b/g, ' ')
    .replace(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\s*\d{1,2}\b/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 1 && !STOP.has(w));
}

/** How much two instructions overlap, 0 to 1. Same meaning in different words still scores high. */
export function overlap(a: string, b: string): number {
  const A = new Set(tokens(a));
  const B = new Set(tokens(b));
  if (A.size === 0 || B.size === 0) return 0;
  let shared = 0;
  for (const w of A) if (B.has(w)) shared += 1;
  return shared / Math.min(A.size, B.size);
}

/** Phrasing that marks a class-wide rule rather than a thing to do on a day. */
const RULE_SHAPES = [
  /\b(every|each|all)\s+(dq|post|discussion|assignment|submission|paper|reply|replies)/i,
  /\bmust be\b/i,
  /\balways\b/i,
  /\blate (work|submissions?|assignments?)\b/i,
  /\bwill (not )?be (accepted|graded|deducted)\b/i,
  /\breceives? zero\b/i,
  /\bno (handwriting|handwritten|late)\b/i,
  /\bone pdf only\b/i,
  /\b\d+\s*[-–]\s*\d+\s*words\b/i,
  /\bon \d+ separate days\b/i,
  /\bthroughout the (term|semester|course)\b/i,
];

export const looksLikeRule = (text: string): boolean => RULE_SHAPES.some((re) => re.test(text));

/**
 * A part that only says the assignment's own name and date adds nothing next to it. "Complete and submit Practice
 * Quiz 1 by Sunday" sitting on Practice Quiz 1 is noise; "Cite two peer-reviewed sources" is not.
 */
export function restatesItem(text: string, item: Pick<Item, 'title'>): boolean {
  const VERBS = new Set(['complete', 'submit', 'finish', 'turn', 'hand', 'post', 'upload', 'take', 'do', 'due', 'quiz', 'assignment', 'in']);
  const left = tokens(text).filter((w) => !VERBS.has(w));
  const title = new Set(tokens(item.title));
  if (left.length === 0) return true;
  // Everything it says beyond the verbs is already the title.
  return left.every((w) => title.has(w));
}

const allSources = (r: Requirement): ReqSource[] => (r.sources?.length ? r.sources : r.source ? [r.source] : []);

/** Merges b into a: every source kept, the earliest real deadline kept, the clearest wording kept. */
function merge(a: Requirement, b: Requirement): Requirement {
  const seen = new Set<string>();
  const sources = [...allSources(a), ...allSources(b)].filter((s) => {
    const k = `${s.id ?? ''}|${s.quote ?? ''}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  // Keep the first wording. Any of them is right, and a stable choice means the checklist does not reshuffle
  // itself every time another post repeats the same instruction.
  const text = a.text;
  const dueAt = a.dueAt && b.dueAt ? (a.dueAt < b.dueAt ? a.dueAt : b.dueAt) : (a.dueAt ?? b.dueAt);
  return { ...a, text, dueAt, sources, done: a.done || b.done, doneAt: a.doneAt ?? b.doneAt, gradedOn: a.gradedOn || b.gradedOn, redefinesDone: a.redefinesDone || b.redefinesDone };
}

export interface CleanResult {
  parts: Requirement[];
  /** How many went away, for the before-and-after count. */
  merged: number;
  dropped: number;
}

/** One item's requirements, deduplicated, classified, and stripped of anything that only repeats the item. */
export function cleanRequirements(item: Pick<Item, 'title' | 'requirements'>, opts: { ruleTexts?: Set<string> } = {}): CleanResult {
  const raw = item.requirements ?? [];
  let dropped = 0;
  let merged = 0;
  const out: Requirement[] = [];
  for (const r of raw) {
    if (restatesItem(r.text, item)) {
      dropped += 1;
      continue;
    }
    const isRule = r.scope === 'rule' || (!r.scope && (looksLikeRule(r.text) || opts.ruleTexts?.has(tokens(r.text).join(' '))));
    // A standing rule is true all term; a date on it turns a rule into a fake deadline.
    const shaped: Requirement = { ...r, scope: isRule ? 'rule' : (r.scope ?? 'instance'), dueAt: isRule ? null : r.dueAt, sources: allSources(r) };
    const hit = out.findIndex((x) => overlap(x.text, shaped.text) >= 0.6 && x.scope === shaped.scope);
    if (hit >= 0) {
      out[hit] = merge(out[hit], shaped);
      merged += 1;
      continue;
    }
    out.push(shaped);
  }
  return { parts: out, merged, dropped };
}

/**
 * Text that shows up on several assignments in a class is a class rule, whatever its wording suggests. Two posts
 * saying "150-200 words" on two different discussions is the tell.
 */
export function classRuleTexts(items: Item[]): Set<string> {
  const count = new Map<string, Set<string>>();
  for (const i of items) {
    for (const r of i.requirements ?? []) {
      const k = tokens(r.text).join(' ');
      if (!k) continue;
      count.set(k, (count.get(k) ?? new Set()).add(i.id));
    }
  }
  return new Set([...count.entries()].filter(([, ids]) => ids.size >= 2).map(([k]) => k));
}

export interface CleanedItem extends Item {
  requirements: Requirement[];
}

/** Every item's parts cleaned, using the whole class to spot rules that repeat across assignments. */
export function cleanAll(items: Item[]): { items: CleanedItem[]; merged: number; dropped: number } {
  const byCourse = new Map<string, Item[]>();
  for (const i of items) byCourse.set(i.courseId, [...(byCourse.get(i.courseId) ?? []), i]);
  const rules = new Map<string, Set<string>>();
  for (const [cid, list] of byCourse) rules.set(cid, classRuleTexts(list));
  let merged = 0;
  let dropped = 0;
  const out = items.map((i) => {
    if (!i.requirements?.length) return { ...i, requirements: [] as Requirement[] };
    const r = cleanRequirements(i, { ruleTexts: rules.get(i.courseId) });
    merged += r.merged;
    dropped += r.dropped;
    return { ...i, requirements: r.parts };
  });
  return { items: out, merged, dropped };
}

/** The parts that belong on a day: concrete things to do, not standing rules. */
export const instanceParts = (i: Pick<Item, 'requirements'>): Requirement[] => (i.requirements ?? []).filter((r) => (r.scope ?? 'instance') === 'instance');

/** The class's standing rules, deduplicated across its assignments, for the class page and the item reference. */
export function rulesFor(items: Item[], courseId: string): { text: string; sources: ReqSource[]; items: string[] }[] {
  const out = new Map<string, { text: string; sources: ReqSource[]; items: string[] }>();
  for (const i of items) {
    if (i.courseId !== courseId) continue;
    for (const r of i.requirements ?? []) {
      if ((r.scope ?? 'instance') !== 'rule') continue;
      const k = tokens(r.text).join(' ');
      const row = out.get(k) ?? { text: r.text, sources: [], items: [] };
      for (const s of allSources(r)) if (!row.sources.some((x) => x.id === s.id && x.quote === s.quote)) row.sources.push(s);
      if (!row.items.includes(i.title)) row.items.push(i.title);
      out.set(k, row);
    }
  }
  return [...out.values()];
}

/** Parts due on a given day, for the agenda's day grouping, counted against the item's own date when they have none. */
export function partsDueOn(item: Item, day: DateStr, tz: string): Requirement[] {
  return instanceParts(item).filter((r) => !r.done && dateOf(r.dueAt ?? item.dueAt, tz) === day);
}
