import { dateOf, fmtDate } from '../domain/dates';
import type { Course, Item } from '../domain/types';
import { isGating, matchScore, saysSubmitted, type Proposal } from '../record/match';
import type { Mention } from '../record/notes';
import type { ClassOutcome } from './audit';

/** Where a finding goes: applied without a word, shown as one line that needs a person, or details only. */
export type Lane = 'auto' | 'needs' | 'info';

export interface Judged {
  m: Mention;
  course: Course;
  proposal: Proposal;
  match: Item | null;
  lane: Lane;
  /** Why it needs a person, in a word, for grouping. */
  why: 'gating' | 'late' | 'overdue' | 'removal' | 'started' | 'schedule' | 'low' | 'coverage' | null;
  /** Part of a whole-class import: never a row of its own. */
  bulk: boolean;
}

const UNAMBIGUOUS = 0.8;

/**
 * The rules. Safe on its own: posted grades, new items with nothing to conflict with, and date changes on an
 * unambiguous match the student has not started. Everything that could cost a grade waits for a person.
 */
export function judge(m: Mention, course: Course, proposal: Proposal, match: Item | null, outcome: ClassOutcome | undefined, bulkIds: Set<string>): Judged {
  const base = { m, course, proposal, match, bulk: bulkIds.has(m.id) };
  const classIncomplete = !outcome || !outcome.reached || !outcome.outcome || !outcome.outcome.coverageComplete || outcome.outcome.missingRows;
  if (m.audit?.status === 'note') return { ...base, lane: 'info', why: null };
  if (m.audit?.status === 'schedule') return { ...base, lane: 'needs', why: 'schedule' };
  // A posted grade is a grade even on something that gates other work.
  if (isGating(m) && proposal.kind !== 'score') return { ...base, lane: 'needs', why: 'gating' };
  if (proposal.kind === 'flag') return { ...base, lane: 'needs', why: 'late' };
  // Halo's late flag on something already handed in is a flag to read, not an overdue item to do.
  if (m.audit?.status === 'overdue') return { ...base, lane: 'needs', why: saysSubmitted(m) ? 'late' : 'overdue' };
  if (proposal.kind === 'remove') return { ...base, lane: 'needs', why: 'removal' };
  if (proposal.kind === 'confirm' || proposal.kind === 'none') return { ...base, lane: 'info', why: null };
  if (m.confidence === 'low') return { ...base, lane: 'needs', why: 'low' };
  if (classIncomplete) return { ...base, lane: 'needs', why: 'coverage' };
  if (proposal.kind === 'score') return { ...base, lane: 'auto', why: null };
  if (proposal.kind === 'add') return { ...base, lane: bulkIds.has(m.id) || !match ? 'auto' : 'needs', why: bulkIds.has(m.id) || !match ? null : 'low' };
  if (proposal.kind === 'update') {
    if (match && match.status === 'todo' && matchScore(m, match) >= UNAMBIGUOUS) return { ...base, lane: 'auto', why: null };
    return { ...base, lane: 'needs', why: match && match.status !== 'todo' ? 'started' : 'low' };
  }
  return { ...base, lane: 'info', why: null };
}

export interface NeedLine {
  id: string;
  text: string;
  /** Finding ids behind the line. */
  ids: string[];
  /** What "Do it" does, or nothing to do beyond reading it. */
  action: 'add' | 'move' | 'remove' | 'note' | 'none';
}

const day = (iso: string, tz: string) => fmtDate(dateOf(iso, tz), 'short');
const list = (xs: string[]) => (xs.length <= 1 ? xs.join('') : xs.length === 2 ? `${xs[0]} and ${xs[1]}` : `${xs.slice(0, -1).join(', ')}, and ${xs.at(-1)}`);
const count = (n: number) => ['zero', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine'][n] ?? String(n);

/** The lines a person reads: grouped by class and reason, plain words, full course codes. */
export function needLines(judged: Judged[], items: Item[], tz: string): NeedLine[] {
  const needs = judged.filter((j) => j.lane === 'needs');
  const out: NeedLine[] = [];
  const used = new Set<string>();
  const label = (j: Judged) => j.match?.label ?? j.m.title;
  // A whole-class import that could not apply on its own is still one line and one button.
  const bulkByClass = new Map<string, Judged[]>();
  for (const j of needs) if (j.bulk && j.proposal.kind === 'add') bulkByClass.set(j.course.id, [...(bulkByClass.get(j.course.id) ?? []), j]);
  for (const group of bulkByClass.values()) {
    const c = group[0].course;
    const held = group.some((j) => j.why === 'coverage');
    out.push({ id: `n${out.length + 1}`, ids: group.map((j) => j.m.id), action: 'add', text: `${c.code} isn't in your planner yet — ${group.length} item${group.length === 1 ? '' : 's'} to add${held ? ' (held back because its coverage came back short)' : ''}.` });
    for (const j of group) used.add(j.m.id);
  }
  // Other changes held back by a short class group per class too.
  const heldByClass = new Map<string, Judged[]>();
  for (const j of needs) if (!used.has(j.m.id) && j.why === 'coverage' && (j.proposal.kind === 'update' || j.proposal.kind === 'add' || j.proposal.kind === 'score')) heldByClass.set(j.course.id, [...(heldByClass.get(j.course.id) ?? []), j]);
  for (const group of heldByClass.values()) {
    if (group.length < 2) continue;
    const c = group[0].course;
    out.push({ id: `n${out.length + 1}`, ids: group.map((j) => j.m.id), action: 'add', text: `${c.code}: ${group.length} changes held back because its coverage came back short — apply them anyway?` });
    for (const j of group) used.add(j.m.id);
  }
  // Late flags and overdue rows group per class.
  for (const why of ['late', 'overdue'] as const) {
    const byClass = new Map<string, Judged[]>();
    for (const j of needs) if (j.why === why) byClass.set(j.course.id, [...(byClass.get(j.course.id) ?? []), j]);
    for (const group of byClass.values()) {
      const c = group[0].course;
      const zero = group.every((j) => j.m.points === 0);
      const submitted = group.every((j) => saysSubmitted(j.m));
      if (group.length === 1) {
        const j = group[0];
        out.push({ id: `n${out.length + 1}`, ids: [j.m.id], action: j.proposal.kind === 'flag' ? 'note' : 'none', text: why === 'late' ? `${c.code} ${label(j)} is flagged late in Halo${submitted ? ' even though it was submitted' : ''}${j.m.points === 0 ? ', 0 pts' : ''}.` : `${c.code} ${j.m.title} is overdue and unsubmitted${j.m.date ? ` (due ${fmtDate(j.m.date, 'short')})` : ''}.` });
      } else {
        out.push({ id: `n${out.length + 1}`, ids: group.map((j) => j.m.id), action: group.some((j) => j.proposal.kind === 'flag') ? 'note' : 'none', text: why === 'late' ? `${count(group.length)} ${c.code} items flagged late in Halo${submitted ? ' even though they were submitted' : ''}${zero ? ', all at 0 pts' : ''}: ${list(group.map(label))}.` : `${count(group.length)} ${c.code} items are overdue and unsubmitted: ${list(group.map((j) => j.m.title))}.` });
      }
      for (const j of group) used.add(j.m.id);
    }
  }
  for (const j of needs) {
    if (used.has(j.m.id)) continue;
    used.add(j.m.id);
    const c = j.course;
    const p = j.proposal;
    let text: string;
    let action: NeedLine['action'] = 'none';
    if (j.why === 'gating' && p.kind === 'add') {
      const gated = (j.m.gates ?? []).map((g) => g.replace(/^(the )?/i, '')).join(' and ');
      text = `${c.code} ${p.item.title} due ${day(p.item.dueAt, tz)} — gates ${gated || 'later work'}.`;
      action = 'add';
    } else if (j.why === 'gating') {
      text = `${c.code} ${j.m.title}${j.m.date ? ` due ${fmtDate(j.m.date, 'short')}` : ''} — gates ${(j.m.gates ?? []).join(' and ') || 'later work'}. ${p.kind === 'confirm' || p.kind === 'none' ? p.text : ''}`.trim();
      action = p.kind === 'update' ? 'move' : 'none';
    } else if (j.why === 'schedule') {
      text = `${c.code}: ${j.m.note || j.m.title}`;
    } else if (j.why === 'removal' && p.kind === 'remove') {
      text = `${c.code} ${p.item.label} is no longer in Halo. Remove it?`;
      action = 'remove';
    } else if (j.why === 'started' && p.kind === 'update') {
      text = `${c.code} ${p.item.label} moved to ${day(p.dueAt, tz)} in Halo, but you've ${p.item.status === 'done' ? 'marked it done' : 'started it'} here. Move it?`;
      action = 'move';
    } else if (j.why === 'coverage') {
      text = `${c.code} ${j.m.title}: ${p.kind === 'update' ? `moved to ${day(p.dueAt, tz)}` : p.kind === 'add' ? `new, due ${day(p.item.dueAt, tz)}` : p.kind === 'score' ? `graded ${p.score} of ${p.item.points}` : ''} — not applied because this class's coverage came back incomplete.`;
      action = p.kind === 'update' ? 'move' : p.kind === 'add' ? 'add' : p.kind === 'score' ? 'note' : 'none';
    } else if (p.kind === 'update') {
      text = `${c.code} ${j.m.title} may be ${p.item.label}, moved to ${day(p.dueAt, tz)} in Halo. Not sure it's the same item.`;
      action = 'move';
    } else if (p.kind === 'add') {
      text = `${c.code} ${p.item.title}, due ${day(p.item.dueAt, tz)}, looks close to ${j.match?.label ?? 'something you have'}. Add it anyway?`;
      action = 'add';
    } else if (p.kind === 'score') {
      text = `${c.code} ${p.item.label}: ${p.score} of ${p.item.points}, but I'm not sure of the match.`;
      action = 'note';
    } else {
      text = `${c.code} ${j.m.title}: ${p.kind === 'none' || p.kind === 'confirm' ? p.text : j.m.quote}`;
    }
    out.push({ id: `n${out.length + 1}`, ids: [j.m.id], action, text });
  }
  void items;
  return out;
}
