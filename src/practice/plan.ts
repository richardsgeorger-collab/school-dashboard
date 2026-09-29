import { dateOf, diffDays } from '../domain/dates';
import { examMode, fewerLongerSessions, type ExamPlan } from '../domain/exam';
import { sessionTopics, topicBlocks, type SessionTopic, type TopicBlock } from '../domain/examTopics';
import type { Schedule } from '../domain/schedule';
import type { DateStr, Item, QuizStat, Settings } from '../domain/types';
import type { Deck, DeckPage } from '../library/db';
import { isTest } from '../study/upcoming';

/**
 * A study plan for one named quiz or exam, not just the nearest: the same planner Now uses in exam mode, pointed at
 * this test. Other tests before it still count as committed work (they are treated as homework for the purpose of
 * the plan, since only one test can be the one being planned), and the study is a few real sessions.
 */
export function planForTest(test: Item, items: Item[], schedule: Schedule, settings: Settings, today: DateStr, minutesFor: (i: Item) => number = (i) => i.estimatedMinutes): ExamPlan | null {
  const tz = settings.timezone;
  const day = dateOf(test.dueAt, tz);
  if (day < today) return null;
  const others = items.map((i) => (i.id !== test.id && isTest(i) ? { ...i, type: 'homework' as const } : i));
  const plan = examMode(others, schedule, settings, today, minutesFor, { types: [test.type], days: diffDays(today, day) });
  if (!plan || plan.exam.id !== test.id) return null;
  return fewerLongerSessions(plan);
}

/** The test's own topics, from its title, its topic field and its plan. */
export const testTopics = (test: Item): string[] => [...new Set([test.topic, ...(test.plan?.topics ?? [])].filter((t): t is string => !!t && t.trim().length > 0))];

/**
 * What each session covers: the class's material in study-sized blocks, the test's own topics first, then what the
 * student keeps missing, then the rest in teaching order.
 */
export function topicsForTest(test: Item, count: number, decks: Deck[], pages: DeckPage[], stats: Record<string, QuizStat> | undefined): SessionTopic[] {
  const own = testTopics(test).map((t) => t.toLowerCase());
  const blocks = topicBlocks(test.courseId, decks, pages, stats, []);
  const named = (b: TopicBlock) => own.some((t) => b.topic.toLowerCase().includes(t) || t.includes(b.topic.toLowerCase()));
  const ordered = [...blocks.filter(named), ...blocks.filter((b) => !named(b))];
  return sessionTopics(count, ordered);
}
