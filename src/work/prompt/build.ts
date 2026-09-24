import { dateOf, diffDays, fmtDate, fmtMinutes, fmtTime } from '../../domain/dates';
import type { Course, Item } from '../../domain/types';
import { formatRules } from '../handoff';
import { namesFor, quizFacts, type Excerpt, type Material } from './excerpts';
import type { PromptKind } from './kind';

/**
 * The prompt itself. It says what the student wants produced and hands over everything needed to produce it: the
 * assignment, the professor's own words, the class rules that apply, where the student is, and the excerpts. No
 * warnings and no list of things not to do; the asks are simply the ones that fit the work.
 */

export interface Requirement {
  text: string;
  quote: string | null;
  post: string | null;
  date: string | null;
}

export interface PromptInput {
  item: Item;
  course: Course;
  kind: PromptKind;
  material: Material;
  /** Graded items in this class so far, and the percentage across them. */
  grade: { graded: number; pct: number | null };
  /** Topics under the bar on graded work, weakest first. */
  weak: { topic: string; pct: number | null; graded: number }[];
  /** Free study time before it is due, from the schedule. */
  freeMinutes: number | null;
  /** Parts from announcements that attach to this assignment. */
  requirements: Requirement[];
  /** Standing class rules that apply to this kind of work. */
  rules: string[];
  /** What is already done on it, one line each. */
  done: string[];
  today: string;
  tz: string;
}

const bullets = (xs: string[]) => xs.map((x) => `- ${x}`).join('\n');
const numbered = (xs: string[]) => xs.map((x, i) => `${i + 1}. ${x}`).join('\n');
const section = (title: string, body: string) => (body.trim() ? `\n## ${title}\n${body}` : '');

function when(item: Item, today: string, tz: string): string {
  const due = dateOf(item.dueAt, tz);
  const time = fmtTime(item.dueAt, tz);
  const days = diffDays(today, due);
  const day = days === 0 ? 'today' : days === 1 ? 'tomorrow' : days < 0 ? `on ${fmtDate(due, 'long')}, which has passed` : `on ${fmtDate(due, 'long')}`;
  return time === '11:59 PM' ? day : `${day} at ${time}`;
}

/** "1 item graded so far, 98%": the size of the sample is part of the number. */
export function gradeLine(g: PromptInput['grade']): string | null {
  if (g.graded === 0 || g.pct === null) return null;
  return `${g.graded} item${g.graded === 1 ? '' : 's'} graded so far in this class, ${Math.round(g.pct)}%.`;
}

function quote(e: Excerpt): string {
  const head = [e.label, e.date].filter(Boolean).join(', ');
  return `[${head}]\n"""\n${e.text}\n"""`;
}

function materialBlock(m: Material, order: Excerpt['kind'][]): string {
  const byKind: Record<Excerpt['kind'], Excerpt[]> = { announcement: m.announcements, transcript: m.transcripts, slides: m.slides, syllabus: m.syllabus };
  const all = order.flatMap((k) => byKind[k]);
  return all.map(quote).join('\n\n');
}

function requirementsBlock(reqs: Requirement[]): string {
  return bullets(reqs.map((r) => (r.quote ? `"${r.quote}" (${[r.post, r.date].filter(Boolean).join(', ')})` : r.text)));
}

const rubricOf = (item: Item) =>
  item.rubric?.criteria.length
    ? item.rubric.criteria.map((c) => ({ name: c.name, points: c.points, how: c.description ?? c.levels[0]?.description ?? '' }))
    : (item.brief?.rubric ?? []).map((r) => ({ name: r.criterion, points: r.points, how: r.how }));

/** The question sentences and instructions inside an assignment description, one per line. */
export function subQuestions(description: string): string[] {
  const IMP = /^(discuss|explain|identify|describe|choose|reflect|review|read|include|provide|analy[sz]e|compare|evaluate|write|create|find|summari[sz]e|use|cite|add|develop|outline|draft|revise|explore|take|note|refine|expand|state|support|consider|select|respond|reply)\b/i;
  const out: string[] = [];
  for (const s of description.replace(/\s+/g, ' ').split(/(?<=[.?!])\s+/)) {
    const t = s.trim();
    if (t.length < 12) continue;
    if (t.endsWith('?') || IMP.test(t)) out.push(t);
  }
  return [...new Set(out)].slice(0, 14);
}


/** A sentence from the professor, with where it was posted. */
interface Said {
  sentence: string;
  where: string;
}

const LENGTH = /\b(?:at least|minimum(?: of)?|no (?:fewer|less) than|up to|between)?\s*(?:\d{1,3}(?:,\d{3})+|\d{2,5})\s*(?:\+|or more|[-–—]\s*(?:\d{1,3}(?:,\d{3})+|\d{2,5}))?\s*[- ]?words?\b/i;
const CITES = /\b(?:(?:at least|minimum(?: of)?)\s+)?(?:\d+|one|two|three|four|five)\s+(?:in-text\s+)?(?:scholarly\s+|peer[- ]reviewed\s+|credible\s+)?(?:citations?|sources?|references?)\b/i;

/**
 * Length and citation requirements the professor posted. These beat the assignment description, which is written
 * before the term and often revised in an announcement, and beat anything the app inferred.
 */
export function announcedFormat(p: Pick<PromptInput, 'material' | 'requirements' | 'item'>): { words: Said | null; sources: Said | null } {
  const said: Said[] = [];
  // Only posts that name this assignment. A length for the week's discussion posts is not a length for the paper.
  const names = namesFor(p.item.title);
  for (const a of p.material.announcements.filter((x) => names.some((re) => re.test(`${x.label}\n${x.text}`)))) {
    for (const s of a.text.replace(/\s+/g, ' ').split(/(?<=[.!?])\s+/)) said.push({ sentence: s.trim(), where: [a.label, a.date].filter(Boolean).join(', ') });
  }
  for (const r of p.requirements) said.push({ sentence: (r.quote ?? r.text).trim(), where: [r.post, r.date].filter(Boolean).join(', ') });
  return {
    words: said.find((x) => LENGTH.test(x.sentence)) ?? null,
    sources: said.find((x) => CITES.test(x.sentence)) ?? null,
  };
}

/**
 * The format rules, with the professor's announcement taking precedence over the description on length and
 * citations. When they disagree the prompt says so, rather than listing both and leaving the reader to guess.
 */
function formatWithOverrides(p: PromptInput, opts: { dropWords?: boolean } = {}): string[] {
  const fromDescription = formatRules(p.item);
  const ann = announcedFormat(p);
  const out: string[] = [];
  const descWords = fromDescription.find((r) => /words$/.test(r)) ?? null;
  const descSources = fromDescription.find((r) => /cited$/.test(r)) ?? null;
  for (const r of fromDescription) {
    if (ann.words && r === descWords) continue;
    if (ann.sources && r === descSources) continue;
    if (opts.dropWords && /words$/.test(r)) continue;
    out.push(r);
  }
  if (ann.words && !opts.dropWords) {
    out.push(`Length, from the announcement (${ann.words.where}): "${ann.words.sentence}"`);
    if (descWords) out.push(`The assignment description says ${descWords}. The announcement is more recent, so go by it.`);
  }
  if (ann.sources) {
    out.push(`Citations, from the announcement (${ann.sources.where}): "${ann.sources.sentence}"`);
    if (descSources) out.push(`The assignment description says ${descSources}. Go by the announcement.`);
  }
  return out;
}

function header(p: PromptInput, lead: string): string {
  const { item, course, today, tz } = p;
  const facts = [`Due ${when(item, today, tz)}`, item.points ? `${item.points} points` : null, gradeLine(p.grade)].filter(Boolean).join('. ');
  return `${lead}\n\n${course.code} ${course.name}: "${item.title}". ${facts}${facts.endsWith('.') ? '' : '.'}`;
}

const doneBlock = (p: PromptInput) => (p.done.length ? bullets(p.done) : 'Nothing yet.');

// ---- 1. Studying for a quiz or exam ------------------------------------------------------------------------

function study(p: PromptInput): string {
  const { item, material } = p;
  const facts = quizFacts(material.announcements.map((a) => a.text));
  const out: string[] = [];
  const time = p.freeMinutes && p.freeMinutes > 0 ? ` I have about ${fmtMinutes(p.freeMinutes)} to study before it.` : '';
  out.push(header(p, `I'm studying for a quiz and want to use my time well.`) + time);

  // Scope: the professor's announcement first, the course calendar second, and a conflict said out loud.
  const scope: string[] = [];
  if (facts.scope.length) scope.push(...facts.scope.map((s) => `From the announcement: "${s}"`));
  const filed = item.topic?.trim();
  if (filed) {
    if (facts.scope.length) {
      const mentioned = /topic\s*(\d+)/i.exec(filed)?.[1];
      const agrees = mentioned ? facts.scope.some((s) => new RegExp(`\\b(topic|chapter|ch\\.?)\\s*${mentioned}\\b`, 'i').test(s)) && !/\band\b/i.test(facts.scope.join(' ')) : false;
      if (!agrees) scope.push(`The course calendar files it under "${filed}". The announcement and the calendar don't say the same thing. Go by the announcement, and tell me if anything in "${filed}" falls outside what the announcement names.`);
    } else scope.push(`The course calendar files it under "${filed}". No announcement says what it covers, so treat that as the scope.`);
  }
  out.push(section('What it covers', bullets(scope)));

  const format = [
    facts.questions ? `${facts.questions}` : null,
    facts.minutes ? `${facts.minutes}` : null,
    ...facts.provided.map((s) => `Provided: "${s}"`),
    ...facts.bring.map((s) => `Bring: "${s}"`),
    item.flags.inClass ? 'Taken in person, in class.' : null,
    item.flags.timed ? 'Timed.' : null,
  ].filter((x): x is string => !!x);
  out.push(section('Format', bullets(format)));

  const weak = p.weak.length
    ? bullets(p.weak.map((w) => `${w.topic}: ${w.pct !== null ? `${w.pct}%` : 'missed in practice'}${w.graded ? ` across ${w.graded} graded item${w.graded === 1 ? '' : 's'}` : ''}`))
    : p.grade.graded > 0
      ? `Nothing graded so far is below 75%, but that is only ${p.grade.graded} item${p.grade.graded === 1 ? '' : 's'}. Weight by what the professor stresses in the material below.`
      : 'Nothing graded yet, so weight by what the professor stresses in the material below.';
  out.push(section('Where I am weakest', weak));
  if (p.requirements.length) out.push(section('Also from announcements', requirementsBlock(p.requirements)));
  if (p.rules.length) out.push(section('Class rules that apply', bullets(p.rules)));
  out.push(section('Already done', doneBlock(p)));
  out.push(section('My class material', materialBlock(material, ['announcement', 'transcript', 'slides', 'syllabus'])));

  const count = facts.questions ? /\d+/.exec(facts.questions)![0] : '15';
  const focus = p.weak.length ? 'my weakest topics' : 'what the professor stresses in the material above';
  out.push(
    section(
      'What I want',
      numbered([
        `A study plan for the time I have${p.freeMinutes ? ` (about ${fmtMinutes(p.freeMinutes)})` : ''}, in blocks, with the most time on ${focus}.`,
        'A one-page sheet of the formulas and key concepts it covers, in the notation my professor uses in the material above.',
        `A practice worksheet I can print or paste into Google Docs: about ${count} questions in the same style and difficulty as the quiz, spread across the scope and heaviest on ${focus}, numbered, with space to work each one. Put the worked answers on a separate final page headed "Answers", every step shown.`,
        'Then offer to quiz me one question at a time. After each answer, tell me whether it is right and why.',
      ]),
    ),
  );
  return out.filter(Boolean).join('\n');
}

// ---- 2. Graded work in the major -----------------------------------------------------------------------------

function major(p: PromptInput, lab: boolean): string {
  const { item } = p;
  const out: string[] = [];
  out.push(header(p, lab ? `I'm writing up a lab report and want the whole structure ready so I only add my data and analysis.` : `I'm working on this and want to learn the method well enough to do it myself.`));
  if (item.notes?.trim()) out.push(section('The assignment', `"""\n${item.notes.trim().slice(0, 5000)}\n"""`));
  const rubric = rubricOf(item);
  if (rubric.length) out.push(section('What earns points', bullets(rubric.map((r) => `${r.name}${r.points !== null ? ` (${r.points} pts)` : ''}${r.how ? `: ${r.how}` : ''}`))));
  if (p.requirements.length) out.push(section('Also from announcements', requirementsBlock(p.requirements)));
  const rules = [...formatWithOverrides(p), ...p.rules];
  if (rules.length) out.push(section('Class rules that apply', bullets([...new Set(rules)])));
  out.push(section('Already done', doneBlock(p)));
  out.push(section('My class material', materialBlock(p.material, ['announcement', 'transcript', 'slides', 'syllabus'])));
  out.push(
    section(
      'What I want',
      numbered(
        lab
          ? [
              'The full report template, built to the rubric above: title block, every heading in order, data table layouts with column headers and units, figure and caption placeholders, and the formatting the class requires. Mark where my data, calculations and analysis go.',
              'For each calculation the report needs: the formula, what each symbol means, and a worked example with made-up numbers.',
              'When I paste my draft back, check it against the rubric one criterion at a time.',
            ]
          : [
              'For each kind of problem in this assignment: the setup, the method step by step, and the formulas it needs, in the notation my class uses.',
              'Worked examples on similar problems with different numbers, every step shown. Not the assigned problems themselves.',
              'When I paste my own work back, check the method line by line and tell me where it goes wrong and why.',
            ],
      ),
    ),
  );
  return out.filter(Boolean).join('\n');
}

// ---- 3. The general-education requirements ------------------------------------------------------------------

function gened(p: PromptInput): string {
  const { item } = p;
  const out: string[] = [];
  out.push(header(p, `I'm working on this and want every piece of structure ready so I can spend my time on the writing.`));
  const description = item.notes?.trim() ?? '';
  if (description) out.push(section('The assignment', `"""\n${description.slice(0, 6000)}\n"""`));
  const parts = subQuestions(description);
  if (parts.length > 1) out.push(section('Every part it asks for', numbered(parts)));
  const rubric = rubricOf(item);
  if (rubric.length) out.push(section('Rubric', bullets(rubric.map((r) => `[ ] ${r.name}${r.points !== null ? ` (${r.points} pts)` : ''}${r.how ? `: ${r.how}` : ''}`))));
  if (p.requirements.length) out.push(section('Also from announcements', requirementsBlock(p.requirements)));
  const fmt = formatRules(item);
  const rules = [...new Set([...formatWithOverrides(p), ...p.rules])];
  if (rules.length) out.push(section('Class rules that apply', bullets(rules)));
  out.push(section('Already done', doneBlock(p)));
  out.push(section('My class material', materialBlock(p.material, ['announcement', 'syllabus', 'transcript', 'slides'])));
  // The length the skeleton adds up to: the announcement's when there is one, else the description's.
  const posted = announcedFormat(p).words;
  const words = posted ? null : fmt.find((f) => /words$/.test(f));
  const needsSources = /\b(source|reference|citation|cite|scholarly|peer[- ]reviewed)\b/i.test(description) || item.type === 'paper';
  const asks = [
    'Turn every part above into a checklist so nothing gets missed.',
    rubric.length ? 'Turn the rubric into a checklist I can tick as I write.' : null,
    `The full document skeleton in APA 7: a title page with the fields filled from what's above, every heading in order, and a word-count target for each section${posted ? ' that meets the length in the announcement' : words ? ` that adds up to the ${words.replace(/^\w/, (c) => c.toLowerCase())}` : ''}.`,
    needsSources ? 'Credible sources I can use, peer-reviewed or from the GCU library where possible: a line on what each one supports, and its APA 7 reference formatted and ready to paste.' : null,
    'When I paste my draft back, proofread it and check it against every rubric line, quoting the line each note refers to.',
  ].filter((x): x is string => !!x);
  out.push(section('What I want', numbered(asks)));
  return out.filter(Boolean).join('\n');
}

function genedDq(p: PromptInput): string {
  const { item } = p;
  const out: string[] = [];
  out.push(header(p, `I'm writing a discussion post and want the requirements and an outline in one place.`));
  const description = item.notes?.trim() ?? '';
  if (description) out.push(section('The prompt', `"""\n${description.slice(0, 4000)}\n"""`));
  const parts = subQuestions(description);
  if (parts.length > 1) out.push(section('Every part it asks for', numbered(parts)));
  if (p.requirements.length) out.push(section('Requirements from announcements', requirementsBlock(p.requirements)));
  const rules = [...new Set([...formatWithOverrides(p), ...p.rules])];
  if (rules.length) out.push(section('Class rules that apply', bullets(rules)));
  const rubric = rubricOf(item);
  if (rubric.length) out.push(section('Rubric', bullets(rubric.map((r) => `[ ] ${r.name}${r.points !== null ? ` (${r.points} pts)` : ''}${r.how ? `: ${r.how}` : ''}`))));
  out.push(section('Already done', doneBlock(p)));
  out.push(section('My class material', materialBlock(p.material, ['announcement', 'syllabus', 'transcript', 'slides'])));
  out.push(
    section(
      'What I want',
      numbered([
        'The exact requirements in one list: word count, citations and their format, when the initial post is due, and how many replies are due on how many days.',
        'A bullet outline of the points my post should cover, one line each, tied to each part of the prompt and to the reading it names.',
        'A credible source for any claim the post will need to support, with its APA 7 reference.',
        rubric.length ? 'When I paste my post back, check it against that list and the rubric.' : 'When I paste my post back, check it against that list.',
      ]),
    ),
  );
  return out.filter(Boolean).join('\n');
}

/** Assignments that tell the student to use an AI tool: do exactly that part, in order, and cite it as required. */
function aiRequired(p: PromptInput): string {
  const { item } = p;
  const out: string[] = [];
  out.push(header(p, `This assignment has me use an AI tool for part of it. You're that tool.`));
  const description = item.notes?.trim() ?? '';
  if (description) out.push(section('The assignment', `"""\n${description.slice(0, 7000)}\n"""`));
  const prompts = [...description.matchAll(/[“"]([^”"]{30,})[”"]/g)].map((m) => m[1].trim());
  if (prompts.length) out.push(section('The prompts it tells me to use', numbered(prompts.map((x) => `"${x}"`))));
  if (p.requirements.length) out.push(section('Also from announcements', requirementsBlock(p.requirements)));
  const rules = [...new Set([...formatWithOverrides(p, { dropWords: true }), ...p.rules])];
  if (rules.length) out.push(section('Class rules that apply', bullets(rules)));
  out.push(section('Already done', doneBlock(p)));
  out.push(section('About me, for the parts that ask for personal details', `First-year BS Mechanical Engineering student at Grand Canyon University. Ask me for anything else the assignment needs (hometown, background, campus involvement, goals) before you use it.`));
  out.push(
    section(
      'What I want',
      numbered([
        'Do each step the assignment gives to the AI tool, in order, using its prompts exactly as written. Label each output with the step it answers.',
        'Stop and ask me for the personal details a step needs before running it.',
        'Mark where the sections the assignment says to write in my own words go, with their word counts, so I can add them.',
        'Give me the APA 7 reference and in-text citation for this conversation in the form the assignment asks for.',
      ]),
    ),
  );
  return out.filter(Boolean).join('\n');
}

export function buildPrompt(p: PromptInput): string {
  switch (p.kind) {
    case 'study':
      return study(p);
    case 'lab':
      return major(p, true);
    case 'major':
      return major(p, false);
    case 'gened-dq':
      return genedDq(p);
    case 'ai-required':
      return aiRequired(p);
    default:
      return gened(p);
  }
}
