import { dateOf, fmtDate, fmtTime } from '../domain/dates';
import type { DateStr, Item } from '../domain/types';
import { matchMention, type Proposal } from './match';
import type { Mention } from './notes';

/** The slice of the store a proposal needs. */
export interface ApplyActions {
  upsertItem(item: Item): void;
  deleteItem(id: string): void;
  applyScore(id: string, score: number, source: 'halo' | 'manual'): void;
}

/** What approving a proposal does, in words. */
export function describeProposal(p: Proposal, tz: string, dueAt?: string, gates: string[] = []): string {
  const when = (iso: string) => `${fmtDate(dateOf(iso, tz), 'short')} ${fmtTime(iso, tz)}`;
  const unlocks = gates.length ? ` (it unlocks ${gates.join(' and ')})` : '';
  switch (p.kind) {
    case 'update':
      return `Move ${p.item.label} from ${when(p.item.dueAt)} to ${when(dueAt ?? p.dueAt)}`;
    case 'add':
      return `Add ${p.item.title} to the planner, due ${when(dueAt ?? p.item.dueAt)}${unlocks}`;
    case 'remove':
      return `Remove ${p.item.label} from the planner (Halo no longer lists it)`;
    case 'score':
      return `Record ${p.item.label} as graded at ${p.score} of ${p.item.points}`;
    case 'flag':
      return `${p.text} Nothing changes here on its own.`;
    default:
      return p.text;
  }
}

/** The planner items a finding says this one gates, matched by title within the class. */
export function gatedIds(m: Mention, courseId: string, items: Item[]): string[] {
  const out: string[] = [];
  for (const title of m.gates ?? []) {
    const hit = matchMention({ ...m, title, kind: 'info', itemId: null, gates: [], note: '', audit: undefined }, items, courseId);
    if (hit && !out.includes(hit.id)) out.push(hit.id);
  }
  return out;
}

/** Apply one proposal to the planner and say what happened. Dry runs only describe. */
export function applyProposal(p: Proposal, m: Mention, actions: ApplyActions, tz: string, lectureDate: DateStr, dryRun: boolean, edits: { dueAt?: string; title?: string; points?: number } = {}, items: Item[] = []): string {
  const when = (iso: string) => `${fmtDate(dateOf(iso, tz), 'short')} ${fmtTime(iso, tz)}`;
  const gates = (courseId: string, prev: string[] = []) => {
    const ids = gatedIds(m, courseId, items);
    return ids.length ? [...new Set([...prev, ...ids])] : prev;
  };
  if (p.kind === 'update') {
    const dueAt = edits.dueAt ?? p.dueAt;
    const blocks = gates(p.item.courseId, p.item.blocks ?? []);
    if (!dryRun) actions.upsertItem({ ...p.item, dueAt, blocks: blocks.length ? blocks : p.item.blocks, notes: `${p.item.notes ? `${p.item.notes}\n` : ''}Moved per the ${lectureDate} lecture: "${m.quote}"` });
    return `${p.item.label} now due ${when(dueAt)}${blocks.length ? `, gating ${blocks.length} item${blocks.length === 1 ? '' : 's'}` : ''}`;
  }
  if (p.kind === 'add') {
    const blocks = gates(p.item.courseId);
    const item = { ...p.item, title: (edits.title ?? p.item.title).trim() || p.item.title, points: edits.points ?? p.item.points, dueAt: edits.dueAt ?? p.item.dueAt, ...(blocks.length ? { blocks } : {}) };
    if (!dryRun) actions.upsertItem(item);
    return `Added ${item.title}, due ${when(item.dueAt)}${blocks.length ? `, gating ${blocks.length} item${blocks.length === 1 ? '' : 's'}` : ''}`;
  }
  if (p.kind === 'flag') {
    if (!dryRun) actions.upsertItem({ ...p.item, haloLate: m.note || m.quote });
    return `Noted: Halo says ${p.item.label} is late. Check it in Halo.`;
  }
  if (p.kind === 'remove') {
    if (!dryRun) actions.deleteItem(p.item.id);
    return `Removed ${p.item.label}`;
  }
  if (p.kind === 'score') {
    if (!dryRun) actions.applyScore(p.item.id, p.score, 'halo');
    return `${p.item.label}: ${p.score} of ${p.item.points}`;
  }
  return 'Noted';
}
