import { dateOf, fmtDate } from '../../domain/dates';
import { isExtraStep } from '../../domain/extraStep';
import type { Course, Item, Requirement } from '../../domain/types';
import { exampleRank, inAssignment } from './story';

/**
 * What Max did in a student's free week (George, 2026-10-29): only real numbers from their own week, and only things
 * that are Max. Never a free thing (checking work off, being on time, having classes in one place). Every line with a
 * zero is left out; a week where Max did nothing countable says so plainly instead of showing zeros. Pure, so every
 * claim is tested (maxWeek.test.ts).
 *
 * What counts as caught, things the student would otherwise only have found by reading every announcement:
 * - a requirement an announcement added that the assignment itself does not say ("only in an announcement"), or an
 *   extra step (something to bring, a new thing to hand in: domain/extraStep.ts);
 * - a due date an announcement moved;
 * - an assignment that exists only because an announcement announced it.
 * Generic lines ("acknowledge this announcement", "read the chapter"), class rules and references are never counted.
 */

/** The server's counts for the week (my_trial_recap), every one of them Max. */
export interface MaxCounts {
  /** Announcements read for the student (the read ledger). */
  read: number;
  /** Halo synced on its own while the student was not on Halo: scheduled syncs that landed in a tab the extension opened. */
  autoSyncs: number;
  /** Reminders sent (morning, heavy day, not started, participation, a catch). */
  reminders: number;
  /** Sunday previews sent. */
  sundays: number;
  /** Practice sets and study plans built from their own class material. */
  practice: number;
}

export type CaughtKind = 'only' | 'step' | 'moved' | 'new';
export interface Caught {
  key: string;
  kind: CaughtKind;
  /** The class code ("BIO-181L"). */
  code: string;
  /** What it was, in a line ("Bring your own splash goggles", "Topic 3 Homework moved to Wed, Oct 28 (was Mon, Oct 26)"). */
  what: string;
  /** The assignment it was on, when that is not already in `what`. */
  on: string | null;
  score: number;
}

export interface MaxLine {
  key: string;
  n: number;
  before: string;
  after: string;
}

export interface MaxWeek {
  caught: Caught[];
  lines: MaxLine[];
  headline: string;
  /** Anything at all to show as Max's own work this week. */
  any: boolean;
}

/** Never worth a catch (George, 2026-10-10): true, but not something a student would have missed. */
const GENERIC = /\b(acknowledge|read(ing)? (the )?(topic|assigned|weekly|course)? ?(readings?|materials?|chapters?|announcement|syllabus)|review (the )?(syllabus|announcement|rubric)|check (the )?(syllabus|announcements?)|log ?in|participate|post (an )?introduction)\b/i;
const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

export function maxWeek(input: { items: Item[]; courses: Course[]; since: string; until: string; tz: string; counts: MaxCounts }): MaxWeek {
  const { items, courses, since, until, tz, counts } = input;
  const inWeek = (at: string | null | undefined) => !!at && at >= since && at <= until;
  const code = (i: Item) => courses.find((c) => c.id === i.courseId)?.code ?? '';
  const name = (i: Item) => (i.label || i.title).trim();
  const live = new Set(courses.map((c) => c.id));
  const day = (iso: string) => fmtDate(dateOf(iso, tz), 'long');
  const caught: Caught[] = [];

  for (const item of items) {
    if (!live.has(item.courseId)) continue;
    const pts = item.points ?? 0;
    for (const req of item.requirements ?? []) {
      if (req.source?.kind !== 'announcement' || !inWeek(req.addedAt)) continue;
      if (GENERIC.test(req.text) || req.scope === 'rule' || req.scope === 'reference') continue;
      const step = isExtraStep(req);
      if (!step && inAssignment(req, item)) continue;
      caught.push({ key: `req:${item.id}:${req.id}`, kind: step ? 'step' : 'only', code: code(item), what: clean(req), on: name(item), score: (req.dueAt ? 1000 : 0) + Math.min(500, pts * 5) + exampleRank(req) * 10 + (step ? 40 : 0) });
    }
    if (item.dateChange && inWeek(item.dateChange.at) && dateOf(item.dateChange.from, tz) !== dateOf(item.dueAt, tz)) {
      caught.push({ key: `moved:${item.id}`, kind: 'moved', code: code(item), what: `${name(item)} moved to ${day(item.dueAt)} (was ${day(item.dateChange.from)})`, on: null, score: 1200 + Math.min(500, pts * 5) });
    }
    if (item.origin?.kind === 'announcement' && inWeek(item.origin.at)) {
      caught.push({ key: `new:${item.id}`, kind: 'new', code: code(item), what: `${name(item)}, only announced${item.dueAt ? `, due ${day(item.dueAt)}` : ''}`, on: null, score: 1100 + Math.min(500, pts * 5) });
    }
  }
  caught.sort((a, b) => b.score - a.score || a.key.localeCompare(b.key));

  const moved = caught.filter((c) => c.kind === 'moved').length;
  const steps = caught.filter((c) => c.kind === 'step').length;
  const lines: MaxLine[] = [];
  const add = (key: string, n: number, before: string, after: string) => n > 0 && lines.push({ key, n, before, after });
  add('read', counts.read, '', ` ${plural(counts.read, 'announcement', 'announcements')} read for you`);
  add('moved', moved, '', ` ${plural(moved, 'due date', 'due dates')} that moved, put on the right assignment`);
  add('steps', steps, '', ` extra ${plural(steps, 'step', 'steps')} added to your assignments`);
  add('syncs', counts.autoSyncs, '', ` ${plural(counts.autoSyncs, 'time', 'times')} Halo synced on its own while you weren't on it`);
  add('reminders', counts.reminders, '', ` ${plural(counts.reminders, 'reminder', 'reminders')} sent`);
  add('sunday', counts.sundays, '', ` Sunday ${plural(counts.sundays, 'preview', 'previews')} of your week`);
  add('practice', counts.practice, '', ` practice ${plural(counts.practice, 'set', 'sets')} built from your classes`);

  const n = caught.length;
  const headline =
    n > 0
      ? `Max caught ${n} ${plural(n, 'thing', 'things')} this week you'd have missed.`
      : counts.read > 0
        ? `Max read ${counts.read} ${plural(counts.read, 'announcement', 'announcements')} for you this week.`
        : counts.autoSyncs > 0
          ? `Max kept Halo synced ${counts.autoSyncs} ${plural(counts.autoSyncs, 'time', 'times')} while you were away.`
          : counts.reminders > 0
            ? `Max sent you ${counts.reminders} ${plural(counts.reminders, 'reminder', 'reminders')} this week.`
            : 'Your free week is over. Everything you have stays.';
  return { caught, lines, headline, any: n > 0 || lines.length > 0 };
}

const clean = (req: Pick<Requirement, 'text'>) => req.text.trim().replace(/\.$/, '');
