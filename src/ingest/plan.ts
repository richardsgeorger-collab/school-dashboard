import { arr, confidence, isoDate, num, obj, str, strs, type ToolSpec } from '../ai/client';
import { addDays } from '../domain/dates';
import type { Confidence, DateStr, ItemPlan, ItemType, PlanPrerequisite, PlanSource, TopicNode } from '../domain/types';
import { normTitle } from '../halo/normalize';
import type { ClassContext } from './context';

/**
 * The class pass: one call per class that reads everything on file and returns, per assignment, what it asks for, a
 * reasoned start-by, a real effort estimate, milestones, prerequisites, flags, topics, and the material that covers it.
 * Due dates come from Halo and are never asked for.
 */
export const CLASS_PLAN_TOOL: ToolSpec = {
  name: 'class_plan',
  description: 'The plan for one class: every assignment understood from its description, rubric, syllabus, slides, and lectures.',
  strict: true,
  input_schema: {
    type: 'object',
    additionalProperties: false,
    required: ['items', 'discovered', 'topics', 'notes'],
    properties: {
      items: {
        type: 'array',
        description: 'One entry per assignment given, by its ref. Every ref exactly once.',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['ref', 'asks', 'start_by', 'minutes', 'milestones', 'prerequisites', 'flags', 'topics', 'feeds', 'sources', 'citations'],
          properties: {
            ref: { type: 'string', description: 'The [A#] ref of the assignment.' },
            asks: { type: 'string', description: 'What it actually asks for, one to three plain lines: what to hand in, how long, what it must do.' },
            start_by: {
              type: 'object',
              additionalProperties: false,
              required: ['date', 'why', 'confidence'],
              properties: {
                date: { type: ['string', 'null'], description: 'YYYY-MM-DD, the last day to start and still do it well. Null when the item is done or the student set their own.' },
                why: { type: 'string', description: 'One sentence: the shape of the work and what else is near it.' },
                confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
              },
            },
            minutes: {
              type: 'object',
              additionalProperties: false,
              required: ['value', 'why', 'confidence'],
              properties: {
                value: { type: ['integer', 'null'], description: 'Realistic out-of-class minutes for a first-semester student. Null when unknown.' },
                why: { type: 'string', description: 'One sentence from the actual asks: words, sources, problems, reading.' },
                confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
              },
            },
            milestones: { type: 'array', items: { type: 'string' }, description: 'For work with parts: three to seven short verb phrases in rubric order. Empty for small items.' },
            prerequisites: {
              type: 'array',
              description: 'What must happen first, including things said only in the syllabus or an announcement.',
              items: {
                type: 'object',
                additionalProperties: false,
                required: ['text', 'source', 'ref'],
                properties: { text: { type: 'string' }, source: { type: 'string', description: 'Where it was said: "syllabus", "Halo description", "announcement Sep 5", "rubric".' }, ref: { type: ['string', 'null'], description: 'The [A#] ref when the prerequisite is another assignment in the list.' } },
              },
            },
            flags: {
              type: 'object',
              additionalProperties: false,
              required: ['lopes_write', 'timed', 'group', 'in_person'],
              properties: { lopes_write: { type: 'boolean' }, timed: { type: 'boolean' }, group: { type: 'boolean' }, in_person: { type: 'boolean' } },
            },
            topics: { type: 'array', items: { type: 'string' }, description: 'The concepts the work is about, two to four words each, in the professor’s terms.' },
            feeds: { type: ['string', 'null'], description: 'The [A#] ref of the later assignment this one feeds (a first draft’s final), else null.' },
            sources: {
              type: 'array',
              description: 'Slides, readings, recordings on file that cover this work, with slide numbers when the outline shows them. Empty when nothing on file does.',
              items: { type: 'object', additionalProperties: false, required: ['kind', 'label'], properties: { kind: { type: 'string', enum: ['slide', 'recording', 'syllabus', 'rubric', 'halo'] }, label: { type: 'string', description: '"Rhetorical Appeals deck, slides 4–11" or "Lecture Sep 12".' } } },
            },
            citations: { type: 'array', items: { type: 'string' }, description: 'Where the judgments came from, one line each: "syllabus: ‘Late work…’", "Halo description", "rubric: Op-Ed Rubric".' },
          },
        },
      },
      discovered: {
        type: 'array',
        description: 'Work the syllabus, announcements, or lectures mention that is not in the Halo list. Quote the words. Never invent a date: null when none is written.',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['title', 'due', 'due_time', 'points', 'type', 'quote', 'source', 'confidence', 'why'],
          properties: {
            title: { type: 'string' },
            due: { type: ['string', 'null'], description: 'YYYY-MM-DD only when the source writes a date.' },
            due_time: { type: ['string', 'null'], description: 'HH:mm when written, else null.' },
            points: { type: ['number', 'null'] },
            type: { type: 'string', enum: ['exam', 'quiz', 'homework', 'lab', 'paper', 'project', 'discussion', 'participation', 'other'] },
            quote: { type: 'string', description: 'The exact words that mention it.' },
            source: { type: 'string', description: '"syllabus", "lecture Sep 12", "announcement".' },
            confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
            why: { type: 'string', description: 'Why it looks like real work and not a restatement of something in Halo.' },
          },
        },
      },
      topics: {
        type: 'array',
        description: 'The class’s topics in syllabus order and what each builds on, so later weakness can be traced.',
        items: { type: 'object', additionalProperties: false, required: ['name', 'week', 'builds_on'], properties: { name: { type: 'string' }, week: { type: ['integer', 'null'], description: 'Term week number when the syllabus says.' }, builds_on: { type: 'array', items: { type: 'string' }, description: 'Names of earlier topics this one assumes.' } } },
      },
      notes: { type: 'string', description: 'Anything the student should know that fits nowhere above, two lines at most. Empty is fine.' },
    },
  },
};

export const CLASS_PLAN_SYSTEM = `You are the planning pass inside a college freshman's planner. You read everything the student has for one class — the syllabus, every Halo assignment with its description, rubric files, slide outlines, lecture notes — and return, per assignment, what it actually asks for, a real start-by date, a realistic effort estimate, the milestones the rubric implies, prerequisites, flags, topics, and the material on file that covers it.

Rules:
- Due dates are Halo's and are given. Never restate, change, or invent one. For anything found only in the syllabus, an announcement, or a lecture, quote the exact words, and leave due null unless a date is written there. Missing is better than invented.
- start_by is the last day to start and still do the work well. Reason from the shape of the work: a 175-point paper with a draft deadline is not a 5-point discussion post. Count reading, drafting, revising, and the buffer a first-semester student needs; look at what else in this class lands near it. One plain sentence of reason. Never later than the due date. For a short post or quiz, the day before is fine — say so.
- minutes is realistic out-of-class time for a freshman, a whole number, reasoned from the actual asks (word count, sources, problems, reading), not from points alone. Where the rule-based number given already looks right, keep it and say so.
- milestones only for work with parts (papers, projects, labs, exams): three to seven short verb phrases in rubric order. Empty for small items.
- prerequisites: anything that must happen first — a topic to claim, a draft that feeds a final, a reading, a group to join — including things said only in the syllabus or an announcement. Name the source. When the prerequisite is another assignment in the list, give its ref.
- feeds: the ref of the later assignment this one feeds (a first draft's final). Null otherwise.
- flags from the description and tags: LopesWrite, timed, group, in person.
- topics: the concepts the work is about, two to four words each, in the professor's own terms.
- sources: which slides, readings, and recordings on file cover it, with slide numbers when the outline shows them. Empty when nothing on file does. Never name material that is not listed.
- citations: where each judgment came from.
- confidence: high when the text says it, medium when inferred from clear signals, low when guessed. Low is fine; pretending is not.
- Never write any part of what the student would submit: no draft sentences, no discussion answers, no solved problems. Describe the work; do not do it.
- Plain words, short lines. Every assignment given appears exactly once in items, by its ref.
Answer only through the class_plan tool.`;

export interface DiscoveredItem {
  title: string;
  due: DateStr | null;
  dueTime: string | null;
  points: number | null;
  type: ItemType;
  quote: string;
  source: string;
  confidence: Confidence;
  why: string;
}

export interface PlannedItem extends ItemPlan {
  itemId: string;
}

export type { TopicNode };

export interface ClassPlan {
  courseId: string;
  items: Record<string, PlannedItem>;
  discovered: DiscoveredItem[];
  topics: TopicNode[];
  notes: string;
  model: string;
  at: string;
  inputHash: string;
  /** Refs the model left out, so the compare screen can say which items it never read. */
  missing: string[];
}

export function buildClassPrompt(ctx: ClassContext, blocks: { stable: string; volatile: string }): { system: { text: string; cache?: boolean }[]; user: string } {
  return {
    system: [{ text: CLASS_PLAN_SYSTEM, cache: true }, { text: `# On file for ${ctx.course.code}\n\n${blocks.stable}`, cache: true }],
    user: blocks.volatile,
  };
}

const TYPES: ItemType[] = ['exam', 'quiz', 'homework', 'lab', 'paper', 'project', 'discussion', 'participation', 'other'];
const time = (v: unknown): string | null => (typeof v === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(v) ? v : null);

/** A deck label the model wrote back to the deck it names, so a source can be opened. */
function sourceHref(kind: PlanSource['kind'], label: string, ctx: ClassContext): string | null {
  const l = label.toLowerCase();
  if (kind === 'slide') {
    const deck = ctx.decks.find((d) => l.includes(d.title.toLowerCase())) ?? ctx.decks.find((d) => d.tag && l.includes(d.tag.toLowerCase()));
    return deck ? `#/library?v=slides&deck=${deck.id}` : `#/library?c=${ctx.course.id}`;
  }
  if (kind === 'rubric') {
    const r = ctx.rubrics.find((x) => l.includes(x.title.toLowerCase()));
    return r ? `#/library?v=slides&deck=${r.deckId}` : `#/library?c=${ctx.course.id}`;
  }
  if (kind === 'recording' || kind === 'syllabus') return `#/library?c=${ctx.course.id}`;
  return null;
}

const FILLER = new Set(['assignment', 'online', 'the', 'of', 'an', 'a', 'and', 'for', 'to', 'in']);
const words = (s: string) => new Set(normTitle(s).split(' ').filter((w) => w.length >= 2 && !FILLER.has(w)));
/** "Op-Ed Final Draft" is "Final Draft of an Op-Ed Assignment (Online)": same words once the filler is gone, or a close match due the same day. */
const similar = (a: string, b: string, sameDay = false): boolean => {
  const A = words(a);
  const B = words(b);
  if (!A.size || !B.size) return false;
  let inter = 0;
  for (const w of A) if (B.has(w)) inter++;
  const score = inter / (A.size + B.size - inter);
  return score >= 0.6 || (sameDay && score >= 0.4);
};

/** Whatever the model sent, shaped into a plan with every bad field dropped rather than trusted. */
export function planFromTool(raw: unknown, ctx: ClassContext, model: string, at = new Date().toISOString()): ClassPlan {
  const o = obj(raw);
  const byRef = new Map(ctx.assessments.map((a) => [a.ref, a]));
  const items: Record<string, PlannedItem> = {};
  for (const e of arr(o.items)) {
    const x = obj(e);
    const a = byRef.get(str(x.ref, 10));
    if (!a || items[a.itemId]) continue;
    const sb = obj(x.start_by);
    let startDate = isoDate(sb.date);
    let startConf = confidence(sb.confidence);
    let startWhy = str(sb.why, 300);
    if (startDate && startDate > a.due) {
      startDate = addDays(a.due, -1);
      startConf = 'low';
      startWhy = `${startWhy} (was after the due date; moved to the day before)`.trim();
    }
    if (startDate && startDate < addDays(ctx.today, -120)) startDate = null;
    const mn = obj(x.minutes);
    const minutesValue = num(mn.value);
    const minutes = minutesValue !== null && minutesValue >= 5 && minutesValue <= 2400 ? Math.round(minutesValue) : null;
    const prerequisites: PlanPrerequisite[] = arr(x.prerequisites)
      .map((p) => {
        const q = obj(p);
        const ref = str(q.ref, 10);
        const target = ref ? byRef.get(ref) : undefined;
        return { text: str(q.text, 200), source: str(q.source, 80), itemId: target && target.itemId !== a.itemId ? target.itemId : null };
      })
      .filter((p) => p.text)
      .slice(0, 6);
    const fl = obj(x.flags);
    const feedsRef = str(x.feeds, 10);
    const feeds = feedsRef ? (byRef.get(feedsRef)?.itemId ?? null) : null;
    const sources: PlanSource[] = arr(x.sources)
      .map((s) => {
        const q = obj(s);
        const kind = str(q.kind, 12) as PlanSource['kind'];
        const label = str(q.label, 140);
        if (!label || !['slide', 'recording', 'syllabus', 'rubric', 'halo'].includes(kind)) return null;
        return { kind, label, href: sourceHref(kind, label, ctx) };
      })
      .filter((s): s is PlanSource => !!s)
      .slice(0, 8);
    items[a.itemId] = {
      itemId: a.itemId,
      asks: str(x.asks, 600),
      startBy: startDate ? { value: startDate, why: startWhy, confidence: startConf } : null,
      minutes: minutes !== null ? { value: minutes, why: str(mn.why, 300), confidence: confidence(mn.confidence) } : null,
      milestones: strs(x.milestones, 8, 80),
      prerequisites,
      flags: { lopesWrite: fl.lopes_write === true, timed: fl.timed === true, group: fl.group === true, inPerson: fl.in_person === true },
      topics: strs(x.topics, 6, 40),
      feeds: feeds === a.itemId ? null : feeds,
      sources,
      citations: strs(x.citations, 8, 200),
      model,
      at,
      inputHash: ctx.inputHash,
    };
  }
  const discovered: DiscoveredItem[] = arr(o.discovered)
    .map((d) => {
      const q = obj(d);
      const title = str(q.title, 140);
      const quote = str(q.quote, 400);
      if (!title || quote.length < 8) return null;
      const type = TYPES.includes(str(q.type, 20) as ItemType) ? (str(q.type, 20) as ItemType) : 'other';
      const due = isoDate(q.due);
      if (ctx.assessments.some((a) => similar(a.title, title, !!due && a.due === due))) return null;
      // A date the quote does not carry a number for is a guess, whatever the model called it.
      const conf = due && !/\d/.test(quote) ? 'low' : confidence(q.confidence);
      return { title, due, dueTime: time(q.due_time), points: num(q.points), type, quote, source: str(q.source, 80), confidence: conf, why: str(q.why, 300) };
    })
    .filter((d): d is DiscoveredItem => !!d)
    .slice(0, 12);
  const topics: TopicNode[] = arr(o.topics)
    .map((t) => {
      const q = obj(t);
      const week = num(q.week);
      return { name: str(q.name, 60), week: week !== null && week >= 1 && week <= 24 ? Math.round(week) : null, buildsOn: strs(q.builds_on, 6, 60) };
    })
    .filter((t) => t.name)
    .slice(0, 30);
  const missing = ctx.assessments.filter((a) => !items[a.itemId]).map((a) => a.ref);
  return { courseId: ctx.course.id, items, discovered, topics, notes: str(o.notes, 400), model, at, inputHash: ctx.inputHash, missing };
}
