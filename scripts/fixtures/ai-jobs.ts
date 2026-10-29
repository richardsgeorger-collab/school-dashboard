// Every AI job in Halo+, for the model before/after harness (scripts/ai-compare.ts). Each job runs the app's own
// function (prompt builder, call, reader) on made-up classes, posts and student work (no real student data), and each
// check is a plain test on what the student would get back: a failure message, or null. The checks lean on the two
// things that matter most: never a due date the source does not give, and an answer the app can read.
import { DEFAULT_SETTINGS, type AppData, type Brief, type Course, type Item } from '../../src/domain/types';
import { mkCourse, mkItem } from '../../src/halo/fixtures';
import type { StoredAnnouncement } from '../../src/halo/announce';
import type { QuizSource } from '../../src/quiz/sources';
import type { Deck, DeckPage } from '../../src/library/db';
import type { ContextLoaders } from '../../src/ingest/context';
import type { AiKind } from '../../src/config/tiers';
import { ACTION_FIXTURES, COURSES, ITEMS, LECTURE_FIXTURES, TZ } from './ai';

/** What a job needs from the harness: the dev path's key and the fetch that carries the call to the model under test. */
export interface Via {
  apiKey: string;
  fetch: typeof globalThis.fetch;
}

export interface Job {
  name: string;
  /** The gateway kind it is metered as (one per job). */
  kind: AiKind;
  /** What the student sees, in a short form for the report. */
  run: (via: Via) => Promise<unknown>;
  checks: ((out: never) => string | null)[];
}

const job = <T>(name: string, kind: AiKind, run: (via: Via) => Promise<T>, checks: ((out: T) => string | null)[]): Job => ({ name, kind, run, checks: checks as Job['checks'] });

// ---- Dates: every date a job may state must come from its input ----
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
/** "Oct 6", "October 6", "10/6", "2026-10-06" in a text, as MM-DD. */
export function datesIn(text: string): string[] {
  const out = new Set<string>();
  for (const m of text.matchAll(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?\b/gi)) out.add(`${String(MONTHS.indexOf(m[1].slice(0, 3).toLowerCase()) + 1).padStart(2, '0')}-${m[2].padStart(2, '0')}`);
  for (const m of text.matchAll(/\b(\d{1,2})\/(\d{1,2})\b/g)) out.add(`${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`);
  for (const m of text.matchAll(/\b20\d\d-(\d\d)-(\d\d)\b/g)) out.add(`${m[1]}-${m[2]}`);
  return [...out];
}
const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
/** "Monday, October 6" where October 6, 2026 is a Tuesday: a wrong date said with confidence. */
export function wrongWeekdays(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(/\b(sun|mon|tues|wednes|thurs|fri|satur)day,?\s+(?:the\s+)?(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})\b/gi)) {
    const said = DAYS.findIndex((d) => d.startsWith(m[1].toLowerCase()));
    const real = new Date(Date.UTC(2026, MONTHS.indexOf(m[2].slice(0, 3).toLowerCase()), Number(m[3]))).getUTCDay();
    if (said !== real) out.push(`${m[0]} (is a ${DAYS[real]})`);
  }
  return out;
}
const invented = (text: string, allowed: string[]) => datesIn(text).filter((d) => !allowed.includes(d));
const noInvented = (label: string, allowed: string[]) => (text: string) => {
  const bad = invented(text, allowed);
  const wrong = wrongWeekdays(text);
  return bad.length ? `${label}: a date not in the input (${bad.join(', ')})` : wrong.length ? `${label}: the wrong weekday (${wrong.join(', ')})` : null;
};

const post = (id: string, courseId: string, title: string, text: string, publishedAt: string): StoredAnnouncement =>
  ({ id, classId: `h-${courseId}`, courseId, title, text, body: text, author: 'Instructor', publishedAt, modifiedAt: null, pulledAt: '2026-10-01T00:00:00.000Z', readAt: null, processedAt: null, findings: null, review: {} }) as unknown as StoredAnnouncement;
const course = (id: string) => COURSES.find((c) => c.id === id)!;
const dayOf = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleDateString('en-CA', { timeZone: TZ }) : null);

// ---- Announcements: the actions reader (the "Don't forget" lines, moved dates, new work) ----
const MORE_POSTS = [
  {
    name: 'a date that is not a due date',
    post: post('p7', 'c-chm', 'Midterm grades', 'Midterm grades will be posted by October 12. If you have questions about your grade after that, email me or come to office hours. Keep up the good work.', '2026-10-02T15:00:00.000Z'),
    expect: [(a: { kind: string; dueAt: string | null }[]) => (a.some((x) => x.kind !== 'note' && x.dueAt) ? `made a due date out of "grades posted by October 12" (${a.filter((x) => x.dueAt).map((x) => `${x.kind} ${dayOf(x.dueAt)}`).join(', ')})` : null)],
  },
  {
    name: 'a quiz with no date yet',
    post: post('p8', 'c-chm', 'Coming up', 'Heads up: there will be a short quiz on gas laws sometime after fall break. I will announce the exact date in class. Start reviewing chapter 5.', '2026-10-02T16:00:00.000Z'),
    expect: [(a: { kind: string; dueAt: string | null; text: string }[]) => (a.some((x) => x.dueAt) ? `invented a date for a quiz with none (${a.filter((x) => x.dueAt).map((x) => `${x.text} ${dayOf(x.dueAt)}`).join('; ')})` : null)],
  },
  {
    name: 'moved by weekday only',
    post: post('p9', 'c-eng', 'Draft deadline', 'Small change: the Rhetorical Analysis first draft is now due this Wednesday instead of Sunday, so I can return feedback before the final. Submit it in the same dropbox.', '2026-09-28T15:00:00.000Z'),
    expect: [(a: { kind: string; itemId: string | null; dueAt: string | null }[]) => (a.some((x) => x.kind === 'date_change' && x.itemId === 'i-ra' && dayOf(x.dueAt) === '2026-09-30') ? null : 'missed: RA draft moved to Wednesday Sep 30')],
  },
];

const announcementJobs = async (): Promise<Job[]> => {
  const { readActions, rewriteLines } = await import('../../src/halo/actions');
  const { readAnnouncement } = await import('../../src/halo/announce');
  const out: Job[] = [];
  for (const f of [...ACTION_FIXTURES, ...MORE_POSTS] as { name: string; post: StoredAnnouncement; expect: ((a: never, s: string) => string | null)[] }[]) {
    const allowed = [...datesIn(f.post.text), ...ITEMS.map((i) => i.dueAt.slice(5, 10)), dayOf(f.post.publishedAt)!.slice(5)];
    out.push(
      job(`announcement actions · ${f.name}`, 'announcement', (v) => readActions({ ...v, announcement: f.post, course: course(f.post.courseId), items: ITEMS, tz: TZ }) as Promise<never>, [
        ...f.expect.map((e) => (r: { actions: never; summary: string }) => e(r.actions, r.summary)),
        // A due date the post does not give and no item has, from a weekday it names ("Wednesday") is allowed.
        (r: { actions: { dueAt: string | null; text: string }[] }) => {
          const bad = r.actions.filter((x) => x.dueAt && !allowed.includes(dayOf(x.dueAt)!.slice(5)) && !/\b(mon|tues|wednes|thurs|fri|satur|sun)day\b/i.test(f.post.text));
          return bad.length ? `a due date from nowhere: ${bad.map((x) => `${x.text} ${dayOf(x.dueAt)}`).join('; ')}` : null;
        },
      ]),
    );
  }
  const read = (name: string, p: StoredAnnouncement, checks: ((r: { summary: string; findings: { kind: string; date: string | null; itemId: string | null; title: string }[] }) => string | null)[]) =>
    job(`announcement read · ${name}`, 'announcement', (v) => readAnnouncement({ ...v, announcement: p, course: course(p.courseId), items: ITEMS, tz: TZ }), [(r) => (r.summary ? null : 'no summary'), ...checks]);
  const [p1, , , , p5] = ACTION_FIXTURES.map((f) => f.post);
  out.push(
    read('lab moved', p1, [(r) => (r.findings.some((m) => m.kind === 'date_change' && m.date === '2026-10-09') ? null : 'missed: Lab 3 moved to Oct 9')]),
    read('pure news', p5, [(r) => (r.findings.some((m) => (m.kind === 'new' || m.kind === 'date_change') && m.date) ? `invented work from news: ${r.findings.map((m) => `${m.kind} ${m.title} ${m.date}`).join('; ')}` : null)]),
    read('a date that is not a due date', MORE_POSTS[0].post, [(r) => (r.findings.some((m) => (m.kind === 'new' || m.kind === 'date_change') && m.date) ? `a due date from "grades posted by": ${r.findings.map((m) => `${m.kind} ${m.title} ${m.date}`).join('; ')}` : null)]),
  );
  out.push(
    job('announcement rewrite · two lines', 'announcement', (v) => rewriteLines({ ...v, announcement: p1, course: course('c-chm'), lines: ['Lab 3 date change Oct 9', 'goggles requirement lab'] }), [
      (r) => (r.lines.length === 2 && r.lines.every((l) => l && l.text) ? null : `lines came back ${JSON.stringify(r.lines).slice(0, 120)}`),
      (r) => noInvented('rewritten lines', ['10-09', '10-02'])(r.lines.map((l) => `${l?.text ?? ''} ${l?.detail ?? ''}`).join(' ')),
    ]),
  );
  return out;
};

// ---- Lecture notes ----
const lectureJobs = async (): Promise<Job[]> => {
  const { summarizeLecture } = await import('../../src/record/summarize');
  return LECTURE_FIXTURES.map((f) =>
    job(`lecture · ${f.name}`, 'lecture', (v) => summarizeLecture({ ...v, course: f.course, lectureDate: f.lectureDate, items: ITEMS, transcript: f.transcript, tz: TZ, deckOutline: null }) as Promise<never>, [
      ...f.expect.map((e) => (n: never) => e(n)),
      (n: { mentions: { date: string | null }[] }) => {
        const bad = n.mentions.filter((m) => m.date && !['2026-10-08', '2026-10-02', '2026-10-06', '2026-10-09', '2026-10-01', '2026-10-03'].includes(m.date));
        return bad.length ? `a date the lecture never gave: ${bad.map((m) => m.date).join(', ')}` : null;
      },
    ]),
  );
};

// ---- Study: sources the student has, then kits, a quiz, a worksheet ----
const SOURCES: QuizSource[] = [
  { id: 'S1', kind: 'slide', label: 'Stoichiometry.pptx, slide 3', href: '#', text: 'Mole ratios come from the coefficients of the balanced equation. Always convert grams to moles first: moles = mass / molar mass. Example: 2 H2 + O2 -> 2 H2O, so 2 mol H2 make 2 mol H2O.' },
  { id: 'S2', kind: 'slide', label: 'Stoichiometry.pptx, slide 5', href: '#', text: 'Limiting reagent: the reactant that runs out first. Compare the moles of product each reactant could make; the smaller amount wins. Percent yield = (actual yield / theoretical yield) x 100%.' },
  { id: 'S3', kind: 'recording', label: 'Lecture Sep 29, 7:00', href: '#', text: 'Limiting reagent is on the exam. People mix up actual and theoretical yield every year. Molar mass of water is 18.02 g/mol, hydrogen gas 2.016 g/mol.' },
];
const chm = COURSES[0];
const exam = ITEMS.find((i) => i.id === 'i-exam1')!;


const studyJobs = async (): Promise<Job[]> => {
  const { buildKit } = await import('../../src/study/kits');
  const { generateSet } = await import('../../src/quiz/generate');
  const { buildWorksheet } = await import('../../src/practice/worksheet');
  const ids = new Set(SOURCES.map((s) => s.id));
  return [
    job('study kit · formulas', 'study', (v) => buildKit({ ...v, course: chm, kind: 'formulas', topic: 'stoichiometry', sources: SOURCES, weak: ['limiting reagent'], flagged: ['limiting reagent'] }), [
      (k) => (k.formulas.length >= 2 ? null : `only ${k.formulas.length} formulas`),
      (k) => (k.formulas.some((f) => /yield/i.test(`${f.name} ${f.formula}`)) ? null : 'missed: percent yield'),
      (k) => (k.formulas.every((f) => ids.has(f.sourceId)) ? null : 'a formula with no real source'),
    ]),
    job('study kit · cards', 'study', (v) => buildKit({ ...v, course: chm, kind: 'cards', topic: 'stoichiometry', sources: SOURCES, weak: [], flagged: [] }), [
      (k) => (k.cards.length >= 4 ? null : `only ${k.cards.length} cards`),
      (k) => (k.cards.every((c) => c.front && c.back && ids.has(c.sourceId)) ? null : 'a card missing a side or a source'),
    ]),
    job('quiz · stoichiometry', 'quiz', (v) => generateSet({ ...v, course: chm, topic: 'stoichiometry', sources: SOURCES, weakTopics: ['limiting reagent'], avoid: [] }), [
      (q) => (q.questions.length >= 3 ? null : `only ${q.questions.length} questions`),
      (q) => (q.questions.every((x) => x.prompt && x.answer && x.explanation) ? null : 'a question missing its answer or explanation'),
      (q) => (q.questions.every((x) => x.choices.length === 0 || x.choices.length === 4) ? null : 'a multiple choice question without four choices'),
    ]),
    job('worksheet · for Exam 1', 'worksheet', (v) => buildWorksheet({ ...v, course: chm, test: exam, testDate: 'Fri, Oct 9', topics: ['stoichiometry', 'limiting reagent', 'percent yield'], weakTopics: [], sources: SOURCES }), [
      (w) => (w.problems.length >= 4 ? null : `only ${w.problems.length} problems`),
      (w) => (w.problems.every((p) => p.prompt && p.answer && p.solution.length) ? null : 'a problem missing its answer or solution'),
      (w) => (w.problems.every((p) => p.choices.length === 0 || /^[A-D]$/.test(p.answer.trim())) ? null : 'a multiple choice answer that is not A to D'),
    ]),
  ];
};


// ---- Assignment help: the brief, the draft check, the method check ----
const ra = ITEMS.find((i) => i.id === 'i-ra')!;
const eng = COURSES[1];
const RA_DESCRIPTION = 'Write a 750 to 1,000 word rhetorical analysis of the artifact you claimed. Identify the author\'s purpose and audience, and analyze how the author uses ethos, pathos, and logos. Use at least two scholarly sources in APA format. Submit through LopesWrite.';
const RA_RUBRIC = 'Rubric. Thesis (25 points): a clear claim about how the artifact persuades. Analysis of appeals (40 points): ethos, pathos and logos each analyzed with quoted evidence. Organization (20 points): an introduction, body paragraphs by appeal, a conclusion. APA and sources (15 points): two scholarly sources cited in APA 7.';
const BRIEF: Brief = { asks: ['A 750 to 1,000 word rhetorical analysis of your artifact.'], rubric: [{ criterion: 'Thesis', points: 25, how: 'A clear claim' }, { criterion: 'Analysis of appeals', points: 40, how: 'Ethos, pathos and logos with quotes' }, { criterion: 'Organization', points: 20, how: 'Intro, body by appeal, conclusion' }, { criterion: 'APA and sources', points: 15, how: 'Two scholarly sources in APA 7' }], steps: [], at: '2026-10-01T00:00:00.000Z', source: 'claude' };
const DRAFT = 'The Nike "Dream Crazy" ad persuades young athletes that their ambition matters more than the odds. The ad builds ethos through Colin Kaepernick, whose sacrifice the audience already knows. It uses pathos with short clips of athletes who overcame injuries and doubt, set to a quiet voiceover that builds. Logos is weaker: the ad gives no numbers, only examples. In the end the ad succeeds because it makes the viewer feel included in a bigger story.';

const helpJobs = async (): Promise<Job[]> => {
  const { briefItem, checkDraft, checkMethod } = await import('../../src/work/brief');
  const chmHw = { ...ITEMS[1], id: 'i-hw', title: 'Topic 3 Homework', label: 'Chem HW 3', type: 'homework' } as Item;
  return [
    job('help · assignment brief', 'brief', (v) => briefItem({ ...v, item: ra, course: eng, description: RA_DESCRIPTION, rubricText: RA_RUBRIC }), [
      (b) => (b.asks.length >= 1 ? null : 'no asks'),
      (b) => (b.rubric.length === 4 ? null : `rubric has ${b.rubric.length} criteria, the handout has 4`),
      (b) => (b.rubric.reduce((n, r) => n + (r.points ?? 0), 0) === 100 ? null : `rubric points add to ${b.rubric.reduce((n, r) => n + (r.points ?? 0), 0)}, not 100`),
      (b) => noInvented('brief', ['10-04'])([...b.asks, ...b.steps].join(' ')),
    ]),
    job('help · draft check', 'draft', (v) => checkDraft({ ...v, item: ra, course: eng, description: RA_DESCRIPTION, rubricText: RA_RUBRIC, brief: BRIEF, draft: DRAFT }), [
      (d) => (d.misses.some((m) => /apa|source|cit/i.test(`${m.criterion} ${m.what}`)) ? null : 'missed: no sources or APA citations in the draft'),
      (d) => (d.next ? null : 'no next step'),
    ]),
    job('help · method check', 'method', (v) => checkMethod({ ...v, item: chmHw, course: chm, description: 'Show your setup for each stoichiometry problem.', material: SOURCES.map((s) => s.text).join('\n'), work: 'Problem 1: How many grams of water form from 4.0 g of H2 with excess O2? 2 H2 + O2 -> 2 H2O. 4.0 g H2 / 2.016 g/mol = 1.98 mol H2. 1.98 mol H2 x (1 mol H2O / 2 mol H2) = 0.99 mol H2O. 0.99 x 18.02 = 17.8 g H2O.' }), [
      (m) => (m.problems.length >= 1 ? null : 'no problems read'),
      (m) => (m.problems.some((p) => p.setup === 'off') ? null : 'missed: the mole ratio is 2:2, not 1:2'),
      (m) => (m.next ? null : 'no next step'),
    ]),
    job('help · method check, work that is right', 'method', (v) => checkMethod({ ...v, item: chmHw, course: chm, description: 'Show your setup for each stoichiometry problem.', material: SOURCES.map((s) => s.text).join('\n'), work: 'Problem 1: How many grams of water form from 4.0 g of H2 with excess O2? 2 H2 + O2 -> 2 H2O. 4.0 g H2 / 2.016 g/mol = 1.98 mol H2. 1.98 mol H2 x (2 mol H2O / 2 mol H2) = 1.98 mol H2O. 1.98 x 18.02 = 35.7 g H2O.' }), [
      (m) => (m.problems.length >= 1 && m.problems.every((p) => p.setup === 'right') ? null : `called right work wrong: ${m.problems.map((p) => `${p.setup}: ${p.note}`).join('; ')}`),
    ]),
  ];
};

// ---- Topic links across classes ----
const linkJobs = async (): Promise<Job[]> => {
  const { findLinks } = await import('../../src/ingest/links');
  const courses = [
    { ...COURSES[0], topics: [{ name: 'Dimensional analysis and unit conversion', week: 1 }, { name: 'Stoichiometry', week: 4 }, { name: 'Gas laws', week: 8 }] },
    { ...mkCourse({ id: 'c-esg', code: 'ESG-162', name: 'Engineering Problem Solving' }), topics: [{ name: 'Units and dimensional analysis', week: 2 }, { name: 'Spreadsheets for engineers', week: 5 }] },
  ] as unknown as Course[];
  return [job('topic links · chemistry and engineering', 'links', (v) => findLinks({ ...v, courses }), [(l) => (l.length >= 1 ? null : 'no link between dimensional analysis in both classes')])];
};

// ---- The syllabus passes: one class's plan, then the term ----
const planJobs = async (): Promise<Job[]> => {
  const { runClassPass, runTermPass } = await import('../../src/ingest/run');
  const engC = mkCourse({ id: 'eng', code: 'ENG-105', name: 'English Composition I', termStart: '2026-08-31', termEnd: '2026-12-13' });
  const chmC = mkCourse({ id: 'chm', code: 'CHM-113', name: 'General Chemistry I', termStart: '2026-08-31', termEnd: '2026-12-13' });
  const at = (d: string) => `${d}T23:59:00-07:00`;
  const items: Item[] = [
    mkItem({ id: 'draft', courseId: 'eng', title: 'First Draft of an Op-Ed Assignment', label: 'Eng Op-Ed Draft', type: 'paper', points: 100, dueAt: at('2026-10-18'), estimatedMinutes: 100, notes: 'Write a 750-word first draft of your op-ed. Cite two sources in APA. Submit through LopesWrite.' }),
    mkItem({ id: 'final', courseId: 'eng', title: 'Final Draft of an Op-Ed Assignment (Online)', label: 'Eng Op-Ed Final', type: 'paper', points: 200, dueAt: at('2026-11-01'), estimatedMinutes: 200, notes: 'Revise the draft into a 1,000-word op-ed. Three sources.' }),
    mkItem({ id: 'dq', courseId: 'eng', title: 'Topic 3 DQ 1', label: 'Eng DQ 3.1', type: 'discussion', points: 5, dueAt: at('2026-09-30'), estimatedMinutes: 25 }),
    mkItem({ id: 'set', courseId: 'eng', title: 'Topic 2 Quiz', label: 'Eng Quiz 2', type: 'quiz', points: 20, dueAt: at('2026-09-25'), estimatedMinutes: 40 }),
    mkItem({ id: 'exam', courseId: 'chm', title: 'Exam 1', label: 'Chem Exam 1', type: 'exam', points: 100, dueAt: at('2026-10-16'), estimatedMinutes: 300 }),
  ];
  const data: AppData = { courses: [engC, chmC], items, settings: { ...DEFAULT_SETTINGS, timezone: TZ } };
  const decks: Deck[] = [{ id: 'd2', courseId: 'eng', title: 'Op-Ed Rubric', tag: '', date: '2026-09-09', fileName: 'op-ed-rubric.pdf', kind: 'pdf', mimeType: '', bytes: 1, pages: 1, chars: 1, addedAt: '', recordingId: null, fileDeleted: false }];
  const pages: Record<string, DeckPage[]> = { d2: [{ deckId: 'd2', n: 1, text: 'Op-Ed Rubric\nThesis 20 pts: a clear arguable claim\nEvidence 30 pts: two credible sources\nAPA 10 pts' }] };
  const SYLLABUS = 'ENG-105 Syllabus. Late work loses 10% per day. Week 8: peer review of the op-ed draft in class. A reading response is due the Monday of week five.';
  const loaders: ContextLoaders = { decks: async () => decks, pages: async (id) => pages[id] ?? [], recordings: async () => [], syllabus: async (id) => (id === 'eng' ? { courseId: id, name: 'syllabus.pdf', text: SYLLABUS, chars: 1, addedAt: '' } : null) };
  const today = '2026-09-15';
  const startByOf = (id: string) => ({ draft: '2026-10-14', final: '2026-10-27', dq: '2026-09-29', set: '2026-09-23', exam: '2026-10-10' })[id];
  const cache = () => {
    const m = new Map<string, unknown>();
    return { get: async <T>(k: string) => (m.get(k) as T) ?? null, put: async (k: string, v: unknown) => void m.set(k, v) };
  };
  const dueOf = (id: string) => items.find((i) => i.id === id)!.dueAt.slice(0, 10);
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
  const known = norm([SYLLABUS, pages.d2[0].text, ...items.map((i) => `${i.title} ${i.notes ?? ''}`)].join(' '));
  return [
    job('syllabus · class plan', 'class_plan', (v) => runClassPass(engC, data, today, startByOf, { ...v, loaders, cache: cache() }, { force: true }).then((r) => r.plan), [
      (p) => (['draft', 'final', 'dq'].every((id) => p.items[id]) ? null : `plan is missing ${['draft', 'final', 'dq'].filter((id) => !p.items[id]).join(', ')}`),
      (p) => (p.incomplete.length === 0 ? null : `a pass did not come back: ${p.incomplete.join('; ')}`),
      (p) => {
        const late = Object.values(p.items).filter((x) => x.startBy && x.startBy.value > dueOf(x.itemId));
        return late.length ? `a start-by after the due date: ${late.map((x) => `${x.itemId} ${x.startBy!.value}`).join(', ')}` : null;
      },
      (p) => {
        const made = p.discovered.filter((d) => d.due && !known.includes(norm(d.quote).slice(0, 40)));
        return made.length ? `found work with a date and no quote from the class: ${made.map((d) => `${d.title} ${d.due} "${d.quote}"`).join('; ')}` : null;
      },
    ]),
    job('syllabus · term plan', 'term_plan', async (v) => {
      const { plan } = await runClassPass(engC, data, today, startByOf, { ...v, loaders, cache: cache() }, { force: true });
      return (await runTermPass(data, { eng: plan, chm: null }, today, startByOf, { ...v, loaders, cache: cache() }, { force: true })).term;
    }, [
      (t) => (Object.keys(t.starts).length >= 3 ? null : `only ${Object.keys(t.starts).length} start dates`),
      (t) => {
        const late = Object.entries(t.starts).filter(([id, r]) => items.some((i) => i.id === id) && r.value > dueOf(id));
        return late.length ? `a start after the due date: ${late.map(([id, r]) => `${id} ${r.value}`).join(', ')}` : null;
      },
      (t) => (t.weeks.every((w) => ['brutal', 'heavy', 'normal', 'light'].includes(w.load)) ? null : 'a week with an unknown load'),
    ]),
  ];
};

export async function allJobs(): Promise<Job[]> {
  return [...(await announcementJobs()), ...(await lectureJobs()), ...(await studyJobs()), ...(await helpJobs()), ...(await linkJobs()), ...(await planJobs())];
}
