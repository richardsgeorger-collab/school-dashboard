import type { Item } from './types';

/**
 * Work with no way to hand it in on Halo (George, 2026-10-24): an outside tool's activity (Halo's LTI: ALEKS, zyBooks,
 * a publisher's quiz) or anything Halo marks in person (an in-class exam, quiz or lab). Halo never sees these turned in,
 * so once their date passes they are not "overdue": Halo+ cannot know, and nagging about a quiz already taken is wrong.
 * Participation has its own rule (never urgent anywhere).
 */
export const noHaloSubmission = (i: Pick<Item, 'source' | 'type' | 'haloType' | 'flags'>): boolean =>
  i.source === 'halo' && i.type !== 'participation' && (i.haloType === 'LTI' || !!i.flags?.inClass);

/**
 * Past and quiet: no Halo submission, not done, no grade yet, and its due time has gone by. It leaves Now, Then, the
 * overdue counts, pace and the Cooked meter; Calendar and the class page still show it. A grade that arrives later
 * marks it done as usual.
 */
export const isQuietPast = (i: Item, nowMs: number): boolean =>
  noHaloSubmission(i) && i.status !== 'done' && i.score == null && Date.parse(i.dueAt) < nowMs;

/** The note on the item's sheet. */
export const NO_SUBMISSION_NOTE = 'No submission in Halo. Halo+ hides it after the due date.';
