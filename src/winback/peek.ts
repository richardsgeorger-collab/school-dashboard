import { diffHalo } from '../halo/diff';
import { stripHtml } from '../halo/normalize';
import type { HaloExport } from '../halo/types';
import type { AppData } from '../domain/types';

/**
 * Peek sync (George, 2026-09-29): a Free student can still run Sync Halo. Nothing is applied or saved; Halo+ only
 * counts what their own Halo data holds that their planner does not: new assignments, moved due dates, announcements
 * that look like work, new grades. The announcements are judged by a keyword check, no AI and no cost.
 */
export interface Peek {
  since: string | null;
  newAssignments: number;
  movedDates: number;
  workAnnouncements: number;
  newGrades: number;
}

const MONTHS = 'jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec';
const DAYS = 'mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun';
/** Words and shapes that mark an announcement asking for something: due, submit, reply, bring, moved, a quiz, "by" a date. */
export const WORKY = new RegExp(
  [
    '\\b(due|submit|submission|upload|turn in|reply|respond|responses?|bring|moved|postponed|rescheduled|extended|quiz|exam|test|midterm|final|assignment|worksheet|lab report|essay|paper|presentation|read chapters?)\\b',
    `\\bby (${DAYS})[a-z]*\\b`,
    `\\bby (${MONTHS})[a-z]* \\d{1,2}\\b`,
    '\\bby \\d{1,2}/\\d{1,2}\\b',
    '\\bby (tomorrow|tonight|midnight|the end of)\\b',
  ].join('|'),
  'i',
);

export const looksLikeWork = (title: string, content: string): boolean => WORKY.test(`${title} ${stripHtml(content, 4000)}`);

export function peekSummary(payload: HaloExport, data: AppData, tz: string, now = new Date().toISOString()): Peek {
  const since = data.settings.lastPull?.at ?? null;
  const diff = diffHalo(payload, data, { tz, now });
  const workAnnouncements = payload.classes
    .flatMap((c) => c.announcements ?? [])
    .filter((a) => (!since || (a.publishedAt ?? '') > since) && looksLikeWork(a.title, a.content)).length;
  return {
    since,
    newAssignments: diff.added.length,
    movedDates: diff.changed.filter((c) => c.changes.some((f) => f.field === 'dueAt')).length,
    workAnnouncements,
    newGrades: diff.graded.length,
  };
}

const n = (k: number, one: string, many: string) => `${k} ${k === 1 ? one : many}`;

/** "Since Oct 6: 9 new assignments, 2 due dates moved, 3 announcements that look like work, 1 new grade." */
export function peekLine(p: Peek, sinceLabel: string | null): string {
  const parts = [
    p.newAssignments ? n(p.newAssignments, 'new assignment', 'new assignments') : '',
    p.movedDates ? `${n(p.movedDates, 'due date', 'due dates')} moved` : '',
    p.workAnnouncements ? `${n(p.workAnnouncements, 'announcement', 'announcements')} that look${p.workAnnouncements === 1 ? 's' : ''} like work` : '',
    p.newGrades ? n(p.newGrades, 'new grade', 'new grades') : '',
  ].filter(Boolean);
  const lead = sinceLabel ? `Since ${sinceLabel}: ` : '';
  if (parts.length === 0) return `${lead}nothing new in Halo yet. Your planner still matches it.`;
  const list = parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
  return `${lead}${list}.`;
}
