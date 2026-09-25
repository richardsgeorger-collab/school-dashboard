import { callTool, type ToolSpec } from '../ai/client';
import { dateOf, fmtDate, makeIso } from '../domain/dates';
import type { ClassNote, Course, DateStr, Item, ReqSource, Requirement } from '../domain/types';
import type { StoredAnnouncement } from './announce';

/**
 * What one announcement actually asks of the student. At GCU the assignment description is written once, at the start
 * of term, and the professor then runs the class from announcements: extra steps, replies to classmates, templates,
 * what to bring, what the exam covers, what full credit now means. None of it reaches the gradebook, and all of it is
 * graded. This reads for anything actionable rather than for a list of categories.
 */

export type ActionKind = 'requirement' | 'new_work' | 'date_change' | 'points_change' | 'note';

export interface Action {
  kind: ActionKind;
  /** The planner item it attaches to, when it is about one. */
  itemId: string | null;
  /** What the student has to do, in the imperative. */
  text: string;
  dueAt: string | null;
  points: number | null;
  /** Full credit depends on it. */
  gradedOn: boolean;
  /** It changes what counts as finished on work that already exists. */
  redefinesDone: boolean;
  confidence: 'high' | 'medium' | 'low';
  source: ReqSource;
}

export const ACTIONS_TOOL: ToolSpec = {
  name: 'announcement_actions',
  description: 'Everything in one announcement that changes what a student has to do, or what full credit requires.',
  input_schema: {
    type: 'object',
    additionalProperties: false,
    required: ['summary', 'actions'],
    properties: {
      summary: { type: 'string', description: 'One or two plain sentences: what this post asks of the student. Not a restatement of the post.' },
      actions: {
        type: 'array',
        description: 'One entry per thing the student has to do or know. Empty only when the post genuinely asks nothing.',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['kind', 'applies_to', 'what', 'due', 'time', 'points', 'graded', 'changes_what_done_means', 'quote', 'confidence'],
          properties: {
            kind: {
              type: 'string',
              description:
                'requirement: a step or rule attached to work already in the planner list. new_work: something to do that is not in the list at all. date_change: existing work moves. points_change: its value changes. note: anything else worth knowing, including anything that fits none of these. Never drop a finding because it has no category; use note.',
            },
            applies_to: { type: 'string', description: 'The planner item id from the list, when it is about one of them. Empty for anything that belongs to the class rather than one assignment.' },
            what: { type: 'string', description: 'What the student has to do, in the imperative, specific enough to act on without reading the post again. Not a summary of the post.' },
            due: { type: 'string', description: 'YYYY-MM-DD when the post gives a date, resolved against the date it was posted. Empty when it does not. Never invent one.' },
            time: { type: 'string', description: 'HH:mm 24-hour when stated, else empty.' },
            points: { type: 'integer', description: 'Points when the post states them, else 0.' },
            graded: { type: 'boolean', description: 'True when marks depend on this. Most instructions in an announcement are graded even when the post does not say so. False only for genuinely optional or informational things.' },
            changes_what_done_means: { type: 'boolean', description: 'True when this changes what full credit requires on work the student already has, rather than adding a separate step.' },
            quote: { type: 'string', description: 'The post’s own words, verbatim, that say this. Required. Without it the finding is dropped.' },
            confidence: { type: 'string', description: 'high, medium, or low.' },
          },
        },
      },
    },
  },
};

export const ACTIONS_SYSTEM = `You read one announcement from a college class and extract everything the student has to act on.

At this university the assignment description is written before the term starts and the professor runs the class from announcements. A requirement posted here is graded even though the assignment says nothing about it. Students lose marks for exactly this. Assume anything the professor asks for is graded unless the post says otherwise.

What counts:
- Anything that adds a step to work the student already has, however small: reply to classmates, bring a printed copy, use the template, name the file a certain way, post by a certain day, cite a particular source, submit somewhere else as well.
- Anything that changes what full credit means on existing work.
- Anything to do that is not in their list at all.
- Dates that move, values that change, work that is cancelled.
- What an exam covers, what to prepare, what to bring, what to read first.
- Anything actionable that fits none of the above. Use note. A finding you cannot categorise is still a finding, and dropping it is the one unrecoverable mistake here.

Rules:
- Quote the post's own words for every entry. No quote, no entry.
- "what" is an instruction the student can follow without opening the post again. Write "Reply to two classmates' posts by Sunday", not "The professor discussed participation".
- Resolve "Friday", "next week", "by the end of the week" against the posting date, which is given. If a date cannot be resolved, leave it empty and say so in "what". Never invent one.
- Set applies_to when the post is about one of the listed planner items. Match on what the post is talking about, not on a word appearing in both.
- Pure news with nothing to act on, an office-hours move, a welcome, encouragement, produces a summary and no actions. That is a valid answer, but read carefully first: a single clause in a friendly post is often the only place a requirement appears.
- Plain words. Say what to do.

Procedure, every time:
1. Read the whole post once. Then go sentence by sentence and mark every sentence that tells students to do, bring, submit, read, reply, or prepare something, or that changes a date, a value, or what counts.
2. For each marked sentence decide the kind: requirement (adds to work they have), new_work (not in their list), date_change, points_change, or note (actionable, fits nothing else).
3. Resolve every relative date against the posting date. Write dates as YYYY-MM-DD.
4. Copy the sentence as the quote, word for word. Then write "what" as a plain instruction.
5. Only then write the summary: one sentence on what the post is about.

Example. Post dated 2026-09-28 (a Monday) in CHM-113, planner has "Lab 3: Titration" (id i-lab3, due 2026-10-02):
"Lab 3 will now be due Friday October 9 instead of the 2nd. Also, from this week bring your own splash goggles to lab. No goggles, no points."
Actions:
- kind date_change, applies_to i-lab3, what "Lab 3 is now due Friday, October 9", due 2026-10-09, quote "Lab 3 will now be due Friday October 9 instead of the 2nd."
- kind requirement, applies_to i-lab3, what "Bring your own splash goggles to every lab; no goggles, no points", graded true, quote "from this week bring your own splash goggles to lab. No goggles, no points."
Summary: "Lab 3 moved to October 9; goggles are now required in lab."

Answer only through the announcement_actions tool.`;

const obj = (x: unknown): Record<string, unknown> => (x && typeof x === 'object' && !Array.isArray(x) ? (x as Record<string, unknown>) : {});
const arr = (x: unknown): unknown[] => (Array.isArray(x) ? x : []);
const str = (x: unknown, max: number): string => (typeof x === 'string' ? x.trim().slice(0, max) : '');
const KINDS: ActionKind[] = ['requirement', 'new_work', 'date_change', 'points_change', 'note'];

/** The instant a date and time mean, or null. A bare date lands at 23:59 local, the way Halo's own deadlines do. */
function when(date: string, time: string, tz: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  // makeIso gives the wall clock with its offset; the planner stores instants, so normalise.
  return new Date(makeIso(date as DateStr, /^([01]\d|2[0-3]):[0-5]\d$/.test(time) ? time : '23:59', tz)).toISOString();
}

export function actionsFromTool(raw: unknown, a: StoredAnnouncement, items: Item[], tz: string): { summary: string; actions: Action[] } {
  const o = obj(raw);
  // Only work in the announcement's own class. A rule or a part posted in one class belongs to that class and
  // nowhere else, whatever another class's items are called.
  const ids = new Set(items.filter((i) => i.courseId === a.courseId).map((i) => i.id));
  const source: ReqSource = { kind: 'announcement', id: a.id, title: a.title || null, quote: null, at: a.publishedAt ?? null };
  const out: Action[] = [];
  for (const e of arr(o.actions)) {
    const x = obj(e);
    const quote = str(x.quote, 600);
    const text = str(x.what, 400);
    // The quote is the whole guarantee that this came from the professor and not from the model.
    if (!quote || !text) continue;
    const kind = str(x.kind, 20) as ActionKind;
    const itemId = str(x.applies_to, 60);
    const conf = str(x.confidence, 10);
    const pts = typeof x.points === 'number' && Number.isFinite(x.points) ? Math.round(x.points) : 0;
    out.push({
      kind: KINDS.includes(kind) ? kind : 'note',
      itemId: ids.has(itemId) ? itemId : null,
      text,
      dueAt: when(str(x.due, 10), str(x.time, 5), tz),
      points: pts > 0 ? pts : null,
      gradedOn: x.graded !== false,
      redefinesDone: x.changes_what_done_means === true,
      confidence: conf === 'high' || conf === 'medium' ? conf : 'low',
      source: { ...source, quote },
    });
  }
  return { summary: str(o.summary, 400), actions: out.slice(0, 20) };
}

export function buildActionsPrompt(a: StoredAnnouncement, course: Course, items: Item[], tz: string): { system: { text: string; cache?: boolean }[]; user: string } {
  const open = items
    .filter((i) => i.courseId === course.id)
    .sort((x, y) => x.dueAt.localeCompare(y.dueAt))
    .slice(0, 80)
    .map((i) => `${i.id} · ${i.title} · ${i.type} · ${i.points} pts · due ${fmtDate(dateOf(i.dueAt, tz), 'short')}${i.status === 'done' ? ' · done' : ''}`)
    .join('\n');
  const posted = a.publishedAt ? dateOf(a.publishedAt, tz) : 'unknown';
  return {
    system: [{ text: ACTIONS_SYSTEM, cache: true }],
    user: `Class: ${course.code} ${course.name}\nPosted: ${posted}${a.author ? ` by ${a.author}` : ''}\nTitle: ${a.title}\n\nThis class's planner items (id · title · type · points · due):\n${open || '(none)'}\n\nThe announcement:\n"""\n${a.text.slice(0, 20_000)}\n"""`,
  };
}

export async function readActions(args: { apiKey?: string; fetch?: typeof globalThis.fetch; announcement: StoredAnnouncement; course: Course; items: Item[]; tz: string }): Promise<{ summary: string; actions: Action[]; usage?: unknown }> {
  const p = buildActionsPrompt(args.announcement, args.course, args.items, args.tz);
  const r = await callTool({ apiKey: args.apiKey, fetch: args.fetch, kind: 'announcement', system: p.system, user: p.user, tool: ACTIONS_TOOL, maxTokens: 4000 });
  return { ...actionsFromTool(r.input, args.announcement, args.items, args.tz), usage: r.usage };
}

let seq = 0;
const rid = (at: string) => `rq-${at.slice(0, 10).replace(/-/g, '')}-${(seq += 1).toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

export interface Routed {
  /** Parts to attach to work that already exists. Facts about the student's own assignments: saved on arrival. */
  requirements: { itemId: string; req: Requirement }[];
  /** Class-level findings, including everything that fitted no category. Also saved on arrival. */
  notes: { courseId: string; note: ClassNote }[];
  /** Things that create or move planner rows. These go through the diff, because they change the plan. */
  changes: Action[];
}

/**
 * Where each finding goes. The split is the one the student asked for: things that describe work they already have
 * are facts and attach immediately; things that add or move a row are changes and wait for approval.
 */
export function routeActions(actions: Action[], courseId: string, at: string): Routed {
  const out: Routed = { requirements: [], notes: [], changes: [] };
  for (const a of actions) {
    if ((a.kind === 'requirement' || a.kind === 'note') && a.itemId) {
      out.requirements.push({ itemId: a.itemId, req: { id: rid(at), text: a.text, dueAt: a.dueAt, done: false, doneAt: null, gradedOn: a.gradedOn, redefinesDone: a.redefinesDone, source: a.source, addedAt: at } });
      continue;
    }
    if (a.kind === 'requirement' || a.kind === 'note') {
      out.notes.push({ courseId, note: { id: rid(at), text: a.text, source: a.source, addedAt: at, seenAt: null } });
      continue;
    }
    out.changes.push(a);
  }
  return out;
}
