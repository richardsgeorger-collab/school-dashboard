import { arr, callTool, obj, str, type ToolSpec } from '../ai/client';
import { dateOf, fmtDate } from '../domain/dates';
import type { Course, Item, LockedKind } from '../domain/types';
import type { StoredAnnouncement } from './announce';

/**
 * Free's look at an announcement (George, 2026-10-25, Loop 268): which assignment it changed, and how ("due date",
 * "extra step"), never what. Plus reads the whole post and puts the details on the assignment; Free is told, honestly
 * and once, that there is something there: "An announcement changed the due date · see it with Plus". The model is
 * asked for the kind alone, so the details never reach a Free account's device. About $0.0002 a post on Haiku 5.5.
 */

export const PEEK_TOOL: ToolSpec = {
  name: 'announcement_kinds',
  description: 'Which of the listed assignments one announcement changes, and only the kind of change. Never the details.',
  input_schema: {
    type: 'object',
    additionalProperties: false,
    required: ['changes'],
    properties: {
      changes: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['item_id', 'kind'],
          properties: {
            item_id: { type: 'string', description: 'The id of the assignment from the list, exactly as given.' },
            kind: { type: 'string', enum: ['due_date', 'extra_step'], description: 'due_date: the post moves its due date (or time). extra_step: the post adds something the student must do or bring for it that the assignment does not say (bring goggles, reply to two classmates, submit a draft first).' },
          },
        },
      },
    },
  },
};

const PEEK_SYSTEM = `You look at one class announcement and a list of the student's assignments. Name each assignment the announcement changes, and only how: due_date when it moves that assignment's due date or time; extra_step when it adds something the student must do or bring for that assignment that the assignment itself does not say. Nothing else counts: news, office hours, grades posted, encouragement, reminders of a date that is not changing. When the post names no assignment on the list, or only repeats what is already true, return no changes. Never write any detail of the change. Answer only through the announcement_kinds tool.`;

export function buildPeekPrompt(a: StoredAnnouncement, course: Course, items: Item[], tz: string): { system: { text: string; cache?: boolean }[]; user: string } {
  const list = items
    .filter((i) => i.courseId === course.id && i.status !== 'done')
    .slice(0, 60)
    .map((i) => `${i.id} | ${i.title} | due ${fmtDate(dateOf(i.dueAt, tz), 'long')}`)
    .join('\n');
  return { system: [{ text: PEEK_SYSTEM, cache: true }], user: `Class: ${course.code} ${course.name}\nPosted: ${a.publishedAt ?? 'unknown'}\n\nAssignments (id | title | due):\n${list || '(none)'}\n\nThe announcement:\n"""\n${a.text.slice(0, 12_000)}\n"""` };
}

/** Only assignments on the list and the two kinds; one entry per assignment. */
export function peekFromTool(raw: unknown, items: Item[]): { itemId: string; kinds: LockedKind[] }[] {
  const ids = new Set(items.map((i) => i.id));
  const by = new Map<string, Set<LockedKind>>();
  for (const e of arr(obj(raw).changes)) {
    const x = obj(e);
    const id = str(x.item_id, 80);
    const kind = x.kind === 'due_date' || x.kind === 'extra_step' ? x.kind : null;
    if (!kind || !ids.has(id)) continue;
    by.set(id, (by.get(id) ?? new Set()).add(kind));
  }
  return [...by].map(([itemId, kinds]) => ({ itemId, kinds: [...kinds].sort() }));
}

export async function peekPost(args: { apiKey?: string; fetch?: typeof globalThis.fetch; announcement: StoredAnnouncement; course: Course; items: Item[]; tz: string }): Promise<{ itemId: string; kinds: LockedKind[] }[]> {
  const p = buildPeekPrompt(args.announcement, args.course, args.items, args.tz);
  const r = await callTool({ apiKey: args.apiKey, fetch: args.fetch, kind: 'changes', system: p.system, user: p.user, tool: PEEK_TOOL, maxTokens: 600 });
  return peekFromTool(r.input, args.items);
}

/** The line, said the same everywhere: the kind, never the detail. "An announcement changed the due date · see it with Plus". */
export function lockedLine(kinds: LockedKind[]): string {
  const what = kinds.includes('due_date') && kinds.includes('extra_step') ? 'changed the due date and added a step' : kinds.includes('due_date') ? 'changed the due date' : 'added a step';
  return `An announcement ${what}`;
}

/** Keeps the last few hundred post ids the check has looked at. */
export const PEEKED_CAP = 400;
export const addPeeked = (list: string[] | undefined, ids: string[]): string[] => [...(list ?? []).filter((x) => !ids.includes(x)), ...ids].slice(-PEEKED_CAP);
