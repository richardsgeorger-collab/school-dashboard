import { arr, confidence, hashText, isoDate, obj, str, type ToolSpec } from '../ai/client';
import { addDays, dateOf, weekStart } from '../domain/dates';
import type { AppData, DateStr, ItemStatus, ItemType, Reasoned, TermChain, TermWeekPlan } from '../domain/types';
import type { ClassPlan } from './plan';

/**
 * The term pass: every open item across every class at once, with the effort each takes, so start-by dates account
 * for the other five classes. Cheap: titles, dates, minutes — no descriptions.
 */
export interface TermItem {
  ref: string;
  itemId: string;
  code: string;
  title: string;
  type: ItemType;
  due: DateStr;
  points: number;
  minutes: number;
  status: ItemStatus;
  startNow: DateStr | null;
  /** The class pass's start-by and reason, when that class has been read. */
  planStart: { date: DateStr; why: string } | null;
  /** Ref of the item this feeds, when the class pass said so. */
  feeds: string | null;
  /** The student set a start or the item is done: the pass leaves it alone. */
  fixed: boolean;
}

export interface TermInput {
  today: DateStr;
  termStart: DateStr;
  termEnd: DateStr;
  weekStartsOn: 0 | 1;
  capacity: { weekday: number; weekend: number };
  courses: { code: string; name: string; meets: string }[];
  items: TermItem[];
  inputHash: string;
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MAX_ITEMS = 220;

export function buildTermInput(data: AppData, plans: Record<string, ClassPlan | null>, today: DateStr, startByOf: (id: string) => DateStr | undefined): TermInput {
  const tz = data.settings.timezone;
  const code = new Map(data.courses.map((c) => [c.id, c.code]));
  const open = data.items
    .filter((i) => i.type !== 'participation' && dateOf(i.dueAt, tz) >= addDays(today, -3))
    .sort((a, b) => a.dueAt.localeCompare(b.dueAt) || b.points - a.points)
    .slice(0, MAX_ITEMS);
  const refOf = new Map(open.map((i, k) => [i.id, `T${k + 1}`]));
  const items: TermItem[] = open.map((i) => {
    const p = plans[i.courseId]?.items[i.id];
    return {
      ref: refOf.get(i.id)!,
      itemId: i.id,
      code: code.get(i.courseId) ?? '?',
      title: i.title,
      type: i.type,
      due: dateOf(i.dueAt, tz),
      points: i.points,
      minutes: p?.minutes?.value ?? i.estimatedMinutes,
      status: i.status,
      startNow: startByOf(i.id) ?? null,
      planStart: p?.startBy ? { date: p.startBy.value, why: p.startBy.why } : null,
      feeds: p?.feeds ? (refOf.get(p.feeds) ?? null) : null,
      fixed: i.status === 'done' || !!i.startByOverride || (i.planDeclined ?? []).includes('startBy'),
    };
  });
  const termStart = data.courses.map((c) => c.termStart).sort()[0] ?? today;
  const termEnd = data.courses.map((c) => c.termEnd).sort().at(-1) ?? today;
  const input: TermInput = {
    today,
    termStart,
    termEnd,
    weekStartsOn: data.settings.weekStartsOn,
    capacity: { weekday: data.settings.weekdayMinutes, weekend: data.settings.weekendMinutes },
    courses: data.courses.map((c) => ({ code: c.code, name: c.name, meets: c.online || !c.meetings.length ? 'online' : c.meetings.map((m) => `${DAYS[m.day]} ${m.start}`).join(', ') })),
    items,
    inputHash: '',
  };
  input.inputHash = hashText(items.map((i) => `${i.itemId}|${i.due}|${i.points}|${i.minutes}|${i.status}|${i.planStart?.date ?? ''}|${i.fixed}`).join('\n') + `|${input.capacity.weekday}|${input.capacity.weekend}`);
  return input;
}

export const TERM_PLAN_TOOL: ToolSpec = {
  name: 'term_plan',
  description: 'Start-by dates for every open assignment across all classes, the load of each week, and which assignments feed later ones.',
  strict: true,
  input_schema: {
    type: 'object',
    additionalProperties: false,
    required: ['starts', 'weeks', 'chains'],
    properties: {
      starts: {
        type: 'array',
        description: 'One entry per item that is not fixed. Skip fixed items.',
        items: { type: 'object', additionalProperties: false, required: ['ref', 'start_by', 'why', 'confidence'], properties: { ref: { type: 'string' }, start_by: { type: 'string', description: 'YYYY-MM-DD, never after the due date.' }, why: { type: 'string', description: 'One sentence naming what else lands near it, or "as the class pass said" when nothing changes it.' }, confidence: { type: 'string', enum: ['high', 'medium', 'low'] } } },
      },
      weeks: {
        type: 'array',
        description: 'One entry per week from the term start to its end.',
        items: { type: 'object', additionalProperties: false, required: ['week_start', 'load', 'why'], properties: { week_start: { type: 'string', description: 'YYYY-MM-DD of the week’s first day.' }, load: { type: 'string', enum: ['brutal', 'heavy', 'normal', 'light'] }, why: { type: 'string', description: 'What lands there, in a few words. Empty for normal and light weeks.' } } },
      },
      chains: {
        type: 'array',
        description: 'Pairs where one assignment feeds a later one: a draft and its final, a lab and its report, a proposal and its project.',
        items: { type: 'object', additionalProperties: false, required: ['from', 'to', 'why'], properties: { from: { type: 'string', description: 'ref of the earlier item' }, to: { type: 'string', description: 'ref of the later item' }, why: { type: 'string' } } },
      },
    },
  },
};

export const TERM_SYSTEM = `You are the term pass inside a college freshman's planner. You see every open assignment across all their classes with the effort each takes, and set a start-by date for each that accounts for everything else due around it.

Rules:
- A start-by is the last day to start and still do the work well, given the other work landing the same days. When three big things land in one week, the biggest starts earliest and the others move ahead of it. A draft that feeds a final leaves room for the final. Exams take study time that other work must move around. Small items (posts, short quizzes) start the day before unless that day is already full.
- The weekly capacity is given in minutes; a week holds at most five weekdays plus two weekend days of it. Spread work so no day asks for more than its capacity, favoring starting earlier over cramming.
- Keep the per-class start and reason given for an item unless the whole-term view changes it; then say in one sentence what changed it, naming the other work.
- Never move a start-by after its due date. Never output a start for a fixed item.
- weeks: one entry per week from the term start through its end, in order. brutal means an exam plus a big paper or project, or two big things; heavy means one big thing on top of normal load; the why names them. Empty why for normal and light weeks.
- chains: only pairs the titles or the class pass make plain.
Answer only through the term_plan tool.`;

export function buildTermPrompt(input: TermInput): { system: { text: string; cache?: boolean }[]; user: string } {
  const lines = input.items.map((i) => `[${i.ref}] ${i.code} · "${i.title}" · ${i.type} · due ${i.due} · ${i.points} pts · ${i.minutes} min · ${i.status === 'done' ? 'done' : i.status === 'in_progress' ? 'started' : 'not started'}${i.fixed ? ' · fixed' : ''}${i.startNow ? ` · planner start now ${i.startNow}` : ''}${i.planStart ? ` · class pass: start ${i.planStart.date} (${i.planStart.why})` : ''}${i.feeds ? ` · feeds ${i.feeds}` : ''}`);
  const user = `Today: ${input.today}\nTerm: ${input.termStart} to ${input.termEnd}; weeks start on ${input.weekStartsOn === 1 ? 'Monday' : 'Sunday'}.\nCapacity: ${input.capacity.weekday} min per weekday, ${input.capacity.weekend} min per weekend day, across all classes.\nClasses: ${input.courses.map((c) => `${c.code} (${c.meets})`).join('; ')}\n\nOpen assignments (ref, class, title, type, due, points, minutes, state):\n${lines.join('\n') || '(none)'}`;
  return { system: [{ text: TERM_SYSTEM, cache: true }], user };
}

export interface TermResult {
  starts: Record<string, Reasoned<DateStr>>;
  weeks: TermWeekPlan[];
  chains: TermChain[];
  model: string;
  at: string;
  inputHash: string;
}

export function termFromTool(raw: unknown, input: TermInput, model: string, at = new Date().toISOString()): TermResult {
  const o = obj(raw);
  const byRef = new Map(input.items.map((i) => [i.ref, i]));
  const starts: Record<string, Reasoned<DateStr>> = {};
  for (const e of arr(o.starts)) {
    const x = obj(e);
    const it = byRef.get(str(x.ref, 10));
    const date = isoDate(x.start_by);
    if (!it || !date || it.fixed || starts[it.itemId]) continue;
    const clamped = date > it.due ? addDays(it.due, -1) : date;
    starts[it.itemId] = { value: clamped, why: str(x.why, 300), confidence: clamped === date ? confidence(x.confidence) : 'low' };
  }
  const weeks: TermWeekPlan[] = [];
  const seen = new Set<string>();
  for (const e of arr(o.weeks)) {
    const x = obj(e);
    const d = isoDate(x.week_start);
    const load = str(x.load, 10);
    if (!d || !['brutal', 'heavy', 'normal', 'light'].includes(load)) continue;
    const start = weekStart(d, input.weekStartsOn);
    if (seen.has(start)) continue;
    seen.add(start);
    weeks.push({ start, load: load as TermWeekPlan['load'], why: str(x.why, 160) });
  }
  weeks.sort((a, b) => a.start.localeCompare(b.start));
  const chains: TermChain[] = [];
  for (const e of arr(o.chains)) {
    const x = obj(e);
    const from = byRef.get(str(x.from, 10));
    const to = byRef.get(str(x.to, 10));
    if (!from || !to || from.itemId === to.itemId) continue;
    if (chains.some((c) => c.from === from.itemId && c.to === to.itemId)) continue;
    chains.push({ from: from.itemId, to: to.itemId, why: str(x.why, 160) });
  }
  return { starts, weeks, chains: chains.slice(0, 40), model, at, inputHash: input.inputHash };
}
