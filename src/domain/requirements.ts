import { dateOf, diffDays } from './dates';
import type { ClassNote, Course, DateStr, Item, ReqSource, Requirement } from './types';

/**
 * Assignments have parts. A professor posts an announcement saying to reply to two classmates, or to bring a printed
 * copy, or to use the template, and none of it is in the assignment. Each part carries its own deadline and its own
 * done state, and the assignment is not finished until every graded one is.
 */

/** Same requirement said twice. Re-reading an announcement must not double the checklist. */
const same = (a: Requirement, b: { text: string; source: ReqSource }) =>
  a.text.trim().toLowerCase() === b.text.trim().toLowerCase() || (!!a.source.quote && a.source.quote === b.source.quote && a.source.id === b.source.id);

/** Adds what is new and leaves what is there, so a re-read never loses a tick or duplicates a part. */
export function mergeRequirements(existing: Requirement[] | undefined, incoming: Requirement[]): Requirement[] {
  const out = [...(existing ?? [])];
  for (const r of incoming) {
    const hit = out.findIndex((x) => same(x, r));
    if (hit < 0) {
      out.push(r);
      continue;
    }
    // A later post can move a part's date or sharpen its wording; the student's tick survives both.
    out[hit] = { ...out[hit], text: r.text || out[hit].text, dueAt: r.dueAt ?? out[hit].dueAt, gradedOn: out[hit].gradedOn || r.gradedOn, redefinesDone: out[hit].redefinesDone || r.redefinesDone, source: out[hit].source.quote ? out[hit].source : r.source };
  }
  return out;
}

export const openRequirements = (i: Item): Requirement[] => (i.requirements ?? []).filter((r) => !r.done);
export const gradedOpen = (i: Item): Requirement[] => openRequirements(i).filter((r) => r.gradedOn);

/** The assignment is not complete while a graded part is open, whatever its own status says. */
export const itemFinished = (i: Item): boolean => i.status === 'done' && gradedOpen(i).length === 0;

/** "2 of 3 parts done", or null when there are no parts. */
export function partsLine(i: Item): string | null {
  const all = i.requirements ?? [];
  if (all.length === 0) return null;
  const done = all.filter((r) => r.done).length;
  return `${done} of ${all.length} part${all.length === 1 ? '' : 's'} done`;
}

export interface RequirementRow {
  item: Item;
  req: Requirement;
  /** The day it is due: its own when it has one, else the assignment's. */
  when: DateStr;
  /** It has a deadline of its own, earlier or later than the assignment's. */
  ownDate: boolean;
  fromAnnouncement: boolean;
}

/**
 * Parts that need doing, as rows the calendar and Now can show like anything else. A part with its own deadline is
 * its own thing on the calendar; a part without one rides the assignment's date.
 */
export function requirementRows(items: Item[], tz: string, opts: { from?: DateStr; to?: DateStr } = {}): RequirementRow[] {
  const out: RequirementRow[] = [];
  for (const item of items) {
    for (const req of openRequirements(item)) {
      const when = dateOf(req.dueAt ?? item.dueAt, tz);
      if (opts.from && when < opts.from) continue;
      if (opts.to && when > opts.to) continue;
      out.push({ item, req, when, ownDate: !!req.dueAt && dateOf(req.dueAt, tz) !== dateOf(item.dueAt, tz), fromAnnouncement: req.source.kind === 'announcement' });
    }
  }
  return out.sort((a, b) => a.when.localeCompare(b.when) || a.item.title.localeCompare(b.item.title));
}

/**
 * The one thing on Now that would otherwise be missed: a graded part, from an announcement, that the assignment
 * itself does not mention. Soonest first, and only inside the window where it still matters.
 */
export function missedRequirement(items: Item[], today: DateStr, tz: string, withinDays = 7): RequirementRow | null {
  return (
    requirementRows(items, tz, { to: undefined })
      // A class rule is true all term. Announcing it as something due today is the mistake this whole pass exists
      // to avoid, so only concrete instances qualify.
      .filter((r) => r.fromAnnouncement && r.req.gradedOn && r.item.status !== 'done' && (r.req.scope ?? 'instance') === 'instance')
      .filter((r) => diffDays(today, r.when) <= withinDays)
      .sort((a, b) => a.when.localeCompare(b.when))[0] ?? null
  );
}

/** What that line says, naming the source, because the point is that the assignment does not say it. */
export function missedLine(row: RequirementRow, courses: Course[], today: DateStr): string {
  const code = courses.find((c) => c.id === row.item.courseId)?.code ?? '';
  const days = diffDays(today, row.when);
  const when = days <= 0 ? 'today' : days === 1 ? 'tomorrow' : `in ${days} days`;
  const said = row.req.text.replace(/\s*[.!]$/, '');
  const posts = row.req.sources?.length ?? 0;
  const where = row.req.source.title ? ` in "${row.req.source.title}"${posts > 1 ? ` and ${posts - 1} other post${posts - 1 === 1 ? '' : 's'}` : ''}` : '';
  return `${code} ${row.item.title}: ${said}. Due ${when}, and the assignment does not mention it. Your instructor posted it${where}.`;
}

/**
 * Participation is noise when it is attendance and real work when something says what earns the points. It was
 * stripped out wholesale before, which lost the cases where an announcement or the syllabus defines them.
 */
export const participationExplained = (i: Item): boolean => (i.requirements?.length ?? 0) > 0 || !!i.plan?.asks?.trim() || (i.brief?.asks?.length ?? 0) > 0;

/** True for an item that should stay out of the way: attendance with nothing said about what earns it. */
export const isNoise = (i: Item): boolean => i.type === 'participation' && !participationExplained(i);

/** Class-level findings worth showing, newest first. */
export const openNotes = (c: Course): ClassNote[] => (c.notes ?? []).filter((n) => !n.seenAt).sort((a, b) => String(b.addedAt).localeCompare(String(a.addedAt)));

export function mergeNotes(existing: ClassNote[] | undefined, incoming: ClassNote[]): ClassNote[] {
  const out = [...(existing ?? [])];
  for (const n of incoming) {
    if (out.some((x) => x.text.trim().toLowerCase() === n.text.trim().toLowerCase() || (!!x.source.quote && x.source.quote === n.source.quote))) continue;
    out.push(n);
  }
  return out;
}
