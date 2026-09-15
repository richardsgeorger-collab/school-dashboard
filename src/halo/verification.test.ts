import { describe, expect, it } from 'vitest';
import type { HaloCheckRecord } from '../domain/types';
import { mkCourse, mkItem, TZ } from './fixtures';
import { classVerifications, cleanStreak, MAX_CHECKS, recordCheck, verificationLine } from './verification';

const chm = mkCourse({ id: 'c1', code: 'CHM-113' });
const eng = mkCourse({ id: 'c2', code: 'ENG-105' });
const items = [mkItem({ id: 'a', courseId: 'c1', title: 'Quiz 1', label: 'Chem Quiz 1' }), mkItem({ id: 'b', courseId: 'c2', title: 'Essay 1', label: 'English Essay 1' })];
const today = '2026-09-14';
const at = (daysAgo: number) => `2026-09-${String(14 - daysAgo).padStart(2, '0')}T20:00:00-07:00`;
const rec = (courseId: string, daysAgo: number, o: Partial<HaloCheckRecord> = {}): HaloCheckRecord => ({ at: at(daysAgo), clean: true, findings: 0, courseId, partial: false, coverage: { visited: 5, planned: 5 }, skipped: [], ...o });
const line = (list: HaloCheckRecord[] | undefined) => verificationLine(list, [chm, eng], items, today, TZ);

describe('per-class verification receipt', () => {
  it('names the most recent check and the weakest class, never an average', () => {
    expect(line(undefined)).toEqual({ text: 'No class verified against Halo yet.', level: 'amber' });
    expect(line([rec('c1', 2)])).toEqual({ text: 'Chem verified 2 days ago · English never checked', level: 'amber' });
    expect(line([rec('c1', 0), rec('c2', 4, { partial: true, clean: false, skipped: ['Announcements', 'Syllabus'] })])).toEqual({ text: 'Chem verified today · English partial 4 days ago, 2 pages skipped', level: 'amber' });
    expect(line([rec('c1', 0, { clean: false, findings: 3 }), rec('c2', 12)])).toEqual({ text: 'Chem verified today (3 findings, reviewed) · English verified 12 days ago', level: 'amber' });
    expect(line([rec('c2', 1, { partial: true, clean: false, coverage: { visited: 3, planned: 5 } })])).toEqual({ text: 'English partial yesterday, 3 of 5 pages · Chem never checked', level: 'amber' });
  });
  it('goes quiet only when every class is recent and complete', () => {
    expect(line([rec('c1', 3), rec('c2', 1)])).toEqual({ text: 'All 2 classes verified within 3 days.', level: 'quiet' });
    expect(line([rec('c1', 0), rec('c2', 0, { clean: false, findings: 1 })])).toEqual({ text: 'All 2 classes verified today.', level: 'quiet' });
    expect(verificationLine([rec('c1', 0)], [chm], items, today, TZ)).toEqual({ text: 'Chem verified today — clean.', level: 'quiet' });
  });
  it('orders classes weakest first and counts clean streaks per class', () => {
    const list = [rec('c1', 5, { clean: false, findings: 2 }), rec('c1', 3), rec('c1', 1), rec('c2', 2, { partial: true, clean: false })];
    const vs = classVerifications(list, [chm, eng], items, today, TZ);
    expect(vs.map((v) => [v.word, v.state, v.days, v.streak])).toEqual([
      ['English', 'partial', 2, 0],
      ['Chem', 'clean', 1, 2],
    ]);
    expect(cleanStreak(list, 'c1')).toBe(2);
    expect(cleanStreak(list)).toBe(0);
    let h: HaloCheckRecord[] = [];
    for (let i = 0; i < MAX_CHECKS + 5; i++) h = recordCheck(h, rec('c1', 0));
    expect(h.length).toBe(MAX_CHECKS);
  });
});
