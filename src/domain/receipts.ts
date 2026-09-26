import type { ReadEntry } from '../halo/announce';

/**
 * What Max did for a student in a window, from their own data: announcements read and requirements found (the
 * ledger), lecture notes made (the recordings store), coach questions answered (the chat history). Real counts,
 * never estimates; a zero stays a zero.
 */
export interface Receipts {
  announcementsRead: number;
  requirementsFound: number;
  lectureNotes: number;
  coachAnswers: number;
}

export function receiptsFrom(args: { ledger: Iterable<ReadEntry>; recordingsAt: string[]; chatAt: string[]; since: string }): Receipts {
  const { since } = args;
  let announcementsRead = 0;
  let requirementsFound = 0;
  for (const e of args.ledger) {
    if (e.at < since) continue;
    announcementsRead += 1;
    requirementsFound += e.count;
  }
  return {
    announcementsRead,
    requirementsFound,
    lectureNotes: args.recordingsAt.filter((t) => t >= since).length,
    coachAnswers: args.chatAt.filter((t) => t >= since).length,
  };
}

/** "Max this week: read 23 announcements, found 4 hidden requirements, made 2 lecture notes." or null when nothing. */
export function receiptsLine(r: Receipts, span = 'this week'): string | null {
  const parts: string[] = [];
  if (r.announcementsRead) parts.push(`read ${r.announcementsRead} announcement${r.announcementsRead === 1 ? '' : 's'}`);
  if (r.requirementsFound) parts.push(`found ${r.requirementsFound} hidden requirement${r.requirementsFound === 1 ? '' : 's'}`);
  if (r.lectureNotes) parts.push(`made ${r.lectureNotes} lecture note${r.lectureNotes === 1 ? '' : 's'}`);
  if (r.coachAnswers) parts.push(`answered ${r.coachAnswers} question${r.coachAnswers === 1 ? '' : 's'}`);
  if (parts.length === 0) return null;
  return `Max ${span}: ${parts.join(', ')}.`;
}
