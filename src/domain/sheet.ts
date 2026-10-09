import { dateOf, diffDays, fmtDate, fmtMinutes, fmtTime, weekdayOf } from './dates';
import { restatesItem } from './reqClean';
import { cleanLine, detailFor, shortLine } from './shortLine';
import type { DateStr, Item, Requirement } from './types';


/**
 * The assignment sheet's words (George, 2026-10-08 redesign): one clean line of facts, one nudge, and one checklist
 * that merges what the assignment asks for, the parts announcements added, and what to do before starting. Pure, so
 * the sheet's tests can read them without a browser.
 */

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** "Due Sun, Oct 11 · 100 pts · ~2h"; "Due today 5 PM"; "Was due Oct 3". */
export function whenLine(item: Pick<Item, 'dueAt' | 'points'>, minutes: number, tz: string, today: DateStr): string {
  const d = dateOf(item.dueAt, tz);
  const k = diffDays(today, d);
  const time = fmtTime(item.dueAt, tz);
  const at = time === '11:59 PM' ? '' : ` ${time}`;
  const when = k === 0 ? `Due today${at}` : k === 1 ? `Due tomorrow${at}` : k < 0 ? `Was due ${DAYS[weekdayOf(d)]}, ${fmtDate(d, 'short')}` : `Due ${DAYS[weekdayOf(d)]}, ${fmtDate(d, 'short')}${at}`;
  const parts = [when];
  if (item.points > 0) parts.push(`${item.points} pts`);
  if (minutes > 0) parts.push(`~${fmtMinutes(minutes)}`);
  return parts.join(' · ');
}

/** One short push, only while it helps: "Start today to finish by Sat.", "Start by Thu, Oct 9.", or nothing. */
export function nudgeLine(item: Pick<Item, 'status' | 'dueAt'>, startBy: DateStr | null, finishBy: string | null, today: DateStr, tz: string): string | null {
  if (item.status === 'done' || !startBy) return null;
  const due = dateOf(item.dueAt, tz);
  if (due < today) return 'It is past due: the sooner it is in, the better.';
  const fin = finishBy ? dateOf(finishBy, tz) : null;
  const finishPart = fin && fin < due && fin >= today ? ` to finish by ${diffDays(today, fin) === 0 ? 'today' : diffDays(today, fin) === 1 ? 'tomorrow' : DAYS[weekdayOf(fin)]}` : '';
  if (startBy <= today) return `Start today${finishPart}.`;
  const k = diffDays(today, startBy);
  return `Start ${k === 1 ? 'tomorrow' : `by ${DAYS[weekdayOf(startBy)]}, ${fmtDate(startBy, 'short')}`}${finishPart}.`;
}

export type LineTag = 'Halo' | 'announcement' | 'syllabus' | 'notes' | 'step';
export interface TodoLine {
  /** Stable across renders: the requirement's own id, the step's id, or a key made from the text. */
  id: string;
  text: string;
  detail?: string;
  tag: LineTag;
  done: boolean;
  kind: 'req' | 'step' | 'ask' | 'pre';
  /** For a part from a post: the post to open. */
  post?: string | null;
}

/** "(syllabus)", "(Halo description)", "(announcement Sep 5)" at the end of a line say where it came from, not what to do. */
const SOURCE_TAIL = /\s*\((?:the )?(?:syllabus|halo(?: description)?|announcement[^)]*|rubric|handout)\)\s*$/i;

/** A run-on prerequisite becomes short items: split at sentence ends and semicolons, the source tail removed from each. */
export function splitPrereq(text: string): string[] {
  return text
    .split(/(?<=[.;!?])\s+(?=[A-Z])|;\s+/)
    .map((s) => s.replace(/[.;]\s*$/, '').replace(SOURCE_TAIL, '').replace(/[.;]\s*$/, '').trim())
    .filter((s) => s.length > 2)
    .filter((s, i, a) => a.findIndex((t) => t.toLowerCase() === s.toLowerCase()) === i);
}

export function prereqTag(source: string): LineTag {
  const s = source.toLowerCase();
  if (s.includes('announce')) return 'announcement';
  if (s.includes('syllab')) return 'syllabus';
  if (s.includes('note') || s.includes('lecture')) return 'notes';
  return 'Halo';
}

const tagOf = (r: Requirement): LineTag => (r.source.kind === 'announcement' ? 'announcement' : r.source.kind === 'syllabus' ? 'syllabus' : r.source.kind === 'lecture' ? 'notes' : 'Halo');
export const askKey = (text: string): string => `ask:${text.trim().toLowerCase().slice(0, 80)}`;

/**
 * The one list. In order: what the assignment itself asks for (from Halo's description, read into the brief), the
 * steps of a big piece of work, what announcements and the syllabus added, and what to do before starting. Lines
 * that only restate the title, and rules that hold all term, stay out (rules have their own line); the steps of a big piece of work are a fold of their own, so the list stays short.
 */
export function todoLines(item: Item, tz: string): TodoLine[] {
  const out: TodoLine[] = [];
  const ticked = new Set(item.askDone ?? []);
  const seen = new Set<string>();
  const push = (l: TodoLine) => {
    const k = l.text.toLowerCase();
    if (seen.has(k)) return;
    seen.add(k);
    out.push(l);
  };
  // What it asks for: whole sentences (a ten-word cut left "…analysis of one of the three"), five at most.
  const asks = (item.brief?.asks?.length ? item.brief.asks : item.plan?.asks ? splitPrereq(item.plan.asks) : []).slice(0, 5);
  for (const a of asks) {
    const text = cleanLine(a).replace(/[.;]\s*$/, '').slice(0, 140);
    if (!text || restatesItem(text, item)) continue;
    push({ id: askKey(text), text, tag: 'Halo', done: ticked.has(askKey(text)), kind: 'ask' });
  }
  for (const r of item.requirements ?? []) {
    if (r.scope === 'rule' || r.scope === 'reference' || restatesItem(r.text, item)) continue;
    push({ id: r.id, text: shortLine(r.text), detail: detailFor(r, tz) || undefined, tag: tagOf(r), done: r.done, kind: 'req', post: r.source.kind === 'announcement' && r.source.id ? `#/inbox?a=${r.source.id}` : null });
  }
  for (const p of item.plan?.prerequisites ?? []) {
    if (p.itemId) continue;
    for (const text of splitPrereq(p.text)) {
      const line = shortLine(text);
      push({ id: askKey(line), text: line, tag: prereqTag(p.source), done: ticked.has(askKey(line)), kind: 'pre' });
    }
  }
  return out;
}
