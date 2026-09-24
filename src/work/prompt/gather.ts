import { addDays, dateOf, fmtDate, zonedParts } from '../../domain/dates';
import { courseGrade } from '../../domain/grades';
import { weakConcepts } from '../../domain/concepts';
import { cleanAll, instanceParts, rulesFor } from '../../domain/reqClean';
import type { Schedule } from '../../domain/schedule';
import type { AppData, Course, Item } from '../../domain/types';
import { announceDb } from '../../halo/announce';
import { libraryDb } from '../../library/db';
import { recordingsDb } from '../../record/db';
import { syllabiDb } from '../../syllabus/db';
import { buildPrompt, type PromptInput } from './build';
import { chapterPhrases, emptyMaterial, pickAnnouncements, quizFacts, slideExcerpts, syllabusExcerpt, termsFor, transcriptWindows, type Lecture, type Material, type Post, type SlidePage } from './excerpts';
import { promptKind, type PromptKind } from './kind';

/** Everything the prompt draws on that lives outside the planner, loaded for one class. */
export interface Raw {
  posts: Post[];
  lectures: Lecture[];
  pages: SlidePage[];
  syllabus: string | null;
}

export async function loadRaw(courseId: string): Promise<Raw> {
  const [posts, recs, decks, pages, syl] = await Promise.all([
    announceDb.list().catch(() => []),
    recordingsDb.list().catch(() => []),
    libraryDb.listDecks().catch(() => []),
    libraryDb.allPages().catch(() => []),
    syllabiDb.get(courseId).catch(() => null),
  ]);
  const mine = recs.filter((r) => r.courseId === courseId);
  const lectures: Lecture[] = [];
  for (const r of mine) {
    const segments = await recordingsDb.segments(r.id).catch(() => []);
    lectures.push({ courseId: r.courseId, title: r.title, startedAt: r.startedAt, segments: segments.map((s) => ({ at: s.at, text: s.text })) });
  }
  const deckById = new Map(decks.filter((d) => d.courseId === courseId).map((d) => [d.id, d]));
  return {
    posts: posts.filter((p) => p.courseId === courseId).map((p) => ({ id: p.id, courseId: p.courseId, title: p.title, text: p.text, publishedAt: p.publishedAt })),
    lectures,
    pages: pages.flatMap((pg) => {
      const d = deckById.get(pg.deckId);
      return d ? [{ deckTitle: d.title, deckTag: d.tag ?? null, courseId: d.courseId, n: pg.n, text: pg.text }] : [];
    }),
    syllabus: syl?.text ?? null,
  };
}

/** The excerpts that fit this assignment, announcements first because they widen what the others are matched on. */
export function materialFor(item: Item, course: Course, raw: Raw, tz: string): Material {
  const m = emptyMaterial();
  m.announcements = pickAnnouncements(item, raw.posts, tz);
  // "Chapters 1 and 2" in an announcement is scope the title never mentions; match the lectures and slides on it too.
  const scope = quizFacts(m.announcements.map((a) => a.text)).scope.join(' ');
  const terms = [...termsFor(item, `${scope} ${(item.requirements ?? []).map((r) => r.text).join(' ')}`), ...chapterPhrases(scope)];
  m.transcripts = transcriptWindows(item, raw.lectures, terms, tz);
  m.slides = slideExcerpts(item, raw.pages, terms);
  m.syllabus = syllabusExcerpt(item, raw.syllabus, course);
  return m;
}

/**
 * Class rules that bear on this kind of work. A file-format rule means nothing on an in-person quiz, and a peer-reply
 * rule means nothing on a paper.
 */
export function rulesThatApply(rules: string[], item: Pick<Item, 'type'>, kind: PromptKind): string[] {
  const aboutDiscussion = /\b(dq|discussion|repl(?:y|ies)|peer|post(?:s|ing)?\b)/i;
  const aboutSitting = /\b(quiz|exam|test|calculator|notes?|phone|device|closed|open[- ]book|scratch)\b/i;
  return rules.filter((r) => {
    if (kind === 'study') return aboutSitting.test(r);
    if (kind === 'gened-dq' || item.type === 'discussion') return true;
    return !aboutDiscussion.test(r);
  });
}

/** What the student has already done on it, one line each. */
export function doneLines(item: Item, tz: string): string[] {
  const out: string[] = [];
  if (item.status === 'done') out.push('Submitted. I want a check against the rubric, not a plan.');
  for (const s of item.steps ?? []) if (s.done) out.push(s.label);
  for (const r of instanceParts(item)) if (r.done) out.push(r.text);
  if (item.startedAt && item.status !== 'done') out.push(`Started ${fmtDate(dateOf(item.startedAt, tz), 'short')}.`);
  return out;
}

/** Free study time from today up to the day it is due, net of everything else already planned. */
export function freeMinutesBefore(item: Item, schedule: Schedule, today: string, tz: string): number | null {
  const due = dateOf(item.dueAt, tz);
  if (due < today) return null;
  const mine = schedule.byItem[item.id];
  let free = 0;
  // An 8 AM quiz leaves no time on the day itself; an 11:59 PM deadline leaves the whole day.
  const lastFull = zonedParts(item.dueAt, tz).hh < 18 ? addDays(due, -1) : due;
  for (let d = today; d <= lastFull; d = addDays(d, 1)) {
    const cap = schedule.capacityByDay[d] ?? 0;
    const load = (schedule.loadByDay[d] ?? 0) - (mine?.plannedByDay[d] ?? 0);
    free += Math.max(0, cap - load);
  }
  return free;
}

/** One prompt for one assignment, from the planner and everything loaded for its class. */
export function promptFor(args: { item: Item; course: Course; data: AppData; schedule: Schedule; raw: Raw; today: string }): string {
  const { item: raw0, course, data, schedule, raw, today } = args;
  const tz = data.settings.timezone;
  // The same cleaning the agenda uses: duplicates collapsed, restatements dropped, rules set apart.
  const cleaned = cleanAll(data.items).items;
  const item = cleaned.find((i) => i.id === raw0.id) ?? raw0;
  const kind = promptKind(item, course);
  const g = courseGrade(course.id, data.items);
  const graded = data.items.filter((i) => i.courseId === course.id && i.score !== null && i.points > 0).length;
  const requirements = instanceParts(item)
    .filter((r) => !r.done)
    .map((r) => ({ text: r.text, quote: r.source.quote, post: r.source.title, date: r.source.at ? fmtDate(dateOf(r.source.at, tz), 'short') : null }));
  const rules = rulesThatApply(
    rulesFor(cleaned, course.id).map((r) => r.text),
    item,
    kind,
  );
  const input: PromptInput = {
    item,
    course,
    kind,
    material: materialFor(item, course, raw, tz),
    grade: { graded, pct: g.pct },
    weak: kind === 'study' ? weakConcepts(course.id, data.items, data.settings.quizStats).slice(0, 4).map((w) => ({ topic: w.topic, pct: w.pct, graded: w.graded })) : [],
    freeMinutes: kind === 'study' ? freeMinutesBefore(item, schedule, today, tz) : null,
    requirements,
    rules,
    done: doneLines(item, tz),
    today,
    tz,
  };
  return buildPrompt(input);
}
