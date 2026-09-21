import { estimateMinutes } from '../domain/estimate';
import { newId } from '../domain/ids';
import { shortLabel } from '../domain/labels';
import { mergeNotes, mergeRequirements } from '../domain/requirements';
import type { Course, Item, ReqSource } from '../domain/types';
import type { Action } from './actions';
import { routeActions } from './actions';
import type { StoredAnnouncement } from './announce';

/**
 * Announcements read themselves on every sync. Professors post new assignments in them constantly, so anything that
 * waits for a button, or for the next sync's review screen, reaches the agenda late or not at all.
 *
 * What lands on its own: parts on work that already exists, class rules, new work, and date changes. What still
 * waits: removals and cancellations, because those are the ones that cost something when the model is wrong.
 */

/** How long an automatic date change keeps showing the date it moved from. */
export const DATE_CHANGE_VISIBLE_DAYS = 5;

/**
 * Posts to read: never read, or edited since they were last read. Professors change dates inside an announcement
 * that already exists, so the modified date is as much a trigger as a new id is.
 */
export function needsRead(list: StoredAnnouncement[], courseIds: Set<string>): StoredAnnouncement[] {
  return list
    .filter((a) => courseIds.has(a.courseId))
    .filter((a) => a.actionsAt == null || (a.modifiedAt ?? null) !== (a.actionsModifiedAt ?? null))
    .sort((a, b) => String(a.publishedAt ?? '').localeCompare(String(b.publishedAt ?? '')));
}

/** Why a post is being read, for the line on screen. */
export const readReason = (a: StoredAnnouncement): 'new' | 'edited' => (a.actionsAt == null ? 'new' : 'edited');

export interface AutoPlan {
  /** Items to write back: parts attached, dates moved, new work created. */
  upserts: Item[];
  /** Classes to write back, for rules and notes that belong to no one assignment. */
  courses: Course[];
  /** What was created, moved, or attached, for the line that says so. */
  added: Item[];
  moved: { item: Item; from: string; to: string }[];
  attached: number;
  noted: number;
  /** Removals and cancellations. These are returned, never applied. */
  needsApproval: { action: Action; announcement: StoredAnnouncement }[];
}

const asSource = (a: Action): ReqSource => a.source;

/** A new assignment that an announcement describes, as a planner row that says where it came from. */
export function itemFromAction(a: Action, course: Course, now: string): Item | null {
  // Without a date there is nothing to put on a calendar; it becomes a class note instead, upstream.
  if (!a.dueAt) return null;
  const title = a.text.replace(/\s*[.]$/, '').slice(0, 120);
  const type = /quiz/i.test(title) ? 'quiz' : /exam|midterm|final/i.test(title) ? 'exam' : /discussion|\bdq\b|reply/i.test(title) ? 'discussion' : /lab/i.test(title) ? 'lab' : /paper|essay|analysis/i.test(title) ? 'paper' : 'homework';
  const points = a.points ?? 0;
  return {
    id: newId(),
    courseId: course.id,
    title,
    label: shortLabel({ title, courseCode: course.code, type }),
    type,
    points,
    dueAt: a.dueAt,
    labelOverridden: false,
    opensAt: null,
    startByOverride: null,
    status: 'todo',
    completedAt: null,
    score: null,
    notes: '',
    topic: null,
    award: null,
    source: 'halo',
    estimatedMinutes: estimateMinutes({ title, type, points, courseCode: course.code }),
    estimateOverridden: false,
    flags: { inClass: false, group: false, lopesWrite: false, timed: false, practice: false },
    updatedAt: now,
    // The badge and the link back to the post that asked for it.
    origin: { kind: 'announcement', id: asSource(a).id, title: asSource(a).title, quote: asSource(a).quote, at: asSource(a).at },
  };
}

/**
 * Turns one post's findings into changes. Nothing here writes; the caller applies the plan, so the same logic is
 * testable without a store and the split between automatic and approved stays in one place.
 */
export function planFromActions(args: { actions: Action[]; announcement: StoredAnnouncement; course: Course; items: Item[]; courses: Course[]; now: string }): AutoPlan {
  const { actions, announcement, course, items, now } = args;
  const plan: AutoPlan = { upserts: [], courses: [], added: [], moved: [], attached: 0, noted: 0, needsApproval: [] };
  const routed = routeActions(actions, course.id, now);
  const byId = new Map(items.map((i) => [i.id, i]));
  const edited = new Map<string, Item>();
  const take = (id: string) => edited.get(id) ?? byId.get(id);

  // Parts on work that already exists: immediate, the same as a rubric or a feedback comment.
  for (const { itemId, req } of routed.requirements) {
    const item = take(itemId);
    if (!item) continue;
    const merged = mergeRequirements(item.requirements, [req]);
    plan.attached += merged.length - (item.requirements?.length ?? 0);
    edited.set(itemId, { ...item, requirements: merged, updatedAt: now });
  }

  // Class-level findings, including everything that fitted no category.
  if (routed.notes.length) {
    const merged = mergeNotes(course.notes, routed.notes.map((n) => n.note));
    plan.noted += merged.length - (course.notes?.length ?? 0);
    if (plan.noted > 0) plan.courses.push({ ...course, notes: merged });
  }

  for (const action of routed.changes) {
    if (action.kind === 'new_work') {
      const created = itemFromAction(action, course, now);
      // A post describing work with no date cannot be scheduled; it is kept as a class note rather than dropped.
      if (!created) {
        const merged = mergeNotes(plan.courses[0]?.notes ?? course.notes, [{ id: newId(), text: action.text, source: asSource(action), addedAt: now, seenAt: null }]);
        plan.noted += 1;
        plan.courses = [{ ...course, notes: merged }];
        continue;
      }
      // Something with this title and date already there: the post is repeating itself, not adding work.
      const dup = [...items, ...plan.added].some((i) => i.courseId === course.id && i.title.toLowerCase() === created.title.toLowerCase());
      if (dup) continue;
      plan.added.push(created);
      continue;
    }

    if (action.kind === 'date_change' && action.itemId && action.dueAt) {
      const item = take(action.itemId);
      if (!item || item.dueAt === action.dueAt) continue;
      plan.moved.push({ item, from: item.dueAt, to: action.dueAt });
      edited.set(action.itemId, { ...item, dueAt: action.dueAt, dateChange: { from: item.dueAt, at: now, source: asSource(action) }, updatedAt: now } as Item);
      continue;
    }

    if (action.kind === 'points_change' && action.itemId && action.points !== null) {
      const item = take(action.itemId);
      if (!item || item.points === action.points) continue;
      edited.set(action.itemId, { ...item, points: action.points, updatedAt: now });
      continue;
    }

    // Anything that takes work away is the expensive mistake. It waits.
    plan.needsApproval.push({ action, announcement });
  }

  plan.upserts = [...edited.values(), ...plan.added];
  return plan;
}

const n = (v: number, one: string, many: string) => `${v} ${v === 1 ? one : many}`;

/** What the automatic pass did, in one sentence, or null when it did nothing. */
export function autoLine(plan: { added: Item[]; moved: unknown[]; attached: number; noted: number; needsApproval: unknown[] }): string | null {
  const parts: string[] = [];
  if (plan.added.length) parts.push(`${n(plan.added.length, 'new assignment', 'new assignments')} added`);
  if (plan.moved.length) parts.push(`${n(plan.moved.length, 'date', 'dates')} moved`);
  if (plan.attached) parts.push(`${n(plan.attached, 'requirement', 'requirements')} attached`);
  if (plan.noted) parts.push(n(plan.noted, 'class note', 'class notes'));
  if (parts.length === 0 && plan.needsApproval.length === 0) return null;
  const head = parts.length ? `From your announcements: ${parts.join(', ')}.` : '';
  const tail = plan.needsApproval.length ? ` ${n(plan.needsApproval.length, 'removal', 'removals')} needs your approval below.` : '';
  return `${head}${tail}`.trim();
}
