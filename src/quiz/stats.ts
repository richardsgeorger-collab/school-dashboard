import type { QuizStat } from '../domain/types';

export const statKey = (courseId: string, topic: string) => `${courseId}:${topic.trim().toLowerCase().replace(/\s+/g, ' ')}`;

/** One answer recorded against its class and topic. */
export function recordAnswer(stats: Record<string, QuizStat> | undefined, courseId: string, topic: string, missed: boolean, at: string): Record<string, QuizStat> {
  const key = statKey(courseId, topic);
  const prev = stats?.[key];
  const next: QuizStat = { courseId, topic: topic.trim().toLowerCase(), attempts: (prev?.attempts ?? 0) + 1, misses: (prev?.misses ?? 0) + (missed ? 1 : 0), lastAt: at };
  return { ...(stats ?? {}), [key]: next };
}

export interface WeakTopic {
  topic: string;
  attempts: number;
  misses: number;
}

/** Topics missed at least twice and at least half the time, most missed first. */
export function weakTopics(stats: Record<string, QuizStat> | undefined, courseId: string, limit = 4): WeakTopic[] {
  return Object.values(stats ?? {})
    .filter((s) => s.courseId === courseId && s.misses >= 2 && s.misses / s.attempts >= 0.5)
    .sort((a, b) => b.misses - a.misses || b.lastAt.localeCompare(a.lastAt))
    .slice(0, limit)
    .map((s) => ({ topic: s.topic, attempts: s.attempts, misses: s.misses }));
}

/** A one-line read of the class's practice so far, or null before there is anything to say. */
export function practiceLine(stats: Record<string, QuizStat> | undefined, courseId: string): string | null {
  const mine = Object.values(stats ?? {}).filter((s) => s.courseId === courseId);
  const attempts = mine.reduce((a, s) => a + s.attempts, 0);
  if (attempts === 0) return null;
  const misses = mine.reduce((a, s) => a + s.misses, 0);
  const weak = weakTopics(stats, courseId, 2);
  const pct = Math.round(((attempts - misses) / attempts) * 100);
  return weak.length ? `${pct}% right over ${attempts} questions · keeps slipping on ${weak.map((w) => w.topic).join(' and ')}` : `${pct}% right over ${attempts} question${attempts === 1 ? '' : 's'}`;
}
