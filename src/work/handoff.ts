import { dateOf, fmtDate, fmtMinutes, fmtTime } from '../domain/dates';
import type { Course, Handoff, Item } from '../domain/types';
import { nextStep, stepsFor } from './steps';

/**
 * The prompt the student pastes into Claude in another tab. It carries everything this app knows about one
 * assignment and asks for the setup work — the reading of the task, the first steps, the structure, the formatting —
 * and explicitly not the graded content. ENG-105 runs through LopesWrite and one of its assignments is a critique of
 * AI-generated text, so the line about what Claude must not write is practical, not decorative.
 *
 * The tailored half (what to build, what to withhold, the format rules) is written per assignment during the
 * ingestion pass and stored on the item, so the panel opens instantly. `localHandoff` is the same shape derived from
 * what is already known, so the panel works before any pass has run and when there is no key.
 */
export interface HandoffContext {
  /** Labels of the material on file that covers it. */
  sources: string[];
  /** What the professor flagged in a lecture that touches this work. */
  flagged: string[];
  /** Score so far in the class, when it is worth knowing. */
  gradeNote?: string | null;
}

/** "APA style is not required" is not a rule to follow. A rule only counts when nothing near it cancels it. */
const NEGATED = /\b(not|no|isn't|aren't|never|without)\b[^.]{0,40}$/i;
const asserted = (text: string, index: number): boolean => !NEGATED.test(text.slice(Math.max(0, index - 60), index)) && !/^[^.]{0,40}\b(is |are |)not required\b/i.test(text.slice(index));

const WORD_COUNT = /\b(\d{2,4})\s*[-–—]?\s*(?:to\s*)?(\d{2,4})?\s*words?\b/i;
const SOURCES = /\b(\d+|one|two|three|four|five)\s+(?:scholarly\s+|peer[- ]reviewed\s+|credible\s+|academic\s+)?(?:sources?|references?|citations?|articles?)\b/i;
const STYLE = /\b(APA|MLA|Chicago|IEEE)\b/i;
const PAGES = /\b(\d+)\s*[-–—]?\s*(\d+)?\s*(?:full\s+)?pages?\b/i;
const TEMPLATE = /\b(template|worksheet|form|table|spreadsheet|chart|matrix|calendar|planner|log)\b/i;

/** The format rules that actually constrain the work, read from the description and the flags. */
export function formatRules(item: Item): string[] {
  const text = `${item.title} ${item.notes ?? ''} ${item.plan?.asks ?? ''}`;
  const out: string[] = [];
  const words = WORD_COUNT.exec(text);
  if (words) out.push(words[2] ? `${words[1]}–${words[2]} words` : `${words[1]} words`);
  else {
    const pages = PAGES.exec(text);
    if (pages) out.push(pages[2] ? `${pages[1]}–${pages[2]} pages` : `${pages[1]} page${pages[1] === '1' ? '' : 's'}`);
  }
  const style = STYLE.exec(text);
  if (style && asserted(text, style.index)) out.push(`${style[1].toUpperCase()} formatting`);
  const sources = SOURCES.exec(text);
  if (sources && asserted(text, sources.index)) out.push(`${sources[1]} source${/^(1|one)$/i.test(sources[1]) ? '' : 's'} cited`);
  if (item.flags.lopesWrite || item.plan?.flags.lopesWrite) out.push('submitted through LopesWrite (it checks for AI-written and copied text)');
  if (item.flags.group || item.plan?.flags.group) out.push('group work: a CLC team submits one copy');
  if (item.flags.timed || item.plan?.flags.timed) out.push('timed once it is opened');
  return out;
}

/**
 * What the setup is, per kind of work. These differ on purpose: a scheduling worksheet wants a built table the
 * student fills with their own life; an argumentative essay wants an outline with the claims left empty.
 */
function localBuild(item: Item): string[] {
  const text = `${item.title} ${item.notes ?? ''} ${item.plan?.asks ?? ''}`.toLowerCase();
  const worksheet = TEMPLATE.test(text);
  switch (item.type) {
    case 'paper':
      return worksheet
        ? ['Build the document the assignment describes, with every heading and field in place and empty for me to fill.', 'Show me the formatting: title page, headings, spacing, and how a citation should look.', 'List the decisions I have to make before I can fill it in.']
        : ['Give me an outline down to the paragraph: what each one has to accomplish, in what order, and roughly how long it should run.', 'For each paragraph, say what kind of evidence belongs there, without choosing the evidence for me.', 'Set up the document: title page, headings, reference list skeleton, and a correctly formatted example citation I can copy the shape of.', 'List the questions I have to answer myself before I can write a word of it.'];
    case 'project':
      return ['Break the project into the pieces it actually has, in build order, with what "done" looks like for each.', 'Build the scaffolding: file or document structure, section headings, any table or template the deliverable needs.', 'Name the decisions and inputs only I can supply.'];
    case 'discussion':
      return ['In one line each, tell me what the prompt is really asking and what a full-credit post has to contain.', 'Give me a skeleton: the two or three moves the post should make, in order, and roughly how long each runs.', 'Ask me the two questions whose answers would become the substance of the post.'];
    case 'lab':
      return ['Lay out the report in the sections this lab wants, with what belongs in each and in what tense.', 'Build the data tables with the right columns, units, and significant figures, empty for my numbers.', 'Show me the worked shape of each calculation with the symbols but not my values, so I can put mine in.'];
    case 'homework':
      return ['Sort the problems by the method each one needs, and name the method.', 'For the first problem of each method, set up the work: the equation to start from, the units, and what is given versus what is being solved for. Stop before the arithmetic.', 'Tell me which class material covers each method.'];
    case 'quiz':
    case 'exam':
      return ['Turn the material below into a study plan for the time I have, heaviest on what I am weakest at.', 'Make me a one-page sheet of the formulas, definitions, and relationships worth knowing cold.', 'Then quiz me one question at a time and wait for my answer before telling me anything.'];
    default:
      return worksheet
        ? ['Build the worksheet or table the assignment describes, with every field in place and empty for me to fill.', 'Show me a filled-in example row using made-up data clearly marked as an example.', 'List what I have to gather before I can complete it.']
        : ['Tell me in two lines what this actually asks for.', 'Give me the first three concrete steps.', 'Build whatever structure or template the deliverable needs, empty.'];
  }
}

/** What Claude must not produce, named concretely for this kind of work. */
function localWithhold(item: Item): string[] {
  const text = `${item.title} ${item.notes ?? ''} ${item.plan?.asks ?? ''}`.toLowerCase();
  const worksheet = TEMPLATE.test(text);
  switch (item.type) {
    case 'paper':
      return worksheet ? ['Do not invent my content for the fields. The entries are mine.'] : ['Do not write my thesis, my claims, my analysis, or any body-paragraph prose.', 'Do not choose my sources or write my citations for real sources. Show me the shape of a citation and I will fill in the real one.'];
    case 'project':
      return ['Do not make the design decisions or write the conclusions.'];
    case 'discussion':
      return ['Do not write the post or the replies, or draft sentences I could paste. The opinion and the reasoning are the graded part.'];
    case 'lab':
      return ['Do not supply data, results, or the discussion of what they mean. The numbers are from my bench and the interpretation is mine.'];
    case 'homework':
      return ['Do not solve any problem or give me a final answer. Set up the first one of each kind and stop.'];
    case 'quiz':
    case 'exam':
      return ['Do not give me answers before I have tried. Ask, wait, then respond to what I said.'];
    default:
      return ['Do not produce the graded content itself. The judgments and the answers are mine.'];
  }
}

const KIND_LINE: Record<Item['type'], string> = {
  paper: 'a piece of writing that is graded on the thinking in it',
  project: 'a build with a deliverable',
  discussion: 'a graded discussion post',
  lab: 'a lab report',
  homework: 'a problem set',
  quiz: 'a quiz to prepare for',
  exam: 'an exam to prepare for',
  participation: 'a participation task',
  other: 'coursework',
};

/** The handoff derived from what is already known: works with no key and before any AI pass has run. */
export function localHandoff(item: Item, at = new Date().toISOString()): Handoff {
  return { kind: KIND_LINE[item.type], build: localBuild(item), withhold: localWithhold(item), format: formatRules(item), model: 'local', at };
}

const bullet = (lines: string[]) => lines.map((l) => `- ${l}`).join('\n');
const numbered = (lines: string[]) => lines.map((l, i) => `${i + 1}. ${l}`).join('\n');

/** Where the student is on it, in one line, so Claude does not start from the beginning when they have not. */
export function progressLine(item: Item, tz: string): string {
  const steps = item.steps ?? [];
  const done = steps.filter((s) => s.done);
  if (item.status === 'done') return 'I have finished it; I want a check, not a plan.';
  const parts: string[] = [];
  if (done.length) parts.push(`Done so far: ${done.map((s) => s.label).join(', ')}.`);
  const next = nextStep(steps.length ? steps : stepsFor(item));
  if (next) parts.push(`I am on: ${next.label}.`);
  if (!parts.length) parts.push('I have not started.');
  if (item.startedAt) parts.push(`I started it ${fmtDate(dateOf(item.startedAt, tz), 'short')}.`);
  return parts.join(' ');
}

/**
 * The whole prompt, assembled fresh so the dates and the progress are current, around the tailored half stored on
 * the item. One paste, no follow-up needed.
 */
export function handoffPrompt(item: Item, course: Course, ctx: HandoffContext, tz: string, today: string): string {
  const h = item.handoff ?? localHandoff(item);
  const due = dateOf(item.dueAt, tz);
  const time = fmtTime(item.dueAt, tz);
  const asks = item.plan?.asks?.trim() || item.brief?.asks.join(' ').trim() || '';
  // Halo's own rubric when the sync brought one; the inferred one only when it did not.
  const rubric = item.rubric?.criteria.length ? item.rubric.criteria.map((c) => ({ criterion: c.name, points: c.points, how: c.description ?? c.levels[0]?.description ?? '' })) : (item.brief?.rubric ?? []);
  const description = (item.notes ?? '').trim();
  const out: string[] = [];

  out.push(`I am a first-semester engineering student at Grand Canyon University. Help me set up this assignment so I can do the thinking myself. Read everything below before you answer.`);
  out.push(`\n## The assignment\n${course.code} ${course.name} — "${item.title}"\nIt is ${h.kind}. Due ${fmtDate(due, 'long')}${time !== '11:59 PM' ? ` at ${time}` : ''}, worth ${item.points} points${item.estimatedMinutes ? `, and I have about ${fmtMinutes(item.estimatedMinutes)} of work in mind for it` : ''}.${due < today ? ' It is already past its date.' : ''}`);
  if (h.format.length) out.push(`\nFormat it has to meet:\n${bullet(h.format)}`);
  if (description) out.push(`\nThe assignment says, in full:\n"""\n${description.slice(0, 6000)}\n"""`);
  if (asks) out.push(`\nWhat it asks for, as I understand it: ${asks}`);
  if (rubric.length) out.push(`\n## What earns points${item.rubric ? ' (the rubric it is graded against, from Halo)' : ''}\n${bullet(rubric.map((r) => `${r.criterion}${r.points !== null ? ` (${r.points} pts)` : ''}${r.how ? `: ${r.how}` : ''}`))}`);
  if (ctx.sources.length) out.push(`\n## My own class material that covers it\n${bullet(ctx.sources)}\nUse these where they help. I can open any of them; you cannot, so ask me to read something out rather than guessing at what it says.`);
  if (ctx.flagged.length) out.push(`\n## What my professor said about this\n${bullet(ctx.flagged)}`);
  out.push(`\n## Where I am\n${progressLine(item, tz)}${ctx.gradeNote ? ` ${ctx.gradeNote}` : ''}`);
  out.push(`\n## What I want from you\n${numbered(['In two lines, tell me what this assignment actually wants. Not a restatement of the prompt: what a marker is looking for.', ...h.build, 'End with the single next thing I should do, in one sentence.'])}`);
  out.push(`\n## What you must not do\n${bullet([...h.withhold, 'Do not hand me anything I could paste in as my own work. Everything you give me should be structure, method, or formatting that I then fill with my own thinking.'])}`);
  out.push(`\nThis is submitted through a system that checks for AI-written text, and my class grades the reasoning, so anything you write for me is worse than useless. Set the work up; leave the work to me.`);
  return out.join('\n');
}
