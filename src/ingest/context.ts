import { hashText } from '../ai/client';
import { dateOf, fmtDate, fmtTime } from '../domain/dates';
import type { AppData, Course, DateStr, Item, ItemFlags, ItemStatus, ItemType } from '../domain/types';
import type { Deck, DeckPage } from '../library/db';
import type { Recording } from '../record/db';
import { syllabusForPrompt, type SyllabusForPrompt } from '../syllabus/context';
import type { SyllabusDoc } from '../syllabus/db';

/**
 * Everything the app has for one class, gathered once and handed to the model in one pass: the planner's items with
 * Halo's descriptions, the syllabus, rubric files, slide outlines, and what the lectures said. Pure given its loaders,
 * so it can be tested without a browser.
 */
export interface CtxAssessment {
  /** "A1", "A2"…: how the model refers back to the item. Never an id it could mistype. */
  ref: string;
  itemId: string;
  title: string;
  type: ItemType;
  due: DateStr;
  dueTime: string;
  opens: DateStr | null;
  points: number;
  description: string;
  unit: string | null;
  url: string | null;
  flags: ItemFlags;
  status: ItemStatus;
  halo: string | null;
  /** What the rule-based planner says today, so the model can agree or explain why not. */
  startByNow: DateStr | null;
  minutesNow: number;
  source: Item['source'];
  overrides: { startBy: boolean; minutes: boolean };
}

export interface CtxDeck {
  id: string;
  title: string;
  tag: string;
  date: DateStr;
  pages: number;
  /** The first line of each slide, numbered, capped. */
  outline: string[];
}

export interface CtxRubric {
  deckId: string;
  title: string;
  text: string;
}

export interface CtxLecture {
  id: string;
  title: string;
  date: DateStr;
  summary: string[];
  concepts: string[];
  emphasized: string[];
  examFlags: string[];
  deadlines: string[];
}

export interface ClassContext {
  course: Course;
  tz: string;
  today: DateStr;
  termStart: DateStr;
  termEnd: DateStr;
  capacity: { weekday: number; weekend: number };
  assessments: CtxAssessment[];
  syllabus: string | null;
  decks: CtxDeck[];
  rubrics: CtxRubric[];
  lectures: CtxLecture[];
  /** How much of the syllabus is on file and how much of it reached the prompt. Null when there is none. */
  syllabusInfo: SyllabusForPrompt | null;
  otherClasses: { code: string; name: string }[];
  /** Hash of everything above that the model reads, so an unchanged class is never re-reasoned. */
  inputHash: string;
}

export interface ContextLoaders {
  decks(): Promise<Deck[]>;
  pages(deckId: string): Promise<DeckPage[]>;
  recordings(): Promise<Recording[]>;
  syllabus(courseId: string): Promise<SyllabusDoc | null>;
}

export const RUBRIC_WORDS = /rubric|guidelines?|instructions?|handout|assignment sheet|template|checklist/i;
const DESC_CHARS = 3500;
const RUBRIC_CHARS = 12_000;
const MAX_RUBRICS = 4;
const OUTLINE_LINES = 40;
const OUTLINE_CHARS = 90;
const MAX_DECKS = 14;
const MAX_LECTURES = 16;

const firstLine = (text: string) =>
  text
    .split(/\n+/)
    .map((l) => l.trim())
    .find((l) => l.length > 2) ?? '';

/** A deck reads as a rubric or handout when its name says so. Those go in whole; slide decks go in as outlines. */
export const isRubricDeck = (d: Pick<Deck, 'title' | 'tag' | 'fileName'>): boolean => RUBRIC_WORDS.test(`${d.title} ${d.tag} ${d.fileName}`);

export async function gatherClassContext(course: Course, data: AppData, today: DateStr, startByOf: (id: string) => DateStr | undefined, loaders: ContextLoaders): Promise<ClassContext> {
  const tz = data.settings.timezone;
  const items = data.items.filter((i) => i.courseId === course.id).sort((a, b) => a.dueAt.localeCompare(b.dueAt) || a.title.localeCompare(b.title));
  const assessments: CtxAssessment[] = items.map((i, k) => ({
    ref: `A${k + 1}`,
    itemId: i.id,
    title: i.title,
    type: i.type,
    due: dateOf(i.dueAt, tz),
    dueTime: fmtTime(i.dueAt, tz),
    opens: i.opensAt ? dateOf(i.opensAt, tz) : null,
    points: i.points,
    description: (i.notes ?? '').trim().slice(0, DESC_CHARS),
    unit: i.topic ?? null,
    url: i.url ?? null,
    flags: i.flags,
    status: i.status,
    halo: i.halo?.status ?? null,
    startByNow: startByOf(i.id) ?? null,
    minutesNow: i.estimatedMinutes,
    source: i.source,
    overrides: { startBy: !!i.startByOverride, minutes: i.estimateOverridden },
  }));

  const [allDecks, recordings, syllabusDoc] = await Promise.all([loaders.decks().catch(() => [] as Deck[]), loaders.recordings().catch(() => [] as Recording[]), loaders.syllabus(course.id).catch(() => null)]);
  const mine = allDecks.filter((d) => d.courseId === course.id).sort((a, b) => a.date.localeCompare(b.date));
  const rubrics: CtxRubric[] = [];
  const decks: CtxDeck[] = [];
  for (const d of mine) {
    const pages = await loaders.pages(d.id).catch(() => [] as DeckPage[]);
    if (isRubricDeck(d) && rubrics.length < MAX_RUBRICS) {
      rubrics.push({ deckId: d.id, title: d.title, text: pages.map((p) => p.text).join('\n').trim().slice(0, RUBRIC_CHARS) });
      continue;
    }
    if (decks.length >= MAX_DECKS) continue;
    decks.push({ id: d.id, title: d.title, tag: d.tag, date: d.date, pages: d.pages, outline: pages.slice(0, OUTLINE_LINES).map((p) => `${p.n}. ${firstLine(p.text).slice(0, OUTLINE_CHARS)}`) });
  }

  // The whole syllabus, or, when it cannot fit, its topics with whatever was left out named in the text itself.
  const syllabus = syllabusDoc?.text.trim() ? syllabusForPrompt(syllabusDoc.text.trim()) : null;

  const lectures: CtxLecture[] = recordings
    .filter((r) => r.courseId === course.id && r.notes)
    .sort((a, b) => a.startedAt.localeCompare(b.startedAt))
    .slice(-MAX_LECTURES)
    .map((r) => ({
      id: r.id,
      title: r.title,
      date: dateOf(r.startedAt, tz),
      summary: r.notes?.summary ?? [],
      concepts: r.notes?.concepts ?? [],
      emphasized: r.notes?.knowledge?.emphasized.map((p) => p.point) ?? [],
      examFlags: r.notes?.knowledge?.examFlags.map((p) => p.point) ?? [],
      deadlines: (r.notes?.mentions ?? []).filter((m) => m.date).map((m) => `${m.title} — ${m.date}${m.time ? ` ${m.time}` : ''} ("${m.quote.slice(0, 120)}")`),
    }));

  const ctx: ClassContext = {
    course,
    tz,
    today,
    termStart: course.termStart,
    termEnd: course.termEnd,
    capacity: { weekday: data.settings.weekdayMinutes, weekend: data.settings.weekendMinutes },
    assessments,
    syllabus: syllabus?.text || null,
    decks,
    rubrics,
    lectures,
    syllabusInfo: syllabus,
    otherClasses: data.courses.filter((c) => c.id !== course.id).map((c) => ({ code: c.code, name: c.name })),
    inputHash: '',
  };
  const halo = items.filter((i) => !i.plan?.found);
  ctx.inputHash = hashText(`${contextBlocks(ctx).stable}\n${halo.map((i) => `${i.id}|${i.title}|${i.type}|${i.dueAt}|${i.opensAt ?? ''}|${i.points}|${(i.notes ?? '').trim().slice(0, DESC_CHARS)}`).join('\n')}|${ctx.capacity.weekday}|${ctx.capacity.weekend}`);
  return ctx;
}

const flagWords = (f: ItemFlags) => [f.lopesWrite && 'LopesWrite', f.timed && 'timed', f.group && 'group', f.inClass && 'in person', f.practice && 'practice'].filter(Boolean).join(', ');

/**
 * The two prompt blocks: a stable one the API can cache across re-runs (syllabus, rubrics, outlines, lectures) and the
 * volatile one that carries today's date and the items as they stand.
 */
export function contextBlocks(ctx: ClassContext): { stable: string; volatile: string } {
  const parts: string[] = [];
  if (ctx.syllabus) parts.push(`## Syllabus\n${ctx.syllabus}`);
  for (const r of ctx.rubrics) parts.push(`## Rubric or handout: ${r.title}\n${r.text}`);
  if (ctx.decks.length) parts.push(`## Slide decks on file (title · tag · date · slides, then the first line of each slide)\n${ctx.decks.map((d) => `### ${d.title} · ${d.tag || '—'} · ${fmtDate(d.date, 'short')} · ${d.pages} slides\n${d.outline.join('\n')}`).join('\n\n')}`);
  if (ctx.lectures.length)
    parts.push(
      `## Lectures on file (what each one taught, and what the professor stressed)\n${ctx.lectures
        .map((l) => {
          const lines = [`### ${l.title} · ${fmtDate(l.date, 'short')}`];
          if (l.summary.length) lines.push(`Taught: ${l.summary.join(' ')}`);
          if (l.concepts.length) lines.push(`Concepts: ${l.concepts.join('; ')}`);
          if (l.emphasized.length) lines.push(`Stressed: ${l.emphasized.join('; ')}`);
          if (l.examFlags.length) lines.push(`Called exam material: ${l.examFlags.join('; ')}`);
          if (l.deadlines.length) lines.push(`Deadlines said out loud: ${l.deadlines.join('; ')}`);
          return lines.join('\n');
        })
        .join('\n\n')}`,
    );
  const stable = parts.join('\n\n') || '(nothing on file beyond Halo)';

  const items = ctx.assessments
    .map((a) => {
      const head = `[${a.ref}] "${a.title}" · ${a.type} · due ${a.due} ${a.dueTime}${a.opens ? ` · opens ${a.opens}` : ''} · ${a.points} pts${a.unit ? ` · ${a.unit}` : ''}${a.halo ? ` · Halo: ${a.halo}` : ''} · ${a.status === 'done' ? 'done' : a.status === 'in_progress' ? 'started' : 'not started'} · planner now: start ${a.startByNow ?? '—'}, ${a.minutesNow} min${a.overrides.startBy ? ' (start set by the student)' : ''}${a.overrides.minutes ? ' (minutes set by the student)' : ''}${flagWords(a.flags) ? ` · flags: ${flagWords(a.flags)}` : ''}${a.url ? ' · Halo link on file' : ''}`;
      return a.description ? `${head}\nDescription: ${a.description}` : head;
    })
    .join('\n\n');
  const volatile = `Today: ${ctx.today}\nClass: ${ctx.course.code} ${ctx.course.name} · term ${ctx.termStart} to ${ctx.termEnd}${ctx.course.online ? ' · online' : ''}\nStudy capacity: ${ctx.capacity.weekday} min on a weekday, ${ctx.capacity.weekend} min on a weekend day, across all ${ctx.otherClasses.length + 1} classes (${ctx.otherClasses.map((c) => c.code).join(', ')} are the others).\n\n## Assignments in Halo (ref, title, type, due, points, state, what the rule-based planner says now)\n${items || '(none)'}`;
  return { stable, volatile };
}

/** Roughly how many tokens the pass will send, for the cost line before running. */
export const approxTokens = (ctx: ClassContext): number => {
  const b = contextBlocks(ctx);
  return Math.round((b.stable.length + b.volatile.length) / 3.6);
};
