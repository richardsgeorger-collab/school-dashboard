import { describe, expect, it } from 'vitest';
import { mkAssessment, mkClass, mkCourse, mkData, mkExport, mkItem, NOW, TZ } from '../halo/fixtures';
import type { Item } from '../domain/types';
import { looksLikeWork, peekLine, peekSummary } from './peek';
import { examLine, examOffer, planWinback, staleLine, WEEK, type WinbackInput } from './rules';

const chm = mkCourse({ id: 'c1', code: 'CHM-113' });
const ann = (id: string, title: string, content: string, publishedAt = '2026-09-10T16:00:00.000Z') => ({ id, forumId: 'f', title, content, publishedAt, modifiedAt: null, author: null, mustAcknowledge: false, acknowledged: false, resources: [] });

describe('peek sync: counts only, from their own Halo data', () => {
  it('announcements that ask for something look like work; the rest do not', () => {
    expect(looksLikeWork('Reminder', '<p>Bring your goggles to lab.</p>')).toBe(true);
    expect(looksLikeWork('Quiz moved', 'See you Thursday')).toBe(true);
    expect(looksLikeWork('Heads up', 'Please finish the reading by Friday.')).toBe(true);
    expect(looksLikeWork('Heads up', 'Get it to me by Oct 9 please')).toBe(true);
    expect(looksLikeWork('Heads up', 'send it by 10/9')).toBe(true);
    expect(looksLikeWork('Welcome!', '<p>Great first week, everyone. Enjoy the weekend.</p>')).toBe(false);
    expect(looksLikeWork('Office hours', 'I stand by my earlier comment about the Lopes.')).toBe(false);
  });

  it('new assignments, moved due dates, work announcements since the last sync; nothing is changed', () => {
    const data = mkData([chm], [mkItem({ id: 'i1', courseId: 'c1', title: 'Topic 1 Quiz', haloId: 'h1', source: 'halo' })]);
    data.settings = { ...data.settings, lastPull: { at: '2026-09-09T16:00:00.000Z' } as never };
    const before = JSON.stringify(data);
    const payload = mkExport([
      mkClass({
        id: 'k1',
        courseCode: 'CHM-113',
        assessments: [mkAssessment({ id: 'h1', title: 'Topic 1 Quiz', dueDate: '2026-09-16T06:59:00.000Z' }), mkAssessment({ id: 'h2', title: 'Lab 2' }), mkAssessment({ id: 'h3', title: 'Essay' })],
        announcements: [ann('a1', 'Lab', 'Submit your lab report by Friday'), ann('a2', 'Hi', 'Have a nice weekend'), ann('a3', 'Old', 'Quiz due', '2026-09-01T16:00:00.000Z')],
      }),
    ]);
    const p = peekSummary(payload, data, TZ, NOW);
    expect(p).toMatchObject({ since: '2026-09-09T16:00:00.000Z', newAssignments: 2, movedDates: 1, workAnnouncements: 1 });
    expect(JSON.stringify(data)).toBe(before);
  });

  it('one sentence, with "and" before the last and nothing for zero', () => {
    expect(peekLine({ since: 'x', newAssignments: 9, movedDates: 2, workAnnouncements: 3, newGrades: 1 }, 'Oct 6')).toBe('Since Oct 6: 9 new assignments, 2 due dates moved, 3 announcements that look like work and 1 new grade.');
    expect(peekLine({ since: 'x', newAssignments: 1, movedDates: 0, workAnnouncements: 1, newGrades: 0 }, 'Oct 6')).toBe('Since Oct 6: 1 new assignment and 1 announcement that looks like work.');
    expect(peekLine({ since: null, newAssignments: 0, movedDates: 0, workAnnouncements: 0, newGrades: 0 }, null)).toBe('nothing new in Halo yet. Your planner still matches it.');
  });
});

const quiz = (id: string, due: string, over: Partial<Item> = {}) => mkItem({ id, courseId: 'c1', title: id, label: id, type: 'quiz', points: 20, dueAt: `${due}T23:59:00-07:00`, ...over });
// 2026-10-05 is a Monday; 6 AM Phoenix.
const base: WinbackInput = { items: [], tz: TZ, today: '2026-10-05', now: '2026-10-05T13:00:00.000Z', lastPull: '2026-09-28T16:00:00.000Z', quietFrom: '22:00', quietTo: '07:00', eligible: true, lastSentAt: null, ignoredInRow: 0 };

describe('exam-week offer', () => {
  it('a quiz or exam 3 to 5 days out, never nearer, further, done or ungraded', () => {
    expect(examOffer([quiz('Chem Quiz 2', '2026-10-09')], '2026-10-05', TZ)?.id).toBe('Chem Quiz 2');
    expect(examOffer([quiz('Soon', '2026-10-07')], '2026-10-05', TZ)).toBeNull();
    expect(examOffer([quiz('Far', '2026-10-11')], '2026-10-05', TZ)).toBeNull();
    expect(examOffer([quiz('Done', '2026-10-09', { status: 'done' })], '2026-10-05', TZ)).toBeNull();
    expect(examOffer([quiz('Practice', '2026-10-09', { points: 0 })], '2026-10-05', TZ)).toBeNull();
    expect(examOffer([quiz('HW', '2026-10-09', { type: 'homework' })], '2026-10-05', TZ)).toBeNull();
  });
  it('names the day, and says the dates are as of the last sync when it is old', () => {
    const q = quiz('Chem Quiz 2', '2026-10-09');
    expect(examLine(q, TZ, '2026-10-04T16:00:00.000Z', base.now)).toBe('Your Chem Quiz 2 is Friday. Get a study plan and practice worksheet with Max.');
    expect(examLine(q, TZ, '2026-09-28T16:00:00.000Z', base.now)).toBe('Your Chem Quiz 2 is Friday. Get a study plan and practice worksheet with Max. (Dates as of your last sync, Sep 28.)');
  });
});

describe('win-back pushes are never spammy', () => {
  it('the exam-week push at 9 today, opening Practice for that quiz', () => {
    const [n, ...rest] = planWinback({ ...base, items: [quiz('Chem Quiz 2', '2026-10-09')] });
    expect(rest).toHaveLength(0);
    expect(n).toMatchObject({ kind: 'winback_exam', sendAt: '2026-10-05T16:00:00.000Z', url: '#/practice?i=Chem Quiz 2&wb=exam', key: 'winback_exam:Chem Quiz 2' });
    expect(n.body).toContain('Your Chem Quiz 2 is Friday.');
  });
  it('otherwise the out-of-date push at 10 on the first morning a full week after this visit, opening the peek', () => {
    expect(planWinback({ ...base, now: '2026-10-06T00:30:00.000Z' })[0].sendAt).toBe('2026-10-13T17:00:00.000Z'); // 5:30 PM visit: the 8th morning
    const [n] = planWinback(base);
    expect(n).toMatchObject({ kind: 'winback_stale', sendAt: '2026-10-12T17:00:00.000Z', url: '#/now?peek=1&wb=stale' });
    expect(n.body).toBe("Your Halo+ planner is 2 weeks out of date. See what's changed.");
    expect(staleLine('2026-09-28T16:00:00.000Z', '2026-10-01T16:00:00.000Z')).toBe("Your Halo+ planner is 1 week out of date. See what's changed.");
  });
  it('at most one a week across every kind: an exam push that would land too late is dropped', () => {
    const lastSentAt = new Date(new Date(base.now).getTime() - 2 * 86_400_000).toISOString();
    expect(planWinback({ ...base, lastSentAt, items: [quiz('Chem Quiz 2', '2026-10-09')] }).map((n) => n.kind)).toEqual(['winback_stale']);
    const [n] = planWinback({ ...base, lastSentAt: '2026-10-10T17:00:00.000Z' });
    expect(new Date(n.sendAt).getTime()).toBeGreaterThanOrEqual(new Date('2026-10-10T17:00:00.000Z').getTime() + WEEK);
  });
  it('respects quiet hours', () => {
    const [n] = planWinback({ ...base, lastSentAt: '2026-10-06T05:30:00.000Z' }); // + a week = 10:30 PM Phoenix
    expect(n.sendAt).toBe('2026-10-13T14:00:00.000Z'); // 7 AM
  });
  it('nothing after three ignored in a row, for anyone not eligible, or before a first sync', () => {
    expect(planWinback({ ...base, ignoredInRow: 3 })).toEqual([]);
    expect(planWinback({ ...base, eligible: false })).toEqual([]);
    expect(planWinback({ ...base, lastPull: null })).toEqual([]);
    expect(planWinback({ ...base, ignoredInRow: 2 })).toHaveLength(1);
  });
});
