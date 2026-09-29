import { looksLikeNote } from '../domain/reqClean';
import { clampDetail, cleanLine, LINE_WORDS, shortLine, tooLong } from '../domain/shortLine';
import { callTool, type ToolSpec } from '../ai/client';
import { addDays, dateOf, makeIso } from '../domain/dates';
import type { ClassNote, Course, DateStr, Item, ReqSource, Requirement } from '../domain/types';
import type { StoredAnnouncement } from './announce';
import { isParticipationWork, participationFor } from '../domain/participation';

/**
 * What one announcement actually asks of the student. At GCU the assignment description is written once, at the start
 * of term, and the professor then runs the class from announcements: extra steps, replies to classmates, templates,
 * what to bring, what the exam covers, what full credit now means. None of it reaches the gradebook, and all of it is
 * graded. This reads for anything actionable rather than for a list of categories.
 */

export type ActionKind = 'requirement' | 'new_work' | 'participation' | 'date_change' | 'points_change' | 'note';

export interface Action {
  kind: ActionKind;
  /** The planner item it attaches to, when it is about one. */
  itemId: string | null;
  /** What the student has to do: one checklist line of about ten words. */
  text: string;
  /** Two or three plain sentences: exactly what to do, and any date, count or place that matters. */
  detail?: string;
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
          required: ['kind', 'applies_to', 'what', 'detail', 'due', 'time', 'points', 'graded', 'changes_what_done_means', 'quote', 'confidence'],
          properties: {
            kind: {
              type: 'string',
              description:
                'requirement: a step or rule attached to work already in the planner list. participation: anything that earns participation points (acknowledging an announcement, posting in the forum, replying to classmates, attending, in-class activities); set applies_to to that week\'s participation item. new_work: real graded work with a clear deliverable (a file, a quiz, a paper, a lab, a problem set) that is not in the list at all. date_change: existing work moves. points_change: its value changes. note: anything else worth knowing, including anything that fits none of these. Never drop a finding because it has no category; use note.',
            },
            applies_to: { type: 'string', description: 'The planner item id from the list, when it is about one of them. Empty for anything that belongs to the class rather than one assignment.' },
            what: { type: 'string', description: 'The checklist line: one plain to-do of at most ten words, like "Reply to 2 classmates on 2 different days" or "Submit as one PDF, no handwriting". No file names, no quotation, no "per the announcement". Put a date in it only when the step has its own date, written like "Sep 20" ("Claim your topic in the forum by Sep 20").' },
            detail: { type: 'string', description: 'Two or three plain sentences that say exactly what to do and any detail that matters: the date, the count, where to find the file (by its name), what counts. Not a quotation.' },
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
- Real graded work with a clear deliverable that is not in their list at all (a file to submit, a quiz, a paper, a lab, a problem set). Only this is new_work.
- Dates that move, values that change, work that is cancelled.
- What an exam covers, what to prepare, what to bring, what to read first.
- Anything actionable that fits none of the above. Use note. A finding you cannot categorise is still a finding, and dropping it is the one unrecoverable mistake here.

Participation, strictly:
- Anything about acknowledging the announcement, posting in the forum, replying to classmates, attending, or in-class activities is PARTICIPATION. Use kind participation and set applies_to to that week's participation item for this class (the planner items with type participation; pick the one due at the end of the week the post talks about).
- Never make new_work for participation, and never for reading something, watching something, emailing someone, or anything without a deliverable that is graded on its own. Those are participation, a requirement on the work they belong to, or a note.

Rules:
- Quote the post's own words for every entry. No quote, no entry.
- "what" is an instruction the student can follow without opening the post again. Write "Reply to two classmates' posts by Sunday", not "The professor discussed participation".
- Resolve "Friday", "next week", "by the end of the week" against the posting date, which is given. If a date cannot be resolved, leave it empty and say so in "what". Never invent one.
- Set applies_to when the post is about one of the listed planner items. Match on what the post is talking about, not on a word appearing in both.
- Pure news with nothing to act on, an office-hours move, a welcome, encouragement, produces a summary and no actions. That is a valid answer, but read carefully first: a single clause in a friendly post is often the only place a requirement appears.
- Plain words. Say what to do.
- "what" is the checklist line a student reads at a glance: one plain to-do of at most ten words ("Reply to 2 classmates on 2 different days", "Bring a calculator to the quiz", "Submit as one PDF, no handwriting", "Claim your topic in the forum by Sep 20"). No file names, no quotation, no brackets, no "per the announcement", no second sentence. Count the words; over ten is wrong.
- "detail" is what the student reads after tapping the line: two or three plain sentences with exactly what to do and anything that matters (dates, counts, where the file is, by its name). Not a quotation; the quote field carries the professor's words.
- The summary is one sentence of at most eighteen words.
- "what" is the instruction and nothing else: never your reasoning, a correction, or a note to yourself. Work a date out before you write, then write only the result.
- Some planner items carry "already noted": what earlier posts already asked for on that item. When this post asks the same thing in other words, do not add it again. Add it only when something changed: a new date, a new number, a new step.

Procedure, every time:
1. Read the whole post once. Then go sentence by sentence and mark every sentence that tells students to do, bring, submit, read, reply, or prepare something, or that changes a date, a value, or what counts.
2. For each marked sentence decide the kind: participation (acknowledge, forum, replies, attendance, in class), requirement (adds to work they have), new_work (graded work with a deliverable, not in their list), date_change, points_change, or note (actionable, fits nothing else).
3. Resolve every relative date with the calendar in the message: find the named weekday there and use its date,
   never count days yourself. "Before Monday", "by Monday" and "due Monday" all mean that Monday's date: the first
   Monday after the posting day, or next week's if the post says "next Monday". Write dates as YYYY-MM-DD.
4. Copy the sentence as the quote, word for word. Then write "what" as a plain instruction.
5. Only then write the summary: one sentence on what the post is about.

Example. Post dated 2026-09-28 (a Monday) in CHM-113, planner has "Lab 3: Titration" (id i-lab3, due 2026-10-02):
"Lab 3 will now be due Friday October 9 instead of the 2nd. Also, from this week bring your own splash goggles to lab. No goggles, no points."
Actions:
- kind date_change, applies_to i-lab3, what "Lab 3 now due Oct 9", detail "Lab 3 moved from October 2 to Friday, October 9. Nothing else about it changed.", due 2026-10-09, quote "Lab 3 will now be due Friday October 9 instead of the 2nd."
- kind requirement, applies_to i-lab3, what "Bring your own splash goggles to every lab", detail "Starting this week, bring your own splash goggles to each lab session. Without them you get no points for that lab.", graded true, quote "from this week bring your own splash goggles to lab. No goggles, no points."
Summary: "Lab 3 moved to October 9; goggles are now required in lab."

Answer only through the announcement_actions tool.`;

const obj = (x: unknown): Record<string, unknown> => (x && typeof x === 'object' && !Array.isArray(x) ? (x as Record<string, unknown>) : {});
const arr = (x: unknown): unknown[] => (Array.isArray(x) ? x : []);
const str = (x: unknown, max: number): string => (typeof x === 'string' ? x.trim().slice(0, max) : '');

/**
 * The prompt asks for five to ten words; this is the check in code. A line that runs long is cut at the word limit
 * with an ellipsis, and the quote (never cut) keeps the rest one tap away.
 */
export function capWords(text: string, max: number): string {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length <= max) return words.join(' ');
  return `${words.slice(0, max).join(' ').replace(/[,;:]$/, '')}…`;
}
export const PART_WORDS = 10;
export const SUMMARY_WORDS = 18;
/** How many earlier parts an item shows the reader, and how long each may be, so the prompt stays small. */
const NOTED_PARTS = 5;
const NOTED_WORDS = 8;

/**
 * The model once wrote its own second thoughts into a checklist line ("Post your introduction by Wednesday,
 * September 9 — wait, posted Sept 9, so Wednesday is…"). Anything after a marker of thinking aloud is cut; a line
 * that was nothing but thinking is dropped by the caller.
 */
const THINKING = /\s*(?:[—–-]+\s*)?\b(?:wait|hmm|actually|let me|i think|i need to|i'll|so that means|no,|oh,)\b.*$/i;
export function cleanWhat(text: string): string {
  const cut = text.replace(THINKING, '').trim().replace(/[,;:—–-]+$/, '').trim();
  return cut.split(/\s+/).filter(Boolean).length >= 3 ? cut : '';
}
const KINDS: ActionKind[] = ['requirement', 'new_work', 'participation', 'date_change', 'points_change', 'note'];

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
    // Cleaned (files, brackets, filler out) but not cut: a line still too long is rewritten by the reader, not chopped.
    const what = cleanWhat(str(x.what, 400));
    const text = what ? cleanLine(what) : '';
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
      detail: clampDetail(str(x.detail, 1200)),
      dueAt: when(str(x.due, 10), str(x.time, 5), tz),
      points: pts > 0 ? pts : null,
      gradedOn: x.graded !== false,
      redefinesDone: x.changes_what_done_means === true,
      confidence: conf === 'high' || conf === 'medium' ? conf : 'low',
      source: { ...source, quote },
    });
  }
  return { summary: capWords(str(o.summary, 400), SUMMARY_WORDS), actions: out.slice(0, 20) };
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const weekday = (d: DateStr) => WEEKDAYS[new Date(`${d}T12:00:00Z`).getUTCDay()];
const dayLabel = (d: DateStr) => `${weekday(d)} ${d}`;

/**
 * The posting day and the two weeks after it, written out. The model looks a day up here instead of counting: asked
 * to count, Haiku put "before Monday" on the Tuesday.
 */
export function calendarFrom(posted: DateStr): string {
  return Array.from({ length: 15 }, (_, k) => {
    const d = addDays(posted, k);
    return `${dayLabel(d)}${k === 0 ? ' (posted)' : ''}`;
  }).join('\n');
}

/**
 * What earlier posts already put on an item, so the reader can tell a restatement from a change. Never this post's
 * own parts: a re-read after an edit must not see its previous answer as "already noted" and drop everything.
 */
export function notedParts(i: Item, postId: string): string[] {
  const own = (r: { source: { id: string | null }; sources?: { id: string | null }[] }) => r.source.id === postId || (r.sources ?? []).some((s) => s.id === postId);
  return (i.requirements ?? [])
    .filter((r) => !own(r) && r.text)
    .slice(0, NOTED_PARTS)
    .map((r) => `"${capWords(r.text, NOTED_WORDS)}"`);
}

export function buildActionsPrompt(a: StoredAnnouncement, course: Course, items: Item[], tz: string): { system: { text: string; cache?: boolean }[]; user: string } {
  const open = items
    .filter((i) => i.courseId === course.id)
    .sort((x, y) => x.dueAt.localeCompare(y.dueAt))
    .slice(0, 80)
    .map((i) => {
      const noted = i.status === 'done' ? [] : notedParts(i, a.id);
      return `${i.id} · ${i.title} · ${i.type} · ${i.points} pts · due ${dayLabel(dateOf(i.dueAt, tz))}${i.status === 'done' ? ' · done' : ''}${noted.length ? ` · already noted: ${noted.join('; ')}` : ''}`;
    })
    .join('\n');
  const posted = a.publishedAt ? dateOf(a.publishedAt, tz) : null;
  return {
    system: [{ text: ACTIONS_SYSTEM, cache: true }],
    user: `Class: ${course.code} ${course.name}\nPosted: ${posted ? dayLabel(posted) : 'unknown'}${a.author ? ` by ${a.author}` : ''}\nTitle: ${a.title}\n\n${posted ? `Calendar (look a day up here; never count days):\n${calendarFrom(posted)}\n\n` : ''}This class's planner items (id · title · type · points · due):\n${open || '(none)'}\n\nThe announcement:\n"""\n${a.text.slice(0, 20_000)}\n"""`,
  };
}

export async function readActions(args: { apiKey?: string; fetch?: typeof globalThis.fetch; announcement: StoredAnnouncement; course: Course; items: Item[]; tz: string }): Promise<{ summary: string; actions: Action[]; usage?: unknown }> {
  const p = buildActionsPrompt(args.announcement, args.course, args.items, args.tz);
  const r = await callTool({ apiKey: args.apiKey, fetch: args.fetch, kind: 'announcement', system: p.system, user: p.user, tool: ACTIONS_TOOL, maxTokens: 4000 });
  const read = actionsFromTool(r.input, args.announcement, args.items, args.tz);
  const usage = { ...(r.usage as Record<string, number>) };
  // The length rule, enforced: anything still over ten words goes back once, all together, for a shorter line.
  const long = read.actions.map((a, i) => ({ a, i })).filter(({ a }) => tooLong(a.text));
  if (long.length) {
    try {
      const s = await callTool({ apiKey: args.apiKey, fetch: args.fetch, kind: 'announcement', system: [{ text: SHORTEN_SYSTEM, cache: true }], user: long.map(({ a }, k) => `${k + 1}. ${a.text}`).join('\n'), tool: SHORTEN_TOOL, maxTokens: 600 });
      const lines = arr(obj(s.input).lines).map((x) => (typeof x === 'string' ? cleanLine(x) : ''));
      long.forEach(({ i }, k) => {
        const got = lines[k];
        if (got && !tooLong(got)) read.actions[i] = { ...read.actions[i], text: got };
      });
      for (const [key, v] of Object.entries(s.usage ?? {})) if (typeof v === 'number') usage[key] = (usage[key] ?? 0) + v;
    } catch {
      /* the fallback below still keeps every line short */
    }
  }
  // Last resort: a line the rewrite could not fix is cut at a clause, never left long.
  read.actions = read.actions.map((a) => (tooLong(a.text) ? { ...a, text: shortLine(a.text) } : a));
  return { ...read, usage };
}

export const SHORTEN_SYSTEM = `Rewrite each numbered line as one plain to-do of at most ${LINE_WORDS} words, keeping its meaning and any date or number that matters. No file names, no quotation, no brackets. Answer only through the short_lines tool, one line per input line, in the same order.`;
const SHORTEN_TOOL: ToolSpec = {
  name: 'short_lines',
  description: 'The same lines, each rewritten to at most ten words.',
  input_schema: { type: 'object', additionalProperties: false, required: ['lines'], properties: { lines: { type: 'array', items: { type: 'string' }, description: 'One rewritten line per input line, same order.' } } },
};

let seq = 0;
const rid = (at: string) => `rq-${at.slice(0, 10).replace(/-/g, '')}-${(seq += 1).toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

/**
 * Participation, enforced in code whatever the reader answered: anything that earns participation goes on that week's
 * participation item for the class (a class note when it has none), and is never its own item. New work that is not
 * graded on its own is a note, not a row.
 */
export function fileParticipation(actions: Action[], items: Item[], courseId: string, posted: DateStr, tz: string): Action[] {
  return actions.map((a) => {
    const said = `${a.text} ${a.source.quote ?? ''}`;
    const isPart = a.kind === 'participation' || ((a.kind === 'new_work' || ((a.kind === 'requirement' || a.kind === 'note') && !a.itemId)) && isParticipationWork(said));
    const current = a.itemId ? items.find((i) => i.id === a.itemId) : null;
    if (isPart && current?.type !== 'participation') {
      const target = participationFor(items, courseId, a.dueAt ? dateOf(a.dueAt, tz) : posted, tz);
      return target ? { ...a, kind: 'requirement' as const, itemId: target.id } : { ...a, kind: 'note' as const, itemId: null };
    }
    if (a.kind === 'participation') return { ...a, kind: 'requirement' as const };
    if (a.kind === 'new_work' && !a.gradedOn) return { ...a, kind: 'note' as const, itemId: null };
    return a;
  });
}

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
      // A note about an item, or a requirement phrased as a negation, is worth knowing and is not a box to tick.
      const scope = a.kind === 'note' || looksLikeNote(a.text) ? 'reference' : undefined;
      out.requirements.push({ itemId: a.itemId, req: { id: rid(at), text: a.text, detail: a.detail || undefined, dueAt: scope ? null : a.dueAt, done: false, doneAt: null, gradedOn: scope ? false : a.gradedOn, redefinesDone: a.redefinesDone, scope, source: a.source, addedAt: at } });
      continue;
    }
    if (a.kind === 'requirement' || a.kind === 'note') {
      out.notes.push({ courseId, note: { id: rid(at), text: a.text, detail: a.detail || undefined, source: a.source, addedAt: at, seenAt: null } });
      continue;
    }
    out.changes.push(a);
  }
  return out;
}

/**
 * The one-time rewrite for posts an older reader read. Not a fresh extraction: a fresh reading files a finding under
 * a different assignment now and then, or skips one it found last time, and matching old rows to new ones by wording
 * drops real requirements. Instead the reader gets the lines it wrote from this post and rewrites each one, in order,
 * as a short checklist line and a short explanation. Every row keeps its assignment, its tick and its source.
 */
export const REWRITE_SYSTEM = `You rewrite checklist lines a student sees for requirements taken from one college class announcement. For each numbered line, write:
- "what": one plain to-do of at most ${LINE_WORDS} words, like "Reply to 2 classmates on 2 different days", "Bring a calculator to the quiz", "Submit as one PDF, no handwriting", "Claim your topic in the forum by Sep 20". No file names, no quotation, no brackets, no "per the announcement". Keep a date only when the step has its own, written like "Sep 20".
- "detail": two or three plain sentences with exactly what to do and anything that matters from the post (dates, counts, where the file is, by its name). Not a quotation.
Keep each line's meaning; do not merge, split, add or drop lines. Answer only through the rewritten_lines tool, one entry per input line, in the same order.`;

const REWRITE_TOOL: ToolSpec = {
  name: 'rewritten_lines',
  description: 'Each input line rewritten as a short checklist line and a short explanation, same order.',
  input_schema: {
    type: 'object',
    additionalProperties: false,
    required: ['lines'],
    properties: {
      lines: {
        type: 'array',
        items: { type: 'object', additionalProperties: false, required: ['what', 'detail'], properties: { what: { type: 'string' }, detail: { type: 'string' } } },
      },
    },
  },
};

export async function rewriteLines(args: { apiKey?: string; fetch?: typeof globalThis.fetch; announcement: StoredAnnouncement; course: Course; lines: string[] }): Promise<{ lines: ({ text: string; detail: string } | null)[]; usage?: unknown }> {
  const user = `Class: ${args.course.code} ${args.course.name}\nPosted: ${args.announcement.publishedAt ?? 'unknown'}\n\nThe announcement:\n"""\n${args.announcement.text.slice(0, 20_000)}\n"""\n\nLines to rewrite:\n${args.lines.map((l, i) => `${i + 1}. ${l}`).join('\n')}`;
  const r = await callTool({ apiKey: args.apiKey, fetch: args.fetch, kind: 'announcement', system: [{ text: REWRITE_SYSTEM, cache: true }], user, tool: REWRITE_TOOL, maxTokens: 3000 });
  const got = arr(obj(r.input).lines);
  const lines = args.lines.map((_, i) => {
    const x = obj(got[i]);
    const what = cleanLine(cleanWhat(str(x.what, 400)));
    if (!what) return null;
    return { text: tooLong(what) ? shortLine(what) : what, detail: clampDetail(str(x.detail, 1200)) };
  });
  return { lines, usage: r.usage };
}
