import { dateOf, fmtDate, fmtTime } from '../domain/dates';
import type { TodoLine } from '../domain/sheet';
import { TYPE_LABELS, type Course, type Item } from '../domain/types';
import { terms } from '../library/search';

/**
 * The help kit (George, 2026-10-08): one zip a student hands to an AI tutor, about one assignment only. The text here
 * is pure: what goes in, in what words, from what the planner already holds. The bytes of Halo's files come through
 * the extension (kit/extFiles.ts); without it the same files are listed as links.
 */
export interface KitAnnouncement {
  id: string;
  title: string;
  text: string;
  author: string | null;
  publishedAt: string | null;
}
export interface KitResource {
  title: string;
  unit: string | null;
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
  /** Posts the assignment's parts, origin or moved date came from. */
  announcements: KitAnnouncement[];
  /** Course materials from the same topic as the assignment. */
  resources: KitResource[];
  /** The whole syllabus on file, or nothing. */
  syllabusText: string | null;
}

export interface KitFile {
  /** The file name inside /files, or the link's label. */
  name: string;
  /** Halo's resource id, for a file the extension can fetch. Null for a link. */
  resourceId: string | null;
  url: string | null;
  why: string;
}
export interface Kit {
  zipName: string;
  startHere: string;
  rubricMd: string | null;
  announcementsMd: string | null;
  /** Halo files worth fetching. */
  files: KitFile[];
  /** Everything else: readings behind the library, publisher sites, videos, links in the instructions. */
  links: KitFile[];
  policy: { quote: string; source: string }[];
  ownData: boolean;
}

const AI_WORDS = /\b(AI|A\.I\.|artificial intelligence|ChatGPT|Chat GPT|generative|large language models?|LLMs?|Copilot|Gemini|Claude)\b/;
const OWN_DATA = /\b(time logs?|reflect(?:ion|ions|ive)?|journal|your (?:own )?(?:experience|experiences|schedule|budget|habits|data|results|life|goals|values)|personal (?:experience|story|example|statement)|interview|survey|observ(?:e|ation|ations)|self[- ]assessment)\b/i;
const NUM = '(?:\\d[\\d,]*|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fifteen|twenty)';
const FORMAT = new RegExp(`\\b(${NUM}\\s*(?:to|-|–|or)\\s*${NUM}\\s*(?:words?|slides?|pages?|paragraphs?|sources?|references?|citations?)|${NUM}\\s*(?:words?|slides?|pages?|paragraphs?|sources?|references?|citations?)|APA|MLA|Chicago|double[- ]spaced|Times New Roman|12[- ]point|PowerPoint|PPTX|\\.pptx|\\.docx|PDF)\\b`, 'i');
const URLS = /https?:\/\/[^\s<>"')\]]+/g;
const OFFSITE = /oclc\.org|ebscohost|gale\.com|infobase|gcumedia|youtube|youtu\.be|vimeo|pearson|mheducation|cengage|wiley|lopes\.idm/i;

const sentences = (text: string): string[] => text.replace(/\s+/g, ' ').split(/(?<=[.!?])\s+(?=[A-Z"“(])/).map((s) => s.trim()).filter(Boolean);

/** Every sentence about AI, word for word, with where it was said. */
export function findAiPolicy(sources: { title: string; text: string }[]): { quote: string; source: string }[] {
  const out: { quote: string; source: string }[] = [];
  for (const s of sources) for (const line of sentences(s.text)) if (AI_WORDS.test(line) && out.length < 8) out.push({ quote: line, source: s.title });
  return out;
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

/** The part of the syllabus about this assignment: the best-matching paragraph and its neighbours, never the whole thing. */
export function syllabusSection(text: string | null, item: Pick<Item, 'title' | 'label' | 'topic'>): string | null {
  if (!text) return null;
  const paras = text.split(/\n{2,}|\r?\n(?=[A-Z#•-])/).map((p) => p.trim()).filter((p) => p.length >= 20);
  if (paras.length === 0) return null;
  const words = [...new Set([...terms(item.title), ...terms(item.label)])];
  const topic = item.topic?.match(/Topic\s*\d+/i)?.[0]?.toLowerCase() ?? null;
  const scored = paras.map((p, i) => {
    const low = p.toLowerCase();
    return { i, n: words.filter((w) => low.includes(w)).length + (topic && low.includes(topic) ? 2 : 0) };
  });
  const best = scored.sort((a, b) => b.n - a.n)[0];
  if (!best || best.n < 2) return null;
  // The paragraph itself, a short heading right before it, and what follows until the next topic starts.
  const heading = /^(topic|week|module|unit)\s*\d+/i;
  const out: string[] = [];
  const prev = paras[best.i - 1];
  if (prev && prev.length < 80 && !heading.test(paras[best.i]) ) out.push(prev);
  out.push(paras[best.i]);
  for (let k = best.i + 1; k < paras.length && out.length < 4; k++) {
    if (heading.test(paras[k])) break;
    out.push(paras[k]);
  }
  const take = out.join('\n\n');
  return take.length > 2000 ? `${take.slice(0, 2000)}…` : take;
}

const safe = (s: string): string => s.replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim();
export const kitZipName = (course: Course, item: Item): string => `${safe(course.code)} ${safe(item.label || item.title)} - help kit.zip`;

const md = (s: string | null | undefined): string => (s ?? '').replace(/\r/g, '').trim();

export function buildKit(input: KitInput): Kit {
  const { item, course, tz, lines, announcements, resources, syllabusText, outcome } = input;
  const files: KitFile[] = [];
  const links: KitFile[] = [];
  const seen = new Set<string>();
  const add = (f: KitFile) => {
    const k = (f.resourceId ?? f.url ?? f.name).toLowerCase();
    if (seen.has(k)) return;
    seen.add(k);
    (f.resourceId ? files : links).push(f);
  };
  for (const a of item.attachments ?? []) add({ name: a.title || 'attachment', resourceId: a.resourceId, url: a.resourceId ? null : null, why: 'Attached to the assignment in Halo.' });
  for (const u of md(item.notes).match(URLS) ?? []) add({ name: u, resourceId: null, url: u, why: 'Linked in the instructions.' });
  for (const r of resources) {
    for (const f of r.files) {
      const isUrl = /^https?:\/\//i.test(f.name) || (f.kind ?? '').toUpperCase() === 'URL';
      if (isUrl) add({ name: r.title, resourceId: null, url: f.name, why: `A ${OFFSITE.test(f.name) ? 'reading behind the library or a publisher site' : 'reading'} from the same topic (${r.unit ?? 'this topic'}).` });
      else add({ name: f.name || r.title, resourceId: f.id, url: null, why: `From the same topic in Halo (${r.unit ?? 'this topic'}): ${r.title}.` });
    }
  }
  const policy = findAiPolicy([
    ...(syllabusText ? [{ title: `${course.code} syllabus`, text: syllabusText }] : []),
    ...announcements.map((a) => ({ title: `announcement "${a.title}"`, text: a.text })),
    { title: 'the assignment instructions', text: md(item.notes) },
  ]);
  const ownData = needsOwnData(`${item.title} ${md(item.notes)} ${lines.map((l) => l.text).join(' ')}`);
  const rules = formatRules(`${md(item.notes)} ${lines.map((l) => l.text).join('. ')}`);
  const section = syllabusSection(syllabusText, item);
  const due = `${fmtDate(dateOf(item.dueAt, tz), 'long')} at ${fmtTime(item.dueAt, tz)}`;
  const rubric = item.rubric?.criteria.length ? item.rubric.criteria : [];

  const policyBlock =
    policy.length > 0
      ? ['## This class\'s rules on AI (word for word)', ...policy.map((p) => `> "${p.quote}"\n> — ${p.source}`), '', /\b(required|encouraged|allowed|may use|permitted|welcome)\b/i.test(policy.map((p) => p.quote).join(' ')) && !/\b(not|never|no|prohibit|forbid|banned)\b/i.test(policy.map((p) => p.quote).join(' ')) ? 'The class allows or asks for AI use within these rules. Stay inside them.' : 'Read these before helping. If they forbid something, do not do it.'].join('\n')
      : "## This class's rules on AI\nNo AI policy found, check with your instructor. Until then: help only (explain, plan, give feedback, check against the rubric). Do not write the submission.";

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
    ownData ? '- This assignment needs the student\'s OWN material (their experiences, reflections, logs, data). Ask them for it and work from what they give you. Never invent it.' : '',
    '',
    '## The assignment',
    `- Class: ${course.code} ${course.name}`,
    `- Title: ${item.title}`,
    `- Type: ${TYPE_LABELS[item.type]}`,
    `- Due: ${due}`,
    `- Worth: ${item.points} points`,
    rules.length ? `- Format rules named in the instructions: ${rules.join(', ')}` : '',
    '',
    '## Instructions (from Halo)',
    md(item.notes) || '(Halo gave no description.)',
    '',
    lines.length ? ['## What to do (as Halo+ lists it)', ...lines.map((l) => `- [${l.done ? 'x' : ' '}] ${l.text} (${l.tag})`)].join('\n') : '',
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
    ? [`# Announcements that apply to ${item.label || item.title}`, '', ...announcements.flatMap((a) => [`## ${a.title}`, `${a.author ?? course.instructors[0]?.name ?? ''}${a.publishedAt ? ` · ${fmtDate(dateOf(a.publishedAt, tz), 'long')}` : ''}`.trim(), '', md(a.text), ''])].join('\n')
    : null;

  return { zipName: kitZipName(course, item), startHere, rubricMd, announcementsMd, files, links, policy, ownData };
}
