import { describe, expect, it } from 'vitest';
import { mkCourse, mkItem, TZ } from '../halo/fixtures';
import { blockedLine, blockPhrase, blockRanOut, blockUntil, isBlocked, makeBlock } from './blocked';
import { nowMode, rankItems, todayLine } from './now';
import { computeSchedule } from './schedule';
import { DEFAULT_SETTINGS } from './types';

const at = (d: string) => `${d}T23:59:00-07:00`;
const today = '2026-09-17'; // a Thursday
const esgl = mkCourse({ id: 'esgl', code: 'ESG-162L', meetings: [{ day: 2, start: '13:00', end: '15:45' }] });
const eng = mkCourse({ id: 'eng', code: 'ENG-105', online: true, meetings: [] });
const lab = mkItem({ id: 'lab', courseId: 'esgl', title: 'CLC Lab 2 Report', label: 'Eng Math Lab 2', type: 'lab', points: 50, dueAt: at('2026-09-19'), estimatedMinutes: 120 });
const post = mkItem({ id: 'post', courseId: 'eng', title: 'Topic 3 DQ 1', label: 'Eng DQ 3.1', type: 'discussion', points: 5, dueAt: at('2026-09-18'), estimatedMinutes: 25 });
const far = mkItem({ id: 'far', courseId: 'eng', title: 'Final Draft', label: 'Eng Final', type: 'paper', points: 200, dueAt: at('2026-11-01'), estimatedMinutes: 240 });
const settings = { ...DEFAULT_SETTINGS, timezone: TZ };
const sched = (items: typeof lab[]) => computeSchedule(items, settings, today, { start: '2026-08-31', end: '2026-12-13' }, `${today}T16:00:00.000Z`);

describe('blocked is not snoozed', () => {
  it('comes back when the blocker plausibly clears: the next class for the instructor, a few days otherwise, never past the day before it is due', () => {
    expect(blockUntil('instructor', far, esgl, today, TZ)).toBe('2026-09-22'); // next Tuesday the lab meets
    expect(blockUntil('instructor', far, eng, today, TZ)).toBe('2026-09-19'); // online: two days
    expect(blockUntil('feedback', far, eng, today, TZ)).toBe('2026-09-20');
    expect(blockUntil('partner', far, eng, today, TZ)).toBe('2026-09-19');
    // Due Saturday: the wait cannot run past Friday.
    expect(blockUntil('feedback', lab, esgl, today, TZ)).toBe('2026-09-18');
    // Due tomorrow: it still gets tomorrow, never today.
    expect(blockUntil('partner', post, eng, today, TZ)).toBe('2026-09-18');
  });
  it('leaves Now entirely, is not counted as late or due, and returns on its own', () => {
    const blocked = { ...lab, blocked: makeBlock('partner', lab, esgl, today, TZ, 'CLC partner has the data', `${today}T10:00:00.000Z`) };
    const items = [blocked, post, far];
    const s = sched(items);
    expect(isBlocked(blocked, today)).toBe(true);
    expect(rankItems(items, s, `${today}T16:00:00.000Z`, TZ).map((i) => i.id)).toEqual(['post', 'far']);
    expect(todayLine(items, s, today, `${today}T16:00:00.000Z`, TZ)).toBe('Nothing due today. Next deadline Tomorrow, 1 thing.');
    expect(nowMode(items, s, settings, today, `${today}T16:00:00.000Z`).mode).toBe('urgent');
    expect(blockPhrase(blocked, TZ)).toBe('waiting on your partner (CLC partner has the data) since Sep 17');
    // Two days on, the wait has run out: it is back, and the hero can say what it was waiting on.
    const later = '2026-09-19';
    expect(isBlocked(blocked, later)).toBe(false);
    expect(blockRanOut(blocked, later)).toBe(true);
    // Back in the ranking (the post, now past its date, still comes first).
    expect(rankItems(items, sched(items), `${later}T16:00:00.000Z`, TZ).map((i) => i.id)).toEqual(['post', 'lab', 'far']);
  });
  it('turns into its own line when the deadline closes in while it is still blocked', () => {
    const blocked = { ...far, dueAt: at('2026-09-18'), blocked: { reason: 'partner' as const, note: '', since: `${today}T10:00:00.000Z`, until: '2026-09-18' } };
    const items = [blocked, post];
    const line = blockedLine(items, [eng, esgl], sched(items), today, TZ);
    expect(line?.text).toBe('ENG-105 Eng Final is blocked (waiting on your partner) and due tomorrow — time to chase your partner.');
    expect(line?.action).toBe('Time to chase your partner.');
    expect(line?.item.id).toBe('far');
    // Nothing close: nothing to say.
    const calm = { ...far, blocked: { reason: 'feedback' as const, note: '', since: '', until: '2026-09-20' } };
    expect(blockedLine([calm, post], [eng], sched([calm, post]), today, TZ)).toBeNull();
  });
});

describe('a derived deadline that cascaded into the past', () => {
  it('counts as today, so a small post never outranks a big paper due tomorrow', () => {
    const paper = mkItem({ id: 'paper', courseId: 'eng', title: 'Final Draft of a Rhetorical Analysis', label: 'Eng Rhetorical Analysis', type: 'paper', points: 175, dueAt: at('2026-09-18'), estimatedMinutes: 300 });
    const dq = mkItem({ id: 'dq', courseId: 'eng', title: 'Topic 3 DQ 1', label: 'Eng DQ 3.1', type: 'discussion', points: 5, dueAt: at('2026-09-20'), estimatedMinutes: 25 });
    const items = [paper, dq];
    // The post's derived deadline has been pulled three days earlier than its due date, past today; the paper's two days early.
    const s = computeSchedule([{ ...paper, deadlineAt: at('2026-09-16') }, { ...dq, deadlineAt: at('2026-09-15') }], settings, today, { start: '2026-08-31', end: '2026-12-13' }, `${today}T16:00:00.000Z`);
    expect(rankItems(items, s, `${today}T16:00:00.000Z`, TZ).map((i) => i.id)).toEqual(['paper', 'dq']);
  });
});

describe('starting a thing keeps it on Now', () => {
  it('an in-progress big item still needs attention today, so Start never makes the hero vanish', () => {
    const paper = mkItem({ id: 'paper', courseId: 'eng', title: 'Final Draft', label: 'Eng Final', type: 'paper', points: 175, dueAt: at('2026-09-18'), estimatedMinutes: 300, status: 'in_progress', startedAt: `${today}T15:00:00.000Z` });
    const dq = mkItem({ id: 'dq', courseId: 'eng', title: 'Topic 3 DQ 1', label: 'Eng DQ 3.1', type: 'discussion', points: 5, dueAt: at('2026-09-20'), estimatedMinutes: 25 });
    const s = computeSchedule([paper, { ...dq, deadlineAt: at(today) }], settings, today, { start: '2026-08-31', end: '2026-12-13' }, `${today}T16:00:00.000Z`);
    expect(rankItems([paper, dq], s, `${today}T16:00:00.000Z`, TZ).map((i) => i.id)).toEqual(['paper', 'dq']);
  });
});
