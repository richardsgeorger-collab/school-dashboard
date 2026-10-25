import { isParticipation } from './participation';
import type { Item } from './types';

/**
 * Work with no way to hand it in on Halo (George, 2026-10-24): an outside tool's activity (Halo's LTI: ALEKS, zyBooks,
 * a publisher's quiz) or what Halo itself says is "Not Submitted in Halo" (its own inPerson field: in-class exams and
 * quizzes). Not Halo+'s "in class" flag: a syllabus sets that too, and CHM-113L's labs meet in person yet have a
 * dropbox. Anything Halo shows handed in has a submission. Halo never sees the others turned in, so once their date
 * passes they are not "overdue". Participation has its own rule (never urgent anywhere).
 */
export const noHaloSubmission = (i: Pick<Item, 'source' | 'type' | 'haloType' | 'haloInPerson' | 'halo'>): boolean =>
  i.source === 'halo' &&
  i.type !== 'participation' &&
  !i.halo?.submittedAt &&
  i.halo?.status !== 'SUBMITTED' &&
  (i.haloType === 'LTI' || (i.haloInPerson === true && i.haloType !== 'QUIZ' && i.haloType !== 'DISCUSSION_QUESTION'));

/**
 * Past and quiet: not done, no grade yet, its due time gone by, and either no Halo submission or participation.
 * Participation is never overdue or urgent anywhere (George, 2026-10-24: "Chem Participation W7 Day 1 · 3 days late",
 * "Behind: 1 overdue" on CHM-113's card; a day's post Halo files as a discussion question, 0 points, LATE). It leaves
 * Now, Then, Next, the overdue counts, Behind, pace, reminders and the Cooked meter; Calendar and the class page still
 * show it, uncoloured. A grade that arrives later marks it done as usual.
 */
export const isQuietPast = (i: Item, nowMs: number): boolean =>
  (noHaloSubmission(i) || isParticipation(i)) && i.status !== 'done' && i.score == null && Date.parse(i.dueAt) < nowMs;

/** The note on the item's sheet. */
export const NO_SUBMISSION_NOTE = 'No submission in Halo. Halo+ hides it after the due date.';
