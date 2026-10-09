import { dateOf, fmtDate, fmtTime } from '../domain/dates';
import type { TodoLine } from '../domain/sheet';
import { TYPE_LABELS, type Course, type Item } from '../domain/types';
import { terms } from '../library/search';

/**
 * The help kit (George, 2026-10-08): one zip a student hands to an AI tutor, about one assignment only. The text here
 * is pure: what goes in, in what words, from what the planner already holds. The bytes of Halo's files come through
 * the extension (kit/extFiles.ts); without it the same files are listed as links.
 *
 * Second pass (George's test on the real zip, 2026-10-09): only real AI rules are quoted, never a sentence that merely
 * says "AI"; the syllabus part appears only on a confident match; topic files are ranked by how related they are and
 * the clearly unrelated ones (another course's code, a DQ's reading, another assignment's) stay out; a file attached to
 * an announcement about the assignment is a second source for the same file; earlier work to bring in is worded as
 * such, not as a task; the type is the real one (a PowerPoint is a presentation).
 */
export interface KitAnnouncement {
  id: string;
  title: string;
  text: string;
  author: string | null;
  publishedAt: string | null;
  /** Files attached to the post. */
  resources?: { id: string; name: string; kind: string | null; type: string | null }[];
}
export interface KitResource {
  title: string;
  unit: string | null;
  description?: string | null;
  files: { id: string; name: string; kind: string | null; type: string | null }[];
}
export interface KitOutcome {
  /** Resource ids whose bytes are in /files. */
  got: string[];
  /** Resource id → why it could not be fetched. */
  failed: Record<string, string>;
  /** No extension on this device: every Halo file is a link with a note. */
  noExtension: boolean;
}
export interface KitInput {
  item: Item;
  /** What the fetch managed; absent while the text is being prepared. */
  outcome?: KitOutcome;
  course: Course;
  tz: string;
  /** The sheet's What to do, as the student sees it. */
  lines: TodoLine[];
  /** Posts about this assignment: where its parts, origin or moved date came from, or that carry one of its files. */
  announcements: KitAnnouncement[];
  /** Course materials from the same topic as the assignment. */
  resources: KitResource[];
  /** The whole syllabus on file, or nothing. */
  syllabusText: string | null;
  /** The course's other assignments, so a reading or a syllabus paragraph about one of them is not mistaken for this one. */
  siblings?: { title: string; label: string }[];
  /** Other words of the assignment's own: its prerequisites and plan, which name readings by author and title. */
  mentions?: string;
}

export interface KitFile {
  /** The file name inside /files, or the link's label. */
  name: string;
  /** Halo's resource id, for a file the extension can fetch. Null for a link. */
  resourceId: string | null;
  /** Other resource ids that hold the same file (an announcement's copy): tried when the first fails. */
  altIds: string[];
  url: string | null;
  why: string;
}
export interface Kit {
  zipName: string;
  startHere: string;
  rubricMd: string | null;
  announcementsMd: string | null;
  /** Halo files worth fetching, most related first. */
  files: KitFile[];
  /** Everything else: readings behind the library, publisher sites, videos, links in the instructions. */
  links: KitFile[];
  policy: { quote: string; source: string }[];
  /** A link (or file name) the syllabus gives for the school's AI statement. */
  policyLink: string | null;
  ownData: boolean;
}

const AI_WORDS = /\b(AI|A\.I\.|artificial intelligence|ChatGPT|Chat GPT|generative|large language models?|LLMs?|Copilot|Gemini|Claude)\b/;
/** A sentence is a rule when it says what is or is not allowed, not when it merely names a reading or an assignment. */
const RULE_WORDS = /\b(may|may not|must|must not|should|should not|cannot|can not|can't|allowed|not allowed|permitted|not permitted|prohibit(?:ed|s)?|forbidden|banned|acceptable|unacceptable|encouraged|required|expected|disclos(?:e|ed|ure)|cite|cited|citation|acknowledg(?:e|ed|ement)|academic integrity|plagiarism|misconduct|penalt(?:y|ies)|violation|policy|permission)\b/i;
/** A paragraph that opens the syllabus's policy on AI, or the integrity section it sits in. */
const POLICY_HEADING = /(\b(AI|artificial intelligence|generative)\b.*\b(policy|statement|use|usage|guideline|guidelines|tools?)\b)|(\b(policy|statement|guidelines?)\b.*\b(AI|artificial intelligence)\b)|academic integrity|academic honesty/i;
/** "AI-Assisted Career Reflection": an assignment's name, not a mention of AI. */
const AI_TITLE = /\bAI-(?:[A-Z][\w']*)(?:\s+[A-Z][\w']*){0,5}/g;
const POLICY_LINK = /https?:\/\/[^\s<>"')\]]*(?:AI[-_ ]?Statement|StudentAI|AI[-_]?Policy|artificial[-_]?intelligence)[^\s<>"')\]]*/i;
const POLICY_FILE = /\b[\w-]*(?:AI[-_]?Statement|StudentAI)[\w-]*\.pdf\b/i;
const OWN_DATA = /\b(time logs?|reflect(?:ion|ions|ive)?|journal|your (?:own )?(?:experience|experiences|schedule|budget|habits|data|results|life|goals|values)|personal (?:experience|story|example|statement)|interview|survey|observ(?:e|ation|ations)|self[- ]assessment)\b/i;
const NUM = '(?:\\d[\\d,]*|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fifteen|twenty)';
const FORMAT = new RegExp(`\\b(${NUM}\\s*(?:to|-|–|or)\\s*${NUM}\\s*(?:words?|slides?|pages?|paragraphs?|sources?|references?|citations?)|${NUM}\\s*(?:words?|slides?|pages?|paragraphs?|sources?|references?|citations?)|APA|MLA|Chicago|double[- ]spaced|Times New Roman|12[- ]point|PowerPoint|PPTX|\\.pptx|\\.docx|PDF)\\b`, 'i');
const URLS = /https?:\/\/[^\s<>"')\]]+/g;
const OFFSITE = /oclc\.org|ebscohost|gale\.com|infobase|gcumedia|youtube|youtu\.be|vimeo|pearson|mheducation|cengage|wiley|lopes\.idm/i;
const COURSE_CODE = /\b([A-Z]{2,4})-(\d{3}[A-Z]?)\b/g;
const DQ_READING = /\bdiscussion question\b|\bDQ\s*\d/i;
/** Words that every assignment shares; they say nothing about which one a paragraph is about. */
const GENERIC = new Set(['assignment', 'assignments', 'topic', 'week', 'module', 'part', 'final', 'class', 'course', 'project', 'paper', 'essay', 'discussion', 'question', 'quiz', 'unv', 'gcu', 'the', 'and', 'for', 'your']);
const keyTerms = (s: string): string[] => terms(s).filter((w) => !GENERIC.has(w) && !/^\d+$/.test(w));
const sentences = (text: string): string[] => text.replace(/\s+/g, ' ').split(/(?<=[.!?])\s+(?=[A-Z"“(])/).map((s) => s.trim()).filter(Boolean);
const paragraphs = (text: string): string[] => text.split(/\n{2,}|\r?\n(?=[A-Z#•-])/).map((p) => p.trim()).filter(Boolean);
const mentionsAi = (s: string): boolean => AI_WORDS.test(s.replace(AI_TITLE, ''));

export interface PolicySource {
  title: string;
  text: string;
  /** Where the words come from: the assignment's own text and announcements need a rule in the sentence; the syllabus needs a policy section. */
  kind: 'assignment' | 'announcement' | 'syllabus';
}

/**
 * Real rules about AI, word for word: a sentence that both names AI and says what is or is not allowed, from the
 * assignment's text or an announcement; or any AI sentence inside the syllabus's AI/integrity policy section. Never a
 * reading-list line, another assignment's description, or a sentence that only has the word in it.
 */
export function findAiPolicy(sources: PolicySource[]): { quote: string; source: string }[] {
  const out: { quote: string; source: string }[] = [];
  const push = (quote: string, source: string) => {
    if (out.length < 8 && !out.some((o) => o.quote === quote)) out.push({ quote, source });
  };
  for (const s of sources) {
    if (s.kind === 'syllabus') {
      let heading: string | null = null;
      for (const p of paragraphs(s.text)) {
        // A heading: short, title-like, no sentence end. A short sentence is body text under the heading before it.
        const isHeading = p.length < 100 && !/[.!?:]$/.test(p) && p.split(/\s+/).length <= 10;
        if (isHeading) heading = p;
        const inPolicy = (heading !== null && POLICY_HEADING.test(heading)) || (isHeading && POLICY_HEADING.test(p));
        if (!inPolicy) continue;
        for (const line of sentences(p)) if (mentionsAi(line) && (RULE_WORDS.test(line) || !isHeading)) push(line, s.title);
      }
    } else {
      for (const line of sentences(s.text)) if (mentionsAi(line) && RULE_WORDS.test(line)) push(line, s.title);
    }
  }
  return out;
}

/** The school's AI statement, when a source links or names it. */
export function findPolicyLink(texts: string[]): string | null {
  for (const t of texts) {
    const url = t.match(POLICY_LINK)?.[0];
    if (url) return url;
  }
  for (const t of texts) {
    const file = t.match(POLICY_FILE)?.[0];
    if (file) return file;
  }
  return null;
}

export const needsOwnData = (text: string): boolean => OWN_DATA.test(text);

/** "1,200 to 1,500 words", "APA", "10 slides": the format rules the text names, once each. */
export function formatRules(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(new RegExp(FORMAT.source, 'gi'))) {
    const v = m[0].replace(/\s+/g, ' ');
    if (!out.some((x) => x.toLowerCase() === v.toLowerCase())) out.push(v);
  }
  return out.slice(0, 10);
}

/** How many of the assignment's own words a text carries. */
const overlap = (text: string, words: string[]): number => {
  const low = text.toLowerCase();
  return words.filter((w) => low.includes(w)).length;
};

/**
 * The part of the syllabus about this exact assignment: the paragraph that names it (its short name, or most of the
 * distinctive words of its title) and what follows until the next topic or another assignment starts. No confident
 * match, no section.
 */
export function syllabusSection(text: string | null, item: Pick<Item, 'title' | 'label' | 'topic'>, siblings: { title: string; label: string }[] = []): string | null {
  if (!text) return null;
  const paras = paragraphs(text).filter((p) => p.length >= 20);
  if (paras.length === 0) return null;
  const words = keyTerms(item.title);
  const label = item.label.trim().toLowerCase();
  const others = siblings.filter((s) => s.title !== item.title).map((s) => ({ label: s.label.trim().toLowerCase(), words: keyTerms(s.title) }));
  const fits = (low: string, o: { label: string; words: string[] }): boolean => (o.label.length >= 6 && low.includes(o.label)) || (o.words.length > 1 && overlap(low, o.words) >= Math.ceil(o.words.length * 0.7));
  const confident = (p: string): boolean => {
    const low = p.toLowerCase();
    const mine = overlap(low, words);
    if (!(label.length >= 6 && low.includes(label)) && !(words.length > 0 && mine >= Math.max(2, Math.ceil(words.length * 0.7)))) return false;
    // A paragraph that fits another assignment better is about that one.
    return !others.some((o) => fits(low, o) && overlap(low, o.words) > mine);
  };
  const i = paras.findIndex(confident);
  if (i < 0) return null;
  const heading = /^(topic|week|module|unit)\s*\d+/i;
  const out: string[] = [paras[i]];
  for (let k = i + 1; k < paras.length && out.length < 4; k++) {
    const p = paras[k];
    if (heading.test(p) || others.some((o) => fits(p.toLowerCase(), o))) break;
    out.push(p);
  }
  const take = out.join('\n\n');
  return take.length > 2000 ? `${take.slice(0, 2000)}…` : take;
}

/** The kind of work it really is, from its words; Halo's coarse type is only the fallback. */
export function kitType(item: Pick<Item, 'title' | 'notes' | 'type' | 'haloType'>): string {
  const text = `${item.title} ${item.notes ?? ''}`;
  const real = /\b(powerpoint|slides?|slide deck|presentation)\b/i.test(text) ? 'Presentation' : /\bvideo\b/i.test(item.title) ? 'Video' : /\b(excel|spreadsheet)\b/i.test(item.title) ? 'Spreadsheet' : /\b(reflection|journal)\b/i.test(item.title) ? 'Reflection' : TYPE_LABELS[item.type];
  const halo = item.haloType ? item.haloType.charAt(0) + item.haloType.slice(1).toLowerCase() : null;
  return halo && halo.toLowerCase() !== real.toLowerCase() ? `${real} (Halo lists it as ${/^[AEIOU]/.test(halo) ? 'an' : 'a'} ${halo})` : real;
}

/** The first word of a line that is something to do, as opposed to something to bring in from earlier work. */
const IMPERATIVE = /^(read|watch|review|complete|do|finish|open|write|submit|post|bring|include|attach|download|install|take|study|check|print)\b/i;
const lowerFirst = (s: string): string => (/^[A-Z][a-z]/.test(s) ? s.charAt(0).toLowerCase() + s.slice(1) : s);
const isBringIn = (l: TodoLine): boolean => l.kind === 'pre' && !IMPERATIVE.test(l.text);
/** A What-to-do line in the kit's words: earlier work is brought in, not done again. */
export const kitLine = (l: TodoLine): string => (isBringIn(l) ? `Bring in your ${lowerFirst(l.text)}` : l.text);

const safe = (s: string): string => s.replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim();
export const kitZipName = (course: Course, item: Item): string => `${safe(course.code)} ${safe(item.label || item.title)} - help kit.zip`;

const md = (s: string | null | undefined): string => (s ?? '').replace(/\r/g, '').trim();
const strip = (html: string | null | undefined): string => (html ?? '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
/** "UNV-106-RS-T5Walkthrough (1).docx" and "UNV-106-RS-T5Walkthrough.docx" are one file. */
export const fileKey = (name: string): string => name.toLowerCase().replace(/\.[a-z0-9]{2,5}$/, '').replace(/\s*\(\d+\)\s*$/, '').replace(/[\s_-]+/g, '');

/**
 * Which of the topic's materials belong in this assignment's kit, most related first. Out: a file named for another
 * course, a reading the professor tied to a discussion question (and a reading with the same name), and anything that
 * fits another assignment better.
 */
/** Words that name a reading rather than describe one: an author's surname, a title word. Not "read", "chapter", "video". */
const READING_NOISE = new Set(['read', 'reading', 'chapter', 'video', 'watch', 'article', 'film', 'films', 'media', 'group', 'press', 'journal', 'review', 'university', 'collection', 'resource', 'resources', 'topic', 'from', 'this', 'that', 'with', 'about']);

export function rankResources(resources: KitResource[], item: Pick<Item, 'title' | 'notes' | 'label'>, course: Pick<Course, 'code'>, siblings: { title: string; label: string }[] = [], mentions = ''): { resource: KitResource; score: number; named: boolean }[] {
  const mine = keyTerms(`${item.title} ${item.label}`);
  const body = keyTerms(md(item.notes)).slice(0, 40);
  // What the assignment itself, its What-to-do lines and its prerequisites name (an author, a title): never weak.
  const named = new Set(keyTerms(`${md(item.notes)} ${mentions}`).filter((w) => w.length >= 4 && !READING_NOISE.has(w)));
  const isNamed = (r: KitResource): boolean => keyTerms(`${r.title} ${strip(r.description)}`).some((w) => w.length >= 4 && !READING_NOISE.has(w) && named.has(w));
  const others = siblings.filter((s) => s.title !== item.title).map((s) => keyTerms(`${s.title} ${s.label}`));
  const text = (r: KitResource) => `${r.title} ${strip(r.description)}`;
  const dq = resources.filter((r) => DQ_READING.test(text(r)) && !/\bassignment\b/i.test(text(r)));
  const dqTerms = dq.map((r) => keyTerms(r.title));
  const out: { resource: KitResource; score: number; named: boolean }[] = [];
  for (const r of resources) {
    const t = text(r);
    const names = r.files.map((f) => f.name).join(' ');
    if ([...names.matchAll(COURSE_CODE)].some((m) => `${m[1]}-${m[2]}`.toUpperCase() !== course.code.toUpperCase())) continue;
    if (dq.includes(r)) continue;
    const own = keyTerms(r.title);
    if (own.length > 0 && dqTerms.some((d) => own.every((w) => d.includes(w)))) continue;
    const forMe = overlap(t, mine);
    if (others.some((o) => overlap(t, o) > forMe && overlap(t, o) >= 2)) continue;
    // A resource the professor tied to "the assignment" outranks a reading that merely shares a word with the title.
    const score = forMe * 3 + (/\bassignment\b/i.test(t) ? 5 : 0) + Math.min(3, overlap(t, body)) + (r.files.some((f) => (f.kind ?? '').toUpperCase() === 'FILE') ? 1 : 0);
    out.push({ resource: r, score, named: isNamed(r) });
  }
  return out.sort((a, b) => b.score + (b.named ? 1 : 0) - (a.score + (a.named ? 1 : 0)));
}

export function buildKit(input: KitInput): Kit {
  const { item, course, tz, lines, announcements, resources, syllabusText, outcome, siblings = [], mentions = '' } = input;
  const named = `${mentions} ${lines.map((l) => l.text).join(' ')} ${(item.plan?.prerequisites ?? []).map((p) => p.text).join(' ')} ${item.plan?.asks ?? ''}`;
  const files: KitFile[] = [];
  const links: KitFile[] = [];
  const seen = new Map<string, KitFile>();
  const add = (f: KitFile) => {
    const k = f.url ? f.url.toLowerCase() : fileKey(f.name);
    const had = seen.get(k);
    if (had) {
      // The same file from a second place: one entry, the other id in reserve.
      if (f.resourceId && had.resourceId && f.resourceId !== had.resourceId && !had.altIds.includes(f.resourceId)) had.altIds.push(f.resourceId);
      return;
    }
    seen.set(k, f);
    (f.resourceId ? files : links).push(f);
  };
  for (const a of item.attachments ?? []) if (a.resourceId) add({ name: a.title || 'attachment', resourceId: a.resourceId, altIds: [], url: null, why: 'Attached to the assignment in Halo.' });
  for (const { resource: r, score, named: isNamed } of rankResources(resources, item, course, siblings, named)) {
    const about = strip(r.description);
    for (const f of r.files) {
      const isUrl = /^https?:\/\//i.test(f.name) || (f.kind ?? '').toUpperCase() === 'URL';
      if (isUrl) add({ name: r.title, resourceId: null, altIds: [], url: f.name, why: `A ${OFFSITE.test(f.name) ? 'reading behind the library or a publisher site' : 'reading'} from the same topic (${r.unit ?? 'this topic'})${score > 0 || isNamed ? '' : '; may not bear on this assignment'}${about ? `: ${about.slice(0, 160)}` : '.'}` });
      else add({ name: f.name || r.title, resourceId: f.id, altIds: [], url: null, why: `From the same topic in Halo (${r.unit ?? 'this topic'}): ${r.title}${about ? ` — ${about.slice(0, 160)}` : ''}` });
    }
  }
  for (const a of announcements) {
    for (const f of a.resources ?? []) {
      if ((f.kind ?? '').toUpperCase() === 'URL' || /^https?:\/\//i.test(f.name)) add({ name: a.title, resourceId: null, altIds: [], url: f.name, why: `Linked in the announcement "${a.title}".` });
      else add({ name: f.name, resourceId: f.id, altIds: [], url: null, why: `Attached to the announcement "${a.title}"${a.publishedAt ? ` (${fmtDate(dateOf(a.publishedAt, tz), 'short')})` : ''}.` });
    }
  }
  for (const u of md(item.notes).match(URLS) ?? []) add({ name: u, resourceId: null, altIds: [], url: u, why: 'Linked in the instructions.' });
  files.splice(8);
  links.splice(10);

  const policy = findAiPolicy([
    { title: 'the assignment instructions', text: md(item.notes), kind: 'assignment' },
    ...announcements.map((a) => ({ title: `announcement "${a.title}"`, text: a.text, kind: 'announcement' as const })),
    ...(syllabusText ? [{ title: `${course.code} syllabus`, text: syllabusText, kind: 'syllabus' as const }] : []),
  ]);
  const policyLink = findPolicyLink([syllabusText ?? '', ...announcements.map((a) => a.text), md(item.notes)]);
  const ownData = needsOwnData(`${item.title} ${md(item.notes)} ${lines.map((l) => l.text).join(' ')}`);
  const rules = formatRules(`${md(item.notes)} ${lines.map((l) => l.text).join('. ')}`);
  const section = syllabusSection(syllabusText, item, siblings);
  const due = `${fmtDate(dateOf(item.dueAt, tz), 'long')} at ${fmtTime(item.dueAt, tz)}`;
  const rubric = item.rubric?.criteria.length ? item.rubric.criteria : [];
  const tasks = lines.filter((l) => !isBringIn(l));
  const bring = lines.filter(isBringIn);

  const quotes = policy.map((p) => p.quote).join(' ');
  const policyBlock = [
    policy.length > 0 ? "## This class's rules on AI (word for word)" : "## This class's rules on AI",
    ...(policy.length > 0
      ? [...policy.map((p) => `> "${p.quote}"\n> — ${p.source}`), '', /\b(required|encouraged|allowed|may use|permitted|welcome)\b/i.test(quotes) && !/\b(not|never|no|prohibit\w*|forbid\w*|banned|cannot)\b/i.test(quotes) ? 'The class allows or asks for AI use within these rules. Stay inside them.' : 'Read these before helping. If they forbid something, do not do it.']
      : [policyLink ? 'No AI rule is written in this assignment, its announcements, or the syllabus itself; the syllabus points to the school statement below. Until read: help only (explain, plan, give feedback, check against the rubric). Do not write the submission.' : 'No AI policy found, check with your instructor. Until then: help only (explain, plan, give feedback, check against the rubric). Do not write the submission.']),
    policyLink ? `The school's AI statement: ${policyLink}${/^https?:/.test(policyLink) ? '' : ' (named in the syllabus; open it in Halo)'}` : '',
  ]
    .filter((l) => l !== '')
    .join('\n');

  const startHere = [
    `# Help kit: ${item.label || item.title}`,
    `${course.code} ${course.name}${course.instructors[0]?.name ? ` · ${course.instructors[0].name}` : ''} · made by Halo+ on ${fmtDate(dateOf(new Date().toISOString(), tz), 'long')}`,
    '',
    policyBlock,
    '',
    '## For the tutor: paste this whole file, then the files',
    'You are a tutor for a college student working on the assignment below. Your job is to help them LEARN and PLAN it:',
    '- explain the ideas and the instructions in plain words, and answer questions about the readings in this kit;',
    '- help them plan the work against the due date, in steps they can tick off;',
    '- give feedback on their drafts and check them against the rubric, pointing at what to fix and why;',
    '- help with format (citations, structure, slide order) when asked.',
    'Do NOT write the submission or parts of it for them to paste in. If they ask you to, offer an outline, a plan or feedback on their own draft instead.',
    ownData ? "- This assignment needs the student's OWN material (their experiences, reflections, logs, data). Ask them for it and work from what they give you. Never invent it." : '',
    '',
    '## The assignment',
    `- Class: ${course.code} ${course.name}`,
    `- Title: ${item.title}`,
    `- Type: ${kitType(item)}`,
    `- Due: ${due}`,
    `- Worth: ${item.points} points`,
    rules.length ? `- Format rules named in the instructions: ${rules.join(', ')}` : '',
    '',
    '## Instructions (from Halo)',
    md(item.notes) || '(Halo gave no description.)',
    '',
    tasks.length ? ['## What to do (as Halo+ lists it)', ...tasks.map((l) => `- [${l.done ? 'x' : ' '}] ${kitLine(l)} (${l.tag})`)].join('\n') : '',
    '',
    bring.length ? ['## Bring in from earlier work (not tasks: things that go into this one)', ...bring.map((l) => `- ${kitLine(l)} (${l.tag})`)].join('\n') : '',
    '',
    rubric.length ? ['## Rubric', ...rubric.map((c) => `- ${c.name}${c.points !== null ? ` (${c.points} pts)` : ''}${c.description ? `: ${c.description}` : ''}`), 'The full rubric is in rubric.md.'].join('\n') : '',
    '',
    section ? ['## From the syllabus (only the part about this assignment)', section].join('\n') : '',
    '',
    announcements.length ? ['## Announcements that apply', ...announcements.map((a) => `- "${a.title}"${a.publishedAt ? ` (${fmtDate(dateOf(a.publishedAt, tz), 'short')})` : ''}`), 'Their full text is in announcements.md.'].join('\n') : '',
    '',
    files.length && !outcome ? ['## Files in this kit (in /files)', ...files.map((f) => `- ${f.name}: ${f.why}`)].join('\n') : '',
    outcome && files.some((f) => outcome.got.includes(f.resourceId!)) ? ['## Files in this kit (in /files)', ...files.filter((f) => outcome.got.includes(f.resourceId!)).map((f) => `- ${f.name}: ${f.why}`)].join('\n') : '',
    outcome && files.some((f) => !outcome.got.includes(f.resourceId!))
      ? [
          outcome.noExtension ? '## Files to download yourself (download files on a computer with the Halo+ extension)' : '## Files that could not be fetched (open them in Halo)',
          ...files.filter((f) => !outcome.got.includes(f.resourceId!)).map((f) => `- ${f.name}: ${f.why}${outcome.failed[f.resourceId!] ? ` (${outcome.failed[f.resourceId!]})` : ''}`),
          `Find them in Halo under ${course.code}${item.topic ? ` → ${item.topic}` : ''}.`,
        ].join('\n')
      : '',
    '',
    links.length ? ['## Links (not included: behind a login, a publisher, or a video)', ...links.map((f) => `- ${f.name}: ${f.url}\n  ${f.why}`)].join('\n') : '',
  ]
    .filter((l) => l !== '')
    .join('\n')
    .replace(/\n{3,}/g, '\n\n');

  const rubricMd = rubric.length
    ? [`# Rubric: ${item.title}`, `${course.code} · from Halo`, '', ...rubric.flatMap((c) => [`## ${c.name}${c.points !== null ? ` (${c.points} pts)` : ''}`, c.description ?? '', ...(c.levels ?? []).map((l) => `- ${l.name ?? ''}${l.points !== null ? ` (${l.points})` : ''}${l.description ? `: ${l.description}` : ''}`), ''])].join('\n')
    : null;
  const announcementsMd = announcements.length
    ? [`# Announcements that apply to ${item.label || item.title}`, '', ...announcements.flatMap((a) => [`## ${a.title}`, `${a.author ?? course.instructors[0]?.name ?? ''}${a.publishedAt ? ` · ${fmtDate(dateOf(a.publishedAt, tz), 'long')}` : ''}`.trim(), '', md(a.text), ...(a.resources?.length ? ['', `Attached: ${a.resources.map((f) => f.name).join(', ')}`] : []), ''])].join('\n')
    : null;

  return { zipName: kitZipName(course, item), startHere, rubricMd, announcementsMd, files, links, policy, policyLink, ownData };
}
