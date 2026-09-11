import { dateOf } from '../domain/dates';
import type { Course, DateStr, Item } from '../domain/types';
import { nextWeekday } from './match';
import type { LectureNotes } from './notes';

/** A made-up CHM-113 lecture so the review flow can be seen before any real recording exists. */
export const SAMPLE_TRANSCRIPT = `Okay, let's get started. Last time we finished naming ionic compounds, and today we're moving into stoichiometry, which is really the heart of this course. The mole is the bridge between what you can weigh on a balance and how many particles you actually have. One mole is 6.022 times ten to the twenty-third of anything.

Before we go further, two announcements. The quiz that was scheduled for this week is moving to Friday, same format, same points, because I want you to have one more lecture on limiting reagents first. Second, please read chapter four before Wednesday's class. There will be a short reading check at the start of class, ten points, just to make sure everyone has looked at the material.

Now, a balanced equation gives you mole ratios. If two moles of hydrogen react with one mole of oxygen, then four moles of hydrogen need two moles of oxygen. The coefficients are the ratio; that's all they are. When one reactant runs out first, that's the limiting reagent, and it decides how much product you can make.

Somebody asked about the exam. The exam date has not changed, it is exactly where the syllabus says. And there is no homework due this week, take the week to catch up on anything you're behind on. Okay, let's work an example on the board.`;

/**
 * Sample notes shaped around the planner's real items for the class, so each proposal kind shows
 * against something recognizable: move the next quiz, add a reading check, confirm the exam, cancel the next homework.
 */
export function sampleNotes(lectureDate: DateStr, items: Item[], course: Course, tz: string): LectureNotes {
  const open = items
    .filter((i) => i.courseId === course.id && i.status !== 'done' && dateOf(i.dueAt, tz) >= lectureDate)
    .sort((a, b) => a.dueAt.localeCompare(b.dueAt));
  const quiz = open.find((i) => i.type === 'quiz') ?? null;
  const exam = open.find((i) => i.type === 'exam') ?? null;
  const hw = open.find((i) => i.type === 'homework') ?? null;
  const friday = nextWeekday('Friday', lectureDate)!;
  const wednesday = nextWeekday('Wednesday', lectureDate)!;
  const classStart = course.meetings[0]?.start ?? null;
  return {
    model: 'sample',
    createdAt: new Date().toISOString(),
    summary: [
      'The mole links measurable mass to particle counts: 6.022 × 10²³ per mole.',
      'Balanced-equation coefficients are mole ratios and nothing more.',
      'The limiting reagent runs out first and caps the product.',
      'This week’s quiz moved to Friday; a chapter 4 reading check was added.',
      'Exam date unchanged; no homework due this week.',
    ],
    concepts: ['mole', "Avogadro's number", 'mole ratio', 'limiting reagent', 'stoichiometry'],
    mentions: [
      {
        id: 'm1',
        quote: 'The quiz that was scheduled for this week is moving to Friday, same format, same points.',
        kind: 'date_change',
        title: quiz?.title ?? 'Quiz',
        date: friday,
        time: null,
        points: quiz?.points ?? null,
        confidence: 'high',
        itemId: quiz?.id ?? null,
      },
      {
        id: 'm2',
        quote: "Please read chapter four before Wednesday's class. There will be a short reading check at the start of class, ten points.",
        kind: 'new',
        title: 'Chapter 4 reading check',
        date: wednesday,
        time: classStart,
        points: 10,
        confidence: 'high',
        itemId: null,
      },
      {
        id: 'm3',
        quote: 'The exam date has not changed, it is exactly where the syllabus says.',
        kind: 'info',
        title: exam?.title ?? 'Exam',
        date: exam ? dateOf(exam.dueAt, tz) : null,
        time: null,
        points: null,
        confidence: 'medium',
        itemId: exam?.id ?? null,
      },
      {
        id: 'm4',
        quote: 'There is no homework due this week, take the week to catch up.',
        kind: 'cancel',
        title: hw?.title ?? 'Homework',
        date: null,
        time: null,
        points: null,
        confidence: 'low',
        itemId: hw?.id ?? null,
      },
    ],
  };
}
