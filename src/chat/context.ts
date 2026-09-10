import type Anthropic from '@anthropic-ai/sdk';
import { dateOf, fmtClock, hhmmToMinutes } from '../domain/dates';
import type { DerivedDeadline, Nudge } from '../domain/deadlines';
import type { Schedule } from '../domain/schedule';
import type { Course, DateStr, Item, ItemStatus, Settings } from '../domain/types';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MAX_OPEN = 80;

export const SYSTEM_PROMPT = `You are a calm study coach inside a student's planner. The student is a college freshman with six classes.

Every message comes with a JSON context: today's date, weekly study capacity, class meeting times, notes the student has told you before, and the open items with the syllabus due date, the real deadline the planner derived, the computed start-by date, estimated minutes, points, and status.

How to answer:
- Two or three sentences. Never a bulleted dump. Name at most three items, by their label.
- Never state totals like "you have 47 things." Do not list everything due this week.
- Reason about trade-offs out loud in one clause: points, hours, what is due sooner, and what class meets early tomorrow.
- Prefer the derived real deadline and start-by over the syllabus date. Big items should be started early.
- If the student tells you something about their situation or progress, store it with remember_note, and when it changes an item's status or remaining effort, use update_item. Confirm briefly.
- If asked what to do right now, pick one thing and say why, then at most two more.
- Plain, warm, unhurried. No exclamation marks. No emoji.`;

export interface ContextInput {
  items: Item[];
  courses: Course[];
  settings: Settings;
  schedule: Schedule;
  derived: Record<string, DerivedDeadline>;
  nudges: Nudge[];
  today: DateStr;
  notes: string[];
}

function meets(c: Course): string {
  if (c.online || c.meetings.length === 0) return 'online';
  return c.meetings
    .map((m) => {
      const s = hhmmToMinutes(m.start);
      const e = hhmmToMinutes(m.end);
      return `${DAYS[m.day]} ${fmtClock(Math.floor(s / 60), s % 60)}–${fmtClock(Math.floor(e / 60), e % 60)}`;
    })
    .join(', ');
}

/** Compact JSON the model sees on every turn. Stable key order keeps it cacheable within a session. */
export function buildContext(input: ContextInput): string {
  const { items, courses, settings, schedule, derived, nudges, today, notes } = input;
  const tz = settings.timezone;
  const code = new Map(courses.map((c) => [c.id, c.code]));
  const open = items
    .filter((i) => i.status !== 'done')
    .map((i) => {
      const s = schedule.byItem[i.id];
      const due = dateOf(i.dueAt, tz);
      const real = derived[i.id] ? dateOf(derived[i.id].deadlineAt, tz) : due;
      return {
        id: i.id,
        label: i.label,
        class: code.get(i.courseId) ?? '',
        due,
        ...(real !== due ? { realDeadline: real, why: derived[i.id].reasons.join('; ') } : {}),
        startBy: s?.startBy ?? due,
        minutes: i.estimatedMinutes,
        points: i.points,
        status: i.status,
        ...(i.flags.inClass ? { inClass: true } : {}),
        ...(i.snoozedUntil && i.snoozedUntil > today ? { snoozedUntil: i.snoozedUntil } : {}),
        deadlineKey: s?.deadlineDay ?? due,
      };
    })
    .sort((a, b) => a.deadlineKey.localeCompare(b.deadlineKey) || b.minutes - a.minutes)
    .slice(0, MAX_OPEN)
    .map(({ deadlineKey: _k, ...rest }) => rest);

  const ctx = {
    today,
    weekday: DAYS[new Date(today + 'T12:00:00Z').getUTCDay()],
    capacity: { weekdayHours: settings.weekdayMinutes / 60, weekendHours: settings.weekendMinutes / 60 },
    classes: courses.map((c) => ({ code: c.code, name: c.name, meets: meets(c) })),
    notes,
    done: items.filter((i) => i.status === 'done').length,
    openTotal: items.filter((i) => i.status !== 'done').length,
    open,
    reminders: nudges.filter((nd) => nd.day >= today).slice(0, 5).map((nd) => ({ day: nd.day, label: nd.label, minutes: nd.minutes })),
  };
  return JSON.stringify(ctx);
}

export const CHAT_TOOLS: Anthropic.Tool[] = [
  {
    name: 'remember_note',
    description: 'Save something the student told you about their situation, constraints, or progress so future answers account for it. One short sentence.',
    strict: true,
    input_schema: {
      type: 'object',
      properties: { note: { type: 'string', description: 'The fact to remember, in the student’s terms.' } },
      required: ['note'],
      additionalProperties: false,
    },
  },
  {
    name: 'update_item',
    description: 'Change an item’s status or remaining estimate when the student reports progress. Use the item id from the context.',
    strict: true,
    input_schema: {
      type: 'object',
      properties: {
        item_id: { type: 'string' },
        status: { type: 'string', enum: ['todo', 'in_progress', 'done'] },
        estimate_minutes: { type: 'integer', description: 'Remaining minutes of work.' },
      },
      required: ['item_id'],
      additionalProperties: false,
    },
  },
];

export interface ToolApi {
  items: Item[];
  addNote: (note: string) => void;
  updateItem: (id: string, patch: { status?: ItemStatus; estimatedMinutes?: number }) => void;
}

export function dispatchTool(name: string, input: unknown, api: ToolApi): string {
  const args = (input ?? {}) as Record<string, unknown>;
  if (name === 'remember_note') {
    const note = String(args.note ?? '').trim();
    if (!note) return 'Nothing to note.';
    api.addNote(note);
    return 'Noted.';
  }
  if (name === 'update_item') {
    const id = String(args.item_id ?? '');
    const item = api.items.find((i) => i.id === id);
    if (!item) return `No item with id ${id}.`;
    const patch: { status?: ItemStatus; estimatedMinutes?: number } = {};
    const parts: string[] = [];
    if (typeof args.status === 'string' && ['todo', 'in_progress', 'done'].includes(args.status)) {
      patch.status = args.status as ItemStatus;
      parts.push(`status ${args.status}`);
    }
    if (typeof args.estimate_minutes === 'number' && Number.isFinite(args.estimate_minutes)) {
      patch.estimatedMinutes = Math.max(0, Math.round(args.estimate_minutes));
      parts.push(`estimate ${patch.estimatedMinutes} min`);
    }
    if (parts.length === 0) return `Nothing to change on ${item.label}.`;
    api.updateItem(id, patch);
    return `Updated ${item.label}: ${parts.join(', ')}.`;
  }
  return `Unknown tool ${name}.`;
}
