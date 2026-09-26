import { describe, expect, it } from 'vitest';
import { receiptsFrom, receiptsLine } from './receipts';

describe('value receipts', () => {
  it('count only what happened in the window, from the student’s own records', () => {
    const ledger = [
      { id: 'a', hash: 'x', at: '2026-09-24T10:00:00.000Z', summary: null, count: 3 },
      { id: 'b', hash: 'y', at: '2026-09-25T10:00:00.000Z', summary: null, count: 1 },
      { id: 'c', hash: 'z', at: '2026-09-10T10:00:00.000Z', summary: null, count: 9 },
    ];
    const r = receiptsFrom({ ledger, recordingsAt: ['2026-09-25T08:00:00.000Z'], chatAt: ['2026-09-01T00:00:00.000Z', '2026-09-25T09:00:00.000Z'], since: '2026-09-20T00:00:00.000Z' });
    expect(r).toEqual({ announcementsRead: 2, requirementsFound: 4, lectureNotes: 1, coachAnswers: 1 });
    expect(receiptsLine(r)).toBe('Max this week: read 2 announcements, found 4 hidden requirements, made 1 lecture note, answered 1 question.');
  });
  it('says nothing when there is nothing, rather than inventing a number', () => {
    expect(receiptsLine({ announcementsRead: 0, requirementsFound: 0, lectureNotes: 0, coachAnswers: 0 })).toBeNull();
  });
});
