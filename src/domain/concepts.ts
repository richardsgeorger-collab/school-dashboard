import { weakTopics } from '../quiz/stats';
import { addDays, dateOf, diffDays } from './dates';
import type { Course, DateStr, Item, QuizStat, TopicLink } from './types';

/**
 * Conceptual trouble, caught early: scores tracked by topic rather than class, and one line when a weak topic is
 * something later material assumes. Never a dashboard of weaknesses; one line, only when it is real.
 */
export const WEAK_PCT = 75;
export const HORIZON_DAYS = 35;

export interface TopicScore {
  topic: string;
  key: string;
  earned: number;
  possible: number;
  /** Percent of graded points, or null when nothing graded carries the topic. */
  pct: number | null;
  graded: number;
  misses: number;
  attempts: number;
}

export const topicKey = (t: string): string => t.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/** The topics an item carries: Halo's unit, then what the AI pass named. */
export const itemTopics = (item: Item): string[] => [...new Set([item.topic, ...(item.plan?.topics ?? [])].filter((t): t is string => !!t && t.trim().length > 0))];

const matches = (a: string, b: string): boolean => {
  const A = topicKey(a);
  const B = topicKey(b);
  return !!A && !!B && (A === B || A.includes(B) || B.includes(A));
};

/** Points earned and possible per topic in a class, with what practice keeps missing folded in. */
export function topicScores(courseId: string, items: Item[], stats: Record<string, QuizStat> | undefined): TopicScore[] {
  const out = new Map<string, TopicScore>();
  const row = (topic: string) => {
    const key = topicKey(topic);
    let r = out.get(key);
    if (!r) {
      r = { topic, key, earned: 0, possible: 0, pct: null, graded: 0, misses: 0, attempts: 0 };
      out.set(key, r);
    }
    return r;
  };
  for (const i of items) {
    if (i.courseId !== courseId || i.score === null || i.points <= 0) continue;
    for (const t of itemTopics(i)) {
      const r = row(t);
      r.earned += i.score;
      r.possible += i.points;
      r.graded += 1;
    }
  }
  for (const s of Object.values(stats ?? {})) {
    if (s.courseId !== courseId || !s.topic) continue;
    const r = row(s.topic);
    r.misses += s.misses;
    r.attempts += s.attempts;
  }
  for (const r of out.values()) r.pct = r.possible > 0 ? Math.round((r.earned / r.possible) * 100) : null;
  return [...out.values()].sort((a, b) => (a.pct ?? 101) - (b.pct ?? 101) || b.misses - a.misses);
}

/** Topics the student is not getting: under the bar on graded points, or what practice keeps missing. */
export function weakConcepts(courseId: string, items: Item[], stats: Record<string, QuizStat> | undefined): TopicScore[] {
  const practice = new Set(weakTopics(stats, courseId, 6).map((w) => topicKey(w.topic)));
  return topicScores(courseId, items, stats).filter((t) => (t.pct !== null && t.pct < WEAK_PCT && t.possible >= 5) || practice.has(t.key));
}

export interface ConceptWarning {
  courseId: string;
  weak: string;
  pct: number | null;
  dependent: string;
  dependentCourseId: string;
  itemId: string | null;
  when: DateStr;
  weeksOut: number;
  line: string;
}

const weeksWord = (weeks: number) => (weeks <= 0 ? "it's this week" : weeks === 1 ? "it's a week out" : `it's ${weeks} weeks out`);

/**
 * Where a weak topic meets later material that assumes it: the class's own topic map (what builds on what, from the
 * syllabus) and cross-class links. Dated by the first open item that carries the dependent topic, else the syllabus
 * week. Only within the horizon, soonest first.
 */
export function conceptWarnings(courses: Course[], items: Item[], links: TopicLink[], stats: Record<string, QuizStat> | undefined, today: DateStr, tz: string, horizonDays = HORIZON_DAYS): ConceptWarning[] {
  const out: ConceptWarning[] = [];
  const byId = new Map(courses.map((c) => [c.id, c]));
  const whenFor = (course: Course, topic: string): { when: DateStr; itemId: string | null } | null => {
    const open = items
      .filter((i) => i.courseId === course.id && i.status !== 'done' && dateOf(i.dueAt, tz) >= today && itemTopics(i).some((t) => matches(t, topic)))
      .sort((a, b) => a.dueAt.localeCompare(b.dueAt))[0];
    if (open) return { when: dateOf(open.dueAt, tz), itemId: open.id };
    const node = (course.topics ?? []).find((t) => matches(t.name, topic));
    if (node?.week) {
      const when = addDays(course.termStart, (node.week - 1) * 7);
      return when >= today ? { when, itemId: null } : null;
    }
    return null;
  };
  for (const course of courses) {
    for (const weak of weakConcepts(course.id, items, stats)) {
      const dependents: { course: Course; topic: string }[] = [];
      for (const node of course.topics ?? []) if (node.buildsOn.some((b) => matches(b, weak.topic)) && !matches(node.name, weak.topic)) dependents.push({ course, topic: node.name });
      for (const l of links) {
        if (l.a.courseId === course.id && matches(l.a.topic, weak.topic) && byId.get(l.b.courseId)) dependents.push({ course: byId.get(l.b.courseId)!, topic: l.b.topic });
        if (l.b.courseId === course.id && matches(l.b.topic, weak.topic) && byId.get(l.a.courseId)) dependents.push({ course: byId.get(l.a.courseId)!, topic: l.a.topic });
      }
      for (const d of dependents) {
        const at = whenFor(d.course, d.topic);
        if (!at || diffDays(today, at.when) > horizonDays) continue;
        if (out.some((w) => w.courseId === course.id && w.weak === weak.topic && w.dependent === d.topic)) continue;
        const weeksOut = Math.round(diffDays(today, at.when) / 7);
        out.push({
          courseId: course.id,
          weak: weak.topic,
          pct: weak.pct,
          dependent: d.topic,
          dependentCourseId: d.course.id,
          itemId: at.itemId,
          when: at.when,
          weeksOut,
          line: `You're not getting ${weak.topic}${weak.pct !== null ? ` (${weak.pct}% so far)` : ''}. ${d.course.code} ${d.topic} assumes it and ${weeksWord(weeksOut)}.`,
        });
      }
    }
  }
  return out.sort((a, b) => a.when.localeCompare(b.when));
}

/** The one line for Now: the soonest warning inside a few weeks, or nothing. */
export function conceptLine(warnings: ConceptWarning[], maxWeeks = 3): string | null {
  const w = warnings.find((x) => x.weeksOut <= maxWeeks);
  return w ? w.line : null;
}
