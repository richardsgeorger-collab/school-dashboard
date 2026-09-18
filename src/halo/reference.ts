import type { AppData, Course } from '../domain/types';
import type { HaloDiff, HaloItemFact } from './diff';
import type { HaloPlan } from './apply';

/**
 * The half of a sync that has nothing to approve. Announcements, rubrics, instructor feedback, quiz attempts, class
 * resources and the grade scale are things Halo asserts about work that already exists; there is no version of them
 * the student gets to disagree with, and a diff screen has no question to ask about them.
 *
 * They used to ride along with the assignment diff's apply button, which meant a sync whose assignment list happened
 * to be unchanged offered "Nothing to apply" and threw the rest away on Cancel. They are saved on arrival now.
 *
 * Only what attaches to something already in the planner is included. A fact for an item the student has not accepted
 * yet would be a dangling reference, and creating that item is a change, which is exactly what needs approving.
 */
export function referencePlan(diff: HaloDiff, data: AppData): HaloPlan {
  const items = new Set(data.items.map((i) => i.id));
  const facts: HaloItemFact[] = diff.facts.filter((f) => items.has(f.id));
  // Linked courses carry this pull's class facts. Created ones are new classes, which the student approves.
  const courses: Course[] = diff.courses.linked;
  return { courses, upserts: [], deletes: [], complete: [], scores: [], facts };
}

export interface ReferenceCounts {
  /** Items that gained a rubric, feedback, a quiz attempt, or a submission status. */
  facts: number;
  /** Classes whose grade scale, holidays or participation policy were refreshed. */
  classes: number;
  announcements: number;
  /** Announcements that were not already on file. */
  fresh: number;
  messages: number;
  resources: number;
  alerts: number;
}

export const referenceTotal = (c: ReferenceCounts): number => c.facts + c.classes + c.announcements + c.messages + c.resources + c.alerts;

const n = (v: number, one: string, many: string) => `${v} ${v === 1 ? one : many}`;

/** What was kept without asking, said plainly, so a screen with no changes still accounts for the sync. */
export function referenceLine(c: ReferenceCounts): string | null {
  const parts: string[] = [];
  if (c.announcements > 0) parts.push(`${n(c.announcements, 'announcement', 'announcements')}${c.fresh > 0 ? ` (${c.fresh} new)` : ''}`);
  if (c.facts > 0) parts.push(`rubrics, feedback and quiz results on ${n(c.facts, 'assignment', 'assignments')}`);
  if (c.classes > 0) parts.push(`class facts for ${n(c.classes, 'class', 'classes')}`);
  if (c.resources > 0) parts.push(n(c.resources, 'class resource', 'class resources'));
  if (c.messages > 0) parts.push(n(c.messages, 'message', 'messages'));
  if (c.alerts > 0) parts.push(n(c.alerts, 'alert', 'alerts'));
  if (parts.length === 0) return null;
  const list = parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}`;
  return `Saved already, nothing to approve: ${list}.`;
}
