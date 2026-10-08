import { dateOf } from './dates';
import { mergeRequirements } from './requirements';
import type { DateStr, Item, Requirement } from './types';

/**
 * Participation is its own graded item each week at GCU, and everything that earns it (acknowledging the week's
 * announcement, posting in the forum, replying to classmates, attending, in-class activities) belongs on that item's
 * checklist. It is never its own planner item: a separate "Acknowledge the announcement" row was the reader's most
 * common piece of junk.
 */
const PARTICIPATION =
  /\b(acknowledg\w*|reply(ing)?\b|respond(ing)? to (\w+ )?(classmates?|peers?|others|posts?)|classmates'? posts?|post (a |your )?(\w+ )?(in|to|on) (the )?(\w+ )?(forum|board|thread)|discussion forum|forum|introduce yourself|introduction post|attend\w*|be present|show up|in[- ]class\b|class activit\w*|during class|participat\w*)/i;
/** Real deliverables stay work even when the sentence mentions the forum or class. */
const DELIVERABLE = /\b(quiz|exam|test|midterm|final|essay|paper|lab report|report|project|worksheet|problem set|homework)\b/i;

/**
 * Participation as an item: Halo's PARTICIPATION type, or "participation" in its title (George, 2026-10-08: CHM-113
 * publishes each day's "Week 5, Day 1 Participation" as a 0-point DISCUSSION_QUESTION with a dropbox, so it synced
 * as a discussion and became Now's Late hero). The title only: an assignment whose instructions mention
 * participation is still work. It keeps its own type, so grades, the Cooked meter, pace and class progress count it
 * as before; only Now's hero, Then and the day's count leave it to the participation line.
 */
export const isParticipation = (i: Pick<Item, 'type' | 'title'>): boolean => i.type === 'participation' || /participation/i.test(i.title);

export function isParticipationWork(text: string): boolean {
  return PARTICIPATION.test(text) && !DELIVERABLE.test(text);
}

/** The class's participation item for the week a date falls in: the first one due on or after it, else the last. */
export function participationFor(items: Item[], courseId: string, ref: DateStr, tz: string): Item | null {
  const parts = items.filter((i) => i.courseId === courseId && i.type === 'participation').sort((a, b) => a.dueAt.localeCompare(b.dueAt));
  if (parts.length === 0) return null;
  return parts.find((p) => dateOf(p.dueAt, tz) >= ref) ?? parts[parts.length - 1];
}

export interface Fold {
  /** Participation items with the moved lines added. */
  upserts: Item[];
  /** The announcement-made items that were really participation. */
  deletedIds: string[];
  moved: { from: Item; to: Item }[];
}

/**
 * The one-time clean-up: every item an announcement created that is really participation becomes a line on that
 * week's participation item for its class (ticked if it was done), and the separate item goes. An item whose class
 * has no participation item stays where it is: nothing is ever lost.
 */
export function foldParticipation(items: Item[], tz: string, now: string): Fold {
  const out: Fold = { upserts: [], deletedIds: [], moved: [] };
  const edited = new Map<string, Item>();
  for (const i of items) {
    if (i.origin?.kind !== 'announcement' || i.type === 'participation') continue;
    if (!isParticipationWork(`${i.title} ${i.origin.quote ?? ''}`)) continue;
    const target = participationFor(items, i.courseId, dateOf(i.dueAt, tz), tz);
    if (!target) continue;
    const base = edited.get(target.id) ?? target;
    const line: Requirement = {
      id: `rq-fold-${i.id}`,
      text: i.title,
      detail: i.notes || undefined,
      dueAt: null,
      done: i.status === 'done',
      doneAt: i.status === 'done' ? (i.completedAt ?? now) : null,
      gradedOn: true,
      source: { kind: 'announcement', id: i.origin.id ?? null, title: i.origin.title ?? null, quote: i.origin.quote ?? null, at: i.origin.at ?? null },
      addedAt: now,
    };
    const carried = (i.requirements ?? []).map((r) => ({ ...r, dueAt: null }));
    edited.set(target.id, { ...base, requirements: mergeRequirements(base.requirements, [line, ...carried]), updatedAt: now });
    out.deletedIds.push(i.id);
    out.moved.push({ from: i, to: target });
  }
  out.upserts = [...edited.values()];
  return out;
}
