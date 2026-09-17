import { arr, confidence, isoDate, num, obj, str, strs, type SystemBlock, type ToolSpec } from '../ai/client';
import { addDays } from '../domain/dates';
import type { Confidence, DateStr, Handoff, ItemPlan, ItemType, PlanPrerequisite, PlanSource, TopicNode } from '../domain/types';
import { normTitle } from '../halo/normalize';
import type { ClassContext } from './context';

/**
 * The class pass, in three small calls over one cached context.
 *
 * None of these tools is `strict`. Strict mode compiles the schema into a decoding grammar, and a schema with nested
 * objects, enums, and a confidence block per field grew past what the API will compile ("the compiled grammar is too
 * large"). Nothing here relied on that guarantee: every field below is read defensively and dropped when it is wrong,
 * which is the real guarantee. So the schemas stay flat — scalars and string arrays, one level of nesting at most, and
 * plain strings where an enum is not load-bearing — and the readers do the validating.
 *
 * A: what every item asks for, its start-by, its effort, its flags.
 * B: milestones and prerequisites for work with parts, plus what the syllabus carries that Halo does not.
 * C: which material on file covers which item.
 *
 * A must succeed. B and C degrade: a failure there leaves the rest of the plan standing and says so.
 */

const CORE_ITEM = {
  type: 'object',
  additionalProperties: false,
  required: ['ref', 'asks', 'start_by', 'start_why', 'minutes', 'minutes_why', 'confidence', 'unsure', 'flags', 'topics'],
  properties: {
    ref: { type: 'string', description: 'The [A#] ref of the assignment.' },
    asks: { type: 'string', description: 'What it actually asks for, one to three plain lines: what to hand in, how long, what it must do.' },
    start_by: { type: 'string', description: 'YYYY-MM-DD, the last day to start and still do it well. Empty string when the item is done or you cannot say.' },
    start_why: { type: 'string', description: 'One sentence: the shape of the work and what else in this class is near it.' },
    minutes: { type: 'integer', description: 'Realistic out-of-class minutes for a first-semester student. 0 when you cannot say.' },
    minutes_why: { type: 'string', description: 'One sentence from the actual asks: words, sources, problems, reading.' },
    confidence: { type: 'string', description: 'high, medium, or low: how sure you are about this item overall.' },
    unsure: { type: 'array', items: { type: 'string' }, description: 'Field names you are least sure of: any of start_by, minutes. Empty when both are solid.' },
    flags: { type: 'array', items: { type: 'string' }, description: 'Any of lopes_write, timed, group, in_person that the description or tags carry. Empty otherwise.' },
    topics: { type: 'array', items: { type: 'string' }, description: 'The concepts the work is about, two to four words each, in the professor’s terms.' },
  },
} as const;

export const CORE_TOOL: ToolSpec = {
  name: 'class_core',
  description: 'For every assignment in one class: what it asks for, when to start it, how long it really takes, and its flags.',
  input_schema: { type: 'object', additionalProperties: false, required: ['items'], properties: { items: { type: 'array', description: 'One entry per assignment given, by its ref. Every ref exactly once.', items: CORE_ITEM } } },
};

export const DETAIL_TOOL: ToolSpec = {
  name: 'class_detail',
  description: 'Milestones and prerequisites for the work that has parts, the work the syllabus carries that Halo does not, and the class’s topic order.',
  input_schema: {
    type: 'object',
    additionalProperties: false,
    required: ['items', 'discovered', 'topics'],
    properties: {
      items: {
        type: 'array',
        description: 'One entry per ref asked about. Skip a ref rather than invent milestones for it.',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['ref', 'milestones', 'prerequisites', 'prerequisite_sources', 'prerequisite_refs', 'feeds'],
          properties: {
            ref: { type: 'string' },
            milestones: { type: 'array', items: { type: 'string' }, description: 'Three to seven steps in the order they happen, each naming something from THIS assignment: "Pick an artifact from the topic list", "Mark where ethos appears", "Run it through LopesWrite". Never a bare verb like "Outline" or "Draft" that would fit any assignment. Empty when the work has no parts.' },
            prerequisites: { type: 'array', items: { type: 'string' }, description: 'What must happen first, one short line each: a topic to claim, a reading, a group to join, a draft.' },
            prerequisite_sources: { type: 'array', items: { type: 'string' }, description: 'Where each prerequisite above was said, in the same order: syllabus, Halo description, announcement Sep 5, rubric.' },
            prerequisite_refs: { type: 'array', items: { type: 'string' }, description: 'For each prerequisite above, in the same order, the [A#] ref when it is another assignment in the list, else an empty string.' },
            feeds: { type: 'string', description: 'The [A#] ref of the later assignment this one feeds (a first draft’s final). Empty string otherwise.' },
            what_it_is: { type: 'string', description: 'What kind of work this is, in its own terms, to finish the sentence "It is ___": "a 1,200-word argument graded on the reasoning", "a scheduling worksheet I fill with my own week", "a problem set on mole ratios".' },
            build: { type: 'array', items: { type: 'string' }, description: 'Three to five instructions for an AI the student will paste this into, naming the setup work worth asking for on THIS assignment: the outline shape, the table columns, the document skeleton, the study plan. Concrete to this task, never generic advice. Each one an imperative sentence addressed to the AI.' },
            withhold: { type: 'array', items: { type: 'string' }, description: 'One or two sentences naming exactly what that AI must not produce for THIS assignment, in its own words: the thesis and the analysis for an essay, the post for a discussion, final answers for a problem set, the student’s own data for a worksheet. Name the thing, never "the work".' },
          },
        },
      },
      discovered: {
        type: 'array',
        description: 'Work the syllabus, an announcement, or a lecture mentions that is not in the Halo list. Quote the words. Never invent a date.',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['title', 'due', 'points', 'type', 'quote', 'source', 'confidence', 'why'],
          properties: {
            title: { type: 'string' },
            due: { type: 'string', description: 'YYYY-MM-DD only when the source writes a date. Empty string otherwise.' },
            points: { type: 'integer', description: '0 when none is written.' },
            type: { type: 'string', description: 'One of exam, quiz, homework, lab, paper, project, discussion, participation, other.' },
            quote: { type: 'string', description: 'The exact words that mention it.' },
            source: { type: 'string', description: 'syllabus, lecture Sep 12, announcement.' },
            confidence: { type: 'string', description: 'high, medium, or low.' },
            why: { type: 'string', description: 'Why it is real work and not a restatement of something already in Halo.' },
          },
        },
      },
      topics: {
        type: 'array',
        description: 'The class’s topics in syllabus order and what each assumes, so later weakness can be traced.',
        items: { type: 'object', additionalProperties: false, required: ['name', 'week', 'builds_on'], properties: { name: { type: 'string' }, week: { type: 'integer', description: 'Term week number, 0 when the syllabus does not say.' }, builds_on: { type: 'array', items: { type: 'string' }, description: 'Names of earlier topics in this list that it assumes.' } } },
      },
    },
  },
};

export const MATERIAL_TOOL: ToolSpec = {
  name: 'class_material',
  description: 'Which slides, readings, and recordings on file cover which assignment.',
  input_schema: {
    type: 'object',
    additionalProperties: false,
    required: ['items'],
    properties: {
      items: {
        type: 'array',
        description: 'Only the assignments something on file actually covers. Skip the rest.',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['ref', 'sources', 'citations'],
          properties: {
            ref: { type: 'string' },
            sources: { type: 'array', items: { type: 'string' }, description: 'Each named as it is listed above, with slide numbers when the outline shows them: "Rhetorical Appeals deck, slides 4–11", "Lecture Sep 12", "Op-Ed Rubric", "syllabus".' },
            citations: { type: 'array', items: { type: 'string' }, description: 'Where the judgments about this item came from, one line each.' },
          },
        },
      },
    },
  },
};

const LINE = 'Never write any part of what the student would submit: no draft sentences, no discussion answers, no solved problems. Describe the work; do not do it.';

export const CORE_SYSTEM = `You are the planning pass inside a college freshman's planner. You have everything the student has for one class — the syllabus, every Halo assignment with its description, rubric files, slide outlines, lecture notes. For every assignment, say what it actually asks for, when to start it, how long it really takes, and what it is about.

Rules:
- Due dates are Halo's and are given. Never restate, change, or invent one.
- start_by is the last day to start and still do the work well. Reason from the shape of the work: a 175-point paper with a draft deadline is not a 5-point discussion post. Count reading, drafting, revising, and the buffer a first-semester student needs, and look at what else in this class lands near it. Never later than the due date. For a short post or quiz the day before is fine — say so. Empty string for anything already done.
- start_why and minutes_why name the work, never its size. "1,200 words with two sources, plus a day for LopesWrite" and "12 problems at about 8 minutes each" are reasons; "it is a big assignment", "to leave enough time", "this will take a while" are not, and neither is anything that would read the same on another assignment. If you cannot name the work, say what is missing: "the description does not say how long it runs".
- minutes is realistic out-of-class time for a freshman, reasoned from the actual asks — word count, sources, problems, reading — not from points alone. Where the rule-based number given already looks right, keep it and say so.
- confidence is how sure you are about the item overall: high when the text says it, medium when you inferred it from clear signals, low when you guessed. List start_by or minutes under unsure when that one is the shaky part. Low is fine; pretending is not.
- flags only when the description or tags carry them.
- topics: the concepts the work is about, in the professor's own terms.
- ${LINE}
- Plain words, short lines. Every assignment given appears exactly once, by its ref.
Answer only through the class_core tool.`;

export const DETAIL_SYSTEM = `You are the planning pass inside a college freshman's planner, reading one class. You are asked about the work that has parts: break it into milestones, name what has to happen first, and say what the syllabus carries that Halo's assignment list does not.

Rules:
- milestones: three to seven steps in the order they happen. Each one names something only this assignment has — its artifact, its sections, its equation, its word count, its submission step. "Pick an artifact from the topic list" and "Mark where ethos appears in it", not "Outline" and "Draft"; a step that would fit any assignment in any class is a wasted step. Empty when the work has no parts.
- prerequisites: anything that must happen first — a topic to claim, a draft that feeds a final, a reading, a group to join — including things said only in the syllabus or an announcement. Give the source of each in the same order, and its [A#] ref when it is another assignment in the list.
- feeds: the ref of the later assignment this one feeds. Empty otherwise.
- discovered: work the syllabus, an announcement, or a lecture mentions that is not in the Halo list. Quote the exact words. Leave due empty unless a date is written in that source. Missing is better than invented. Nothing that restates something already in the Halo list.
- topics: the class's topics in syllabus order, each with the earlier topics it assumes.
- what_it_is, build, withhold: the student pastes a prompt about this assignment into a separate AI chat. what_it_is names the kind of work. build is what that AI should set up for them — the outline shape, the table columns, the document skeleton, the study plan — written as instructions to that AI and specific enough that a scheduling worksheet and an argumentative essay read nothing alike. withhold names what it must not produce, in this assignment's own words: not "the work", but "the thesis and the body paragraphs", "the post", "the final answers", "my own schedule data". Everything graded on the student's judgment is withheld; everything that is structure, method, or formatting is fair to build.
- ${LINE}
Answer only through the class_detail tool.`;

export const MATERIAL_SYSTEM = `You match a college class's assignments to the material the student has on file: slide decks (listed with the first line of each slide), rubric files, the syllabus, and lecture notes. For each assignment something on file actually covers, name that material the way it is listed, with slide numbers when the outline shows them, and say where your reading of that assignment came from. Never name material that is not listed. Skip any assignment nothing on file covers — an empty answer is right when nothing matches. Answer only through the class_material tool.`;

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
  /** The tailored half of the paste-into-Claude prompt, per item id. */
  handoffs: Record<string, Handoff>;
  discovered: DiscoveredItem[];
  topics: TopicNode[];
  notes: string;
  model: string;
  at: string;
  inputHash: string;
  /** Refs the core pass left out, so the compare screen can say which items were never read. */
  missing: string[];
  /** Passes that did not come back, in plain words, so the screen can say what is thinner than usual. */
  incomplete: string[];
}

const emptyPlan = (ctx: ClassContext, model: string, at: string): ClassPlan => ({ courseId: ctx.course.id, items: {}, handoffs: {}, discovered: [], topics: [], notes: '', model, at, inputHash: ctx.inputHash, missing: [], incomplete: [] });

const onFile = (ctx: ClassContext) => `# On file for ${ctx.course.code}\n\n`;

/**
 * The three passes share one prefix so the big context is written to the cache once and read back at a tenth of the
 * price: what is on file, then the class as it stands, then the rules for this pass. The rules come last because the
 * cache matches on a prefix — a per-pass block in front of the context would miss it every time.
 */
const shared = (ctx: ClassContext, blocks: { stable: string; volatile: string }, rules: string): SystemBlock[] => [
  { text: onFile(ctx) + blocks.stable },
  { text: blocks.volatile, cache: true },
  { text: rules },
];

export function buildCorePrompt(ctx: ClassContext, blocks: { stable: string; volatile: string }): { system: SystemBlock[]; user: string } {
  return { system: shared(ctx, blocks, CORE_SYSTEM), user: 'Read every assignment listed above and answer for all of them, by ref.' };
}

export function buildDetailPrompt(ctx: ClassContext, blocks: { stable: string; volatile: string }, refs: string[]): { system: SystemBlock[]; user: string } {
  return { system: shared(ctx, blocks, DETAIL_SYSTEM), user: `Break these down: ${refs.join(', ') || '(none)'}. Then the work the syllabus carries that the Halo list does not, and the class's topic order.` };
}

export function buildMaterialPrompt(ctx: ClassContext, blocks: { stable: string; volatile: string }): { system: SystemBlock[]; user: string } {
  return { system: shared(ctx, blocks, MATERIAL_SYSTEM), user: 'Match the material on file to the assignments listed above. Skip any assignment nothing on file covers.' };
}

const TYPES: ItemType[] = ['exam', 'quiz', 'homework', 'lab', 'paper', 'project', 'discussion', 'participation', 'other'];
const FLAGS = { lopes_write: 'lopesWrite', timed: 'timed', group: 'group', in_person: 'inPerson' } as const;

/** Which kind of material a label names, from the words it uses and what is on file. */
function sourceKind(label: string, ctx: ClassContext): PlanSource['kind'] {
  const l = label.toLowerCase();
  if (ctx.rubrics.some((r) => l.includes(r.title.toLowerCase())) || /rubric|handout|guideline|instruction|template|checklist/.test(l)) return 'rubric';
  if (/syllabus/.test(l)) return 'syllabus';
  if (/lecture|recording|transcript|class on /.test(l)) return 'recording';
  if (ctx.decks.some((d) => l.includes(d.title.toLowerCase())) || /slide|deck/.test(l)) return 'slide';
  return 'halo';
}

/** A material label written back to the thing it names, so a source can be opened. */
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
/** "Op-Ed Final Draft" is "Final Draft of an Op-Ed Assignment (Online)": the same words once the filler is gone. */
const similar = (a: string, b: string, sameDay = false): boolean => {
  const A = words(a);
  const B = words(b);
  if (!A.size || !B.size) return false;
  let inter = 0;
  for (const w of A) if (B.has(w)) inter++;
  const score = inter / (A.size + B.size - inter);
  return score >= 0.6 || (sameDay && score >= 0.4);
};

/** Pass A, read into a plan. Anything the model got wrong is dropped here rather than trusted. */
export function planFromCore(raw: unknown, ctx: ClassContext, model: string, at = new Date().toISOString()): ClassPlan {
  const plan = emptyPlan(ctx, model, at);
  const byRef = new Map(ctx.assessments.map((a) => [a.ref, a]));
  for (const e of arr(obj(raw).items)) {
    const x = obj(e);
    const a = byRef.get(str(x.ref, 10));
    if (!a || plan.items[a.itemId]) continue;
    const overall = confidence(x.confidence);
    const unsure = new Set(strs(x.unsure, 4, 20).map((s) => s.toLowerCase()));
    const sure = (field: string): Confidence => (unsure.has(field) ? 'low' : overall);

    let startDate = isoDate(str(x.start_by, 12));
    let startWhy = str(x.start_why, 300);
    let startConf = sure('start_by');
    if (startDate && startDate > a.due) {
      startDate = addDays(a.due, -1);
      startConf = 'low';
      startWhy = `${startWhy} (was after the due date; moved to the day before)`.trim();
    }
    if (startDate && startDate < addDays(ctx.today, -120)) startDate = null;

    const asked = num(x.minutes);
    const minutes = asked !== null && asked >= 5 && asked <= 2400 ? Math.round(asked) : null;

    const flags = { lopesWrite: false, timed: false, group: false, inPerson: false };
    for (const f of strs(x.flags, 6, 20)) {
      const key = FLAGS[f.toLowerCase().replace(/[^a-z_]/g, '') as keyof typeof FLAGS];
      if (key) flags[key] = true;
    }

    plan.items[a.itemId] = {
      itemId: a.itemId,
      asks: str(x.asks, 600),
      startBy: startDate ? { value: startDate, why: startWhy, confidence: startConf } : null,
      minutes: minutes !== null ? { value: minutes, why: str(x.minutes_why, 300), confidence: sure('minutes') } : null,
      milestones: [],
      prerequisites: [],
      flags,
      topics: strs(x.topics, 6, 40),
      feeds: null,
      sources: [],
      citations: [],
      model,
      at,
      inputHash: ctx.inputHash,
    };
  }
  plan.missing = ctx.assessments.filter((a) => !plan.items[a.itemId]).map((a) => a.ref);
  return plan;
}

/**
 * The items worth a second pass: work with parts, and anything whose description carries enough to tailor a handoff
 * prompt from. Never everything, so the call stays small; what is left keeps the local handoff for its kind of work.
 */
export function detailRefs(plan: ClassPlan, ctx: ClassContext, max = 20): string[] {
  return ctx.assessments
    .filter((a) => a.status !== 'done')
    .map((a) => {
      const minutes = plan.items[a.itemId]?.minutes?.value ?? a.minutesNow;
      const big = a.points >= 60 || minutes >= 120 || ['paper', 'project', 'lab', 'exam'].includes(a.type);
      return { ref: a.ref, worth: big || a.description.length >= 200, weight: a.points * 10 + minutes };
    })
    .filter((s) => s.worth)
    .sort((a, b) => b.weight - a.weight)
    .slice(0, max)
    .map((s) => s.ref);
}

/** Pass B, merged in. Milestones and prerequisites land on items that already exist; nothing new is created here. */
export function mergeDetail(plan: ClassPlan, raw: unknown, ctx: ClassContext): ClassPlan {
  const o = obj(raw);
  const byRef = new Map(ctx.assessments.map((a) => [a.ref, a]));
  const items = { ...plan.items };
  const handoffs = { ...plan.handoffs };
  for (const e of arr(o.items)) {
    const x = obj(e);
    const a = byRef.get(str(x.ref, 10));
    const current = a ? items[a.itemId] : undefined;
    if (!a || !current) continue;
    const texts = strs(x.prerequisites, 6, 200);
    const sources = strs(x.prerequisite_sources, 6, 80);
    const refs = strs(x.prerequisite_refs, 6, 10);
    const prerequisites: PlanPrerequisite[] = texts.map((text, i) => {
      const target = refs[i] ? byRef.get(refs[i]) : undefined;
      return { text, source: sources[i] ?? '', itemId: target && target.itemId !== a.itemId ? target.itemId : null };
    });
    const feedsRef = str(x.feeds, 10);
    const feeds = feedsRef ? (byRef.get(feedsRef)?.itemId ?? null) : null;
    items[a.itemId] = { ...current, milestones: strs(x.milestones, 8, 80), prerequisites, feeds: feeds === a.itemId ? null : feeds };
    const kind = str(x.what_it_is, 160);
    const build = strs(x.build, 6, 300);
    const withhold = strs(x.withhold, 4, 300);
    // Half a handoff is worse than none: the local one is complete and already fits the kind of work.
    if (kind && build.length >= 2 && withhold.length >= 1) handoffs[a.itemId] = { kind, build, withhold, format: [], model: plan.model, at: plan.at };
  }
  const discovered: DiscoveredItem[] = arr(o.discovered)
    .map((d): DiscoveredItem | null => {
      const q = obj(d);
      const title = str(q.title, 140);
      const quote = str(q.quote, 400);
      if (!title || quote.length < 8) return null;
      const t = str(q.type, 20).toLowerCase();
      const type = (TYPES.includes(t as ItemType) ? t : 'other') as ItemType;
      const due = isoDate(str(q.due, 12));
      if (ctx.assessments.some((a) => similar(a.title, title, !!due && a.due === due))) return null;
      const points = num(q.points);
      // A date the quote carries no number for is a guess, whatever the model called it.
      const conf = due && !/\d/.test(quote) ? 'low' : confidence(q.confidence);
      return { title, due, dueTime: null, points: points !== null && points > 0 ? points : null, type, quote, source: str(q.source, 80), confidence: conf, why: str(q.why, 300) };
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
  return { ...plan, items, handoffs, discovered, topics };
}

/** Pass C, merged in: the material that covers each item, written back to something openable. */
export function mergeMaterial(plan: ClassPlan, raw: unknown, ctx: ClassContext): ClassPlan {
  const byRef = new Map(ctx.assessments.map((a) => [a.ref, a]));
  const items = { ...plan.items };
  for (const e of arr(obj(raw).items)) {
    const x = obj(e);
    const a = byRef.get(str(x.ref, 10));
    const current = a ? items[a.itemId] : undefined;
    if (!a || !current) continue;
    const sources: PlanSource[] = strs(x.sources, 8, 140).map((label) => {
      const kind = sourceKind(label, ctx);
      return { kind, label, href: sourceHref(kind, label, ctx) };
    });
    items[a.itemId] = { ...current, sources, citations: strs(x.citations, 8, 200) };
  }
  return { ...plan, items };
}
