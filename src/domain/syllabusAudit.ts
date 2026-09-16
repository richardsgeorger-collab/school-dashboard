import { parseGcuSyllabus } from '../parser/gcuSyllabus';
import { numbersAgree, titleSimilarity } from '../record/match';
import { wasStoredTruncated } from '../syllabus/context';
import { dateOf, fmtDate, fmtTime } from './dates';
import type { Course, DateStr, Item } from './types';

/**
 * The planner's dates held against the syllabus's own assignment table.
 *
 * This exists because a sync moved a due date onto the wrong item: "Topic 2 DQ 1" matched the planner's "DQ 1.2" when
 * matching compared the set of numbers instead of their order. That matching is fixed, but the wrong date it wrote is
 * still in the planner, and nothing else in the app can tell a wrong date from a right one. The syllabus can.
 */
export interface DateMismatch {
  item: Item;
  /** What the planner says now. */
  plannerAt: string;
  /** What the syllabus says, as an instant in the student's zone. */
  syllabusAt: string;
  /** The row in the syllabus, as it is written there. */
  title: string;
  topic: string | null;
  points: number;
  /** How alike the two titles are, 1 being the same words. */
  score: number;
  line: string;
}

export interface SyllabusAudit {
  /** Rows the syllabus carries. */
  rows: number;
  matched: number;
  mismatches: DateMismatch[];
  /** Planner items no syllabus row matched, by label. */
  unmatched: string[];
  /** The stored syllabus is missing its end, so this audit only covers part of the term. */
  partial: boolean;
  /** Topic numbers the stored text actually covers. */
  topics: number[];
  /** Why there is nothing to say, when there is nothing to say. */
  note: string | null;
}

const MATCH = 0.6;

const sameInstant = (a: string, b: string) => Date.parse(a) === Date.parse(b);

/** How alike a syllabus row and a planner item are. Numbers must come in the same order: "Topic 2 DQ 1" is not "DQ 1.2". */
export function rowScore(rowTitle: string, item: Item): number {
  if (!numbersAgree(rowTitle, item.title) && !numbersAgree(rowTitle, item.label)) return 0;
  return Math.max(titleSimilarity(rowTitle, item.title), titleSimilarity(rowTitle, item.label));
}

/** Every planner item for one class, compared with the syllabus row that names it. */
export function auditDates(course: Course, items: Item[], syllabusText: string | null, tz: string): SyllabusAudit {
  const empty: SyllabusAudit = { rows: 0, matched: 0, mismatches: [], unmatched: [], partial: false, topics: [], note: null };
  if (!syllabusText || syllabusText.trim().length < 200) return { ...empty, note: `No syllabus on file for ${course.code}. Drop it into the class library and the dates can be checked against it.` };
  const parsed = parseGcuSyllabus(syllabusText.split('\n'), { tz });
  const partial = wasStoredTruncated(syllabusText);
  const topics = parsed.topics.map((t) => t.n).sort((a, b) => a - b);
  if (parsed.assessments.length === 0) return { ...empty, partial, topics, note: `The syllabus on file for ${course.code} has no assignment table this can read.` };

  const mine = items.filter((i) => i.courseId === course.id);
  const used = new Set<string>();
  const mismatches: DateMismatch[] = [];
  let matched = 0;
  for (const row of parsed.assessments) {
    let best: { item: Item; score: number } | null = null;
    for (const item of mine) {
      if (used.has(item.id)) continue;
      const score = rowScore(row.title, item);
      if (score >= MATCH && (!best || score > best.score)) best = { item, score };
    }
    if (!best) continue;
    used.add(best.item.id);
    matched++;
    if (sameInstant(best.item.dueAt, row.dueAt)) continue;
    const plannerDay = dateOf(best.item.dueAt, tz);
    const syllabusDay = dateOf(row.dueAt, tz);
    const when = (iso: string) => `${fmtDate(dateOf(iso, tz), 'short')} ${fmtTime(iso, tz)}`;
    mismatches.push({
      item: best.item,
      plannerAt: best.item.dueAt,
      syllabusAt: row.dueAt,
      title: row.title,
      topic: row.topic,
      points: row.points,
      score: best.score,
      line: `${best.item.label} is ${when(best.item.dueAt)} here; the syllabus says ${when(row.dueAt)}${plannerDay === syllabusDay ? ' (same day, different time)' : ''}.`,
    });
  }
  const unmatched = mine.filter((i) => !used.has(i.id) && i.type !== 'participation').map((i) => i.label);
  return { rows: parsed.assessments.length, matched, mismatches, unmatched, partial, topics, note: null };
}

/** The items as they would be with the checked fixes written in. Pure: nothing else on an item is touched. */
export function withFixedDates(items: Item[], fixes: DateMismatch[], now: string): { items: Item[]; touched: string[] } {
  const by = new Map(fixes.map((f) => [f.item.id, f]));
  const touched: string[] = [];
  const next = items.map((i) => {
    const f = by.get(i.id);
    if (!f || i.dueAt === f.syllabusAt) return i;
    touched.push(i.id);
    return { ...i, dueAt: f.syllabusAt, updatedAt: now };
  });
  return { items: next, touched };
}

/** One line for the screen: what was checked and what came of it. */
export function auditLine(audit: SyllabusAudit, course: Course, today: DateStr): string {
  if (audit.note) return audit.note;
  const cover = audit.partial ? ` The stored syllabus is missing its end, so only Topic${audit.topics.length === 1 ? '' : 's'} ${audit.topics.join(', ')} could be checked.` : '';
  if (audit.mismatches.length === 0) return `Every ${course.code} date matches the syllabus (${audit.matched} of ${audit.rows} rows matched an item).${cover}`;
  const n = audit.mismatches.length;
  const soon = audit.mismatches.filter((m) => dateOf(m.syllabusAt, 'America/Phoenix') >= today).length;
  return `${n} ${course.code} date${n === 1 ? ' does' : 's do'} not match the syllabus${soon && soon !== n ? `, ${soon} of them still ahead` : ''}.${cover}`;
}
