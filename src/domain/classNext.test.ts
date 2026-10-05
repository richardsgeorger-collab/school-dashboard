import { describe, expect, it } from 'vitest';
import { mkItem, TZ } from '../halo/fixtures';
import { classNext, overdueOf, whenLine } from './classNext';
import { urgentFor } from './urgent';
import { assessmentIssue } from '../halo/normalize';
import { mkAssessment } from '../halo/fixtures';
import { doneLine } from '../joy/joy';

// George's classes, 2026-10-04 (today in Phoenix).
const today = '2026-10-04';
let n = 0;
const it_ = (title: string, due: string, extra = {}) => mkItem({ id: `i${(n += 1)}`, courseId: 'c', title, label: title, type: 'homework', points: 10, dueAt: `${due}T23:59:00-07:00`, ...extra });

describe('a class card: Next and overdue', () => {
  it('puts what Halo calls overdue first, and says how late', () => {
    const late = it_('Week 4, Day 2 Participation', '2026-10-02', { type: 'discussion', points: 0, halo: { status: 'OVERDUE', submittedAt: null, checkedAt: '' } });
    const r = classNext([it_('Chem Activity 2', '2026-10-05'), late], today, TZ);
    expect(r.next?.title).toBe('Week 4, Day 2 Participation');
    expect(r.overdue).toHaveLength(1);
    expect(whenLine(r.next!, today, TZ, (d) => d)).toBe('2 days late');
  });
  it('the soonest unfinished thing next, participation included', () => {
    const r = classNext([it_('Topic 4 Homework', '2026-10-07'), it_('Week 4 Participation', '2026-10-04', { type: 'participation' })], today, TZ);
    expect(r.next?.title).toBe('Week 4 Participation');
  });
  it('never counts finished work: checked off, submitted or graded', () => {
    const items = [
      it_('Done here', '2026-10-01', { status: 'done', completedAt: '2026-10-01T10:00:00Z' }),
      it_('Submitted', '2026-10-01', { halo: { status: 'SUBMITTED', submittedAt: '2026-10-01T10:00:00Z', checkedAt: '' } }),
      it_('Graded', '2026-10-01', { score: 9 }),
    ];
    expect(overdueOf(items, today, TZ)).toEqual([]);
  });
  it('lets old history go unless Halo still calls it overdue', () => {
    expect(overdueOf([it_('Old', '2026-09-01')], today, TZ)).toEqual([]);
    expect(overdueOf([it_('Old but Halo says so', '2026-09-01', { halo: { status: 'OVERDUE', submittedAt: null, checkedAt: '' } })], today, TZ)).toHaveLength(1);
  });
});

describe('Don\'t forget: only live requirements', () => {
  const src = { kind: 'announcement' as const, id: 'a', title: 't', quote: 'q', at: '2026-10-01T00:00:00Z' };
  const req = (id: string, text: string) => ({ id, text, dueAt: null, done: false, doneAt: null, gradedOn: true, source: src, addedAt: '2026-10-01T00:00:00Z' });
  it('nothing on work already finished, and the same line once', () => {
    const open1 = it_('Open', '2026-10-05', { requirements: [req('r1', 'Cite two sources'), req('r2', 'Bring a calculator')] });
    const open2 = it_('Open 2', '2026-10-05', { requirements: [req('r3', 'Cite two sources')] });
    const finished = it_('Finished', '2026-10-05', { status: 'done', completedAt: '2026-10-03T00:00:00Z', requirements: [req('r4', 'Something old')] });
    const u = urgentFor('c', [open1, open2, finished], today, TZ);
    expect(u.map((x) => x.line)).toEqual(['Don\'t forget: Cite two sources by tomorrow', 'Don\'t forget: Bring a calculator by tomorrow']);
    // A checklist of three or more on one assignment is one line.
    const list = it_('English Rhetorical Final', '2026-10-07', { requirements: [req('a', 'Use APA'), req('b', 'Cite both sources'), req('c', 'Proofread')] });
    expect(urgentFor('c', [list], today, TZ).map((x) => x.line)).toEqual(['Don\'t forget: 3 things for English Rhetorical Final by Wednesday']);
  });
  it('labels a day post beside its week', async () => {
    const { shortLabel } = await import('./labels');
    expect(shortLabel({ title: 'Week 4, Day 2 Participation', courseCode: 'CHM-113' })).toBe('Chem Participation W4 Day 2');
  });
});

describe('zero-point posts reach Halo+', () => {
  it('a day participation post or discussion with no points of its own is kept; other zero-point work is not', () => {
    const opts = { tz: TZ, now: '2026-10-04T00:00:00Z' };
    expect(assessmentIssue(mkAssessment({ id: 'a', title: 'Week 4, Day 2 Participation', points: 0, type: 'DISCUSSION_QUESTION' }), opts)).toBeNull();
    expect(assessmentIssue(mkAssessment({ id: 'b', title: 'Week 4 Participation', points: 0, type: 'PARTICIPATION' }), opts)).toBeNull();
    expect(assessmentIssue(mkAssessment({ id: 'c', title: 'Software Installation', points: 0, type: 'ASSIGNMENT' }), opts)).toBe('worth 0 points');
  });
  it('checking one off says Done, not +0 pts', () => {
    expect(doneLine(0, 'CHM-113', 15)).toBe('Done · CHM-113 is 15% complete');
  });
});
