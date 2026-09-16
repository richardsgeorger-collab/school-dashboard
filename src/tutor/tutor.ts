import { callText, type SystemBlock, type Turn } from '../ai/client';
import { dateOf, diffDays, fmtDate } from '../domain/dates';
import type { Course, DateStr, Item, TopicLink } from '../domain/types';
import { sourcesBlock, type QuizSource } from '../quiz/sources';
import type { Recording } from '../record/db';

/**
 * A tutor that knows the class: it teaches from the student's own slides, transcripts, and syllabus, in the professor's
 * notation, cites what it uses, weights toward what is coming, and never hands over an answer or anything submittable.
 */
export const TUTOR_SYSTEM = `You are a tutor inside a college freshman's planner, for one class at a time. You teach from the student's own material — their professor's slides, lecture transcripts, and syllabus, given below with [S#] ids — in the professor's notation and terms, and you cite what you use as [S#] right after the sentence it supports.

Rules:
- Teach from the sources. When they cover the question, use their wording and notation and cite the slide or lecture moment. When they do not, say so in one sentence, then teach the idea plainly and mark it "(not from your class material)".
- "Explain this like I'm behind" means: start from the ground the student is missing, one idea at a time, short paragraphs, plain words, and end with one small check question.
- Problems: never give the answer. If the student has not said what they tried, ask that first, in one line. Then give the next step only, and stop. If they are stuck on the same step twice, show that one step worked out and hand the next one back.
- Weight toward what is coming: the quiz or exam listed under "Coming up" and anything the professor called exam material. When the question touches those, say so in a few words.
- When a cross-class link is listed and it helps, use it once: "this is the same move as X in Y."
- Never write anything the student would submit: no discussion posts, no essay sentences, no solved problem sets, no code to hand in. If asked, say so plainly in one sentence and offer the structure, the first step, or the concept instead.
- Plain words, calm, no emoji, no exclamation marks. Under 180 words unless a worked step needs more.`;

export interface Upcoming {
  label: string;
  type: string;
  due: DateStr;
  points: number;
  topics: string[];
}

export interface ExamFlag {
  point: string;
  quote: string;
  at: string;
  lecture: string;
}

export interface TutorSituation {
  course: Course;
  topic: string;
  today: DateStr;
  upcoming: Upcoming[];
  examFlags: ExamFlag[];
  weak: string[];
  links: { other: string; topic: string; note: string }[];
  item: { title: string; asks: string } | null;
}

const topicsOf = (i: Item): string[] => [...new Set([i.topic, ...(i.plan?.topics ?? [])].filter((t): t is string => !!t))];

/** What the tutor should know beyond the sources: what is coming, what was flagged, where the student is weak. */
export function tutorSituation(course: Course, items: Item[], recordings: Recording[], weak: string[], links: TopicLink[], courses: Course[], today: DateStr, tz: string, topic: string, item: Item | null = null): TutorSituation {
  const upcoming = items
    .filter((i) => i.courseId === course.id && i.status !== 'done' && dateOf(i.dueAt, tz) >= today && (i.type === 'exam' || i.type === 'quiz' || i.points >= 50))
    .sort((a, b) => a.dueAt.localeCompare(b.dueAt))
    .slice(0, 4)
    .map((i) => ({ label: i.label, type: i.type, due: dateOf(i.dueAt, tz), points: i.points, topics: topicsOf(i) }));
  const examFlags = recordings
    .filter((r) => r.courseId === course.id && r.notes?.knowledge?.examFlags.length)
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
    .flatMap((r) => (r.notes?.knowledge?.examFlags ?? []).map((p) => ({ ...p, lecture: `${r.title}, ${fmtDate(dateOf(r.startedAt, tz), 'short')}` })))
    .slice(0, 10);
  const code = new Map(courses.map((c) => [c.id, c.code]));
  const t = topic.toLowerCase();
  const linked = links
    .filter((l) => (l.a.courseId === course.id && (t.includes(l.a.topic.toLowerCase()) || l.a.topic.toLowerCase().includes(t))) || (l.b.courseId === course.id && (t.includes(l.b.topic.toLowerCase()) || l.b.topic.toLowerCase().includes(t))))
    .map((l) => (l.a.courseId === course.id ? { other: code.get(l.b.courseId) ?? '?', topic: l.b.topic, note: l.note } : { other: code.get(l.a.courseId) ?? '?', topic: l.a.topic, note: l.note }))
    .slice(0, 3);
  return { course, topic, today, upcoming, examFlags, weak: weak.slice(0, 5), links: linked, item: item ? { title: item.title, asks: item.plan?.asks ?? item.brief?.asks.join(' ') ?? '' } : null };
}

export function situationText(s: TutorSituation): string {
  const lines = [`Class: ${s.course.code} ${s.course.name}`, `Today: ${s.today}`, `Topic the student asked about: ${s.topic || '(not named yet)'}`];
  if (s.item) lines.push(`The assignment they are working toward: "${s.item.title}"${s.item.asks ? ` — ${s.item.asks}` : ''}`);
  if (s.upcoming.length) lines.push(`Coming up: ${s.upcoming.map((u) => `${u.label} (${u.type}, ${u.points} pts, due ${u.due}, ${diffDays(s.today, u.due)} days${u.topics.length ? `, on ${u.topics.join(', ')}` : ''})`).join('; ')}`);
  if (s.examFlags.length) lines.push(`The professor called exam material: ${s.examFlags.map((f) => `"${f.point}" (${f.lecture}${f.at ? ` at ${f.at}` : ''})`).join('; ')}`);
  if (s.weak.length) lines.push(`Where the student has been weak: ${s.weak.join(', ')}`);
  if (s.links.length) lines.push(`Cross-class links: ${s.links.map((l) => `${l.other} ${l.topic} — ${l.note}`).join('; ')}`);
  return lines.join('\n');
}

/** The system blocks: the rules and the sources are cached across turns; the situation is small and changes. */
export function buildTutorBlocks(sources: QuizSource[], situation: TutorSituation): SystemBlock[] {
  return [
    { text: TUTOR_SYSTEM, cache: true },
    { text: sources.length ? `Sources from the student's own material (cite as [S#]):\n\n${sourcesBlock(sources)}` : 'No class material is on file for this topic. Say so when it matters, and teach plainly, marked as not from the class material.', cache: true },
    { text: situationText(situation) },
  ];
}

export const BEHIND = (topic: string) => `Explain ${topic || 'this'} like I'm behind.`;
export const STUCK = "I'm stuck on a problem. Here's what I have so far: ";

export async function askTutor(args: { apiKey: string; fetch?: typeof globalThis.fetch; sources: QuizSource[]; situation: TutorSituation; history: Turn[]; text: string }): Promise<string> {
  const r = await callText({ apiKey: args.apiKey, fetch: args.fetch, kind: 'tutor', system: buildTutorBlocks(args.sources, args.situation), history: args.history, user: args.text, maxTokens: 900 });
  return r.text || 'I did not have anything to add.';
}

/** The sources an answer cited, in order of first mention. */
export function citedSources(answer: string, sources: QuizSource[]): QuizSource[] {
  const ids = [...answer.matchAll(/\[(S\d+)\]/g)].map((m) => m[1]);
  const seen = new Set<string>();
  const out: QuizSource[] = [];
  for (const id of ids) {
    if (seen.has(id)) continue;
    seen.add(id);
    const s = sources.find((x) => x.id === id);
    if (s) out.push(s);
  }
  return out;
}
