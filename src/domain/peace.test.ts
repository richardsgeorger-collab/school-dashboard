import { describe, expect, it } from 'vitest';
import { mkCourse, mkData, mkItem, TZ } from '../halo/fixtures';
import { haloSaysIn, submissionCheck } from './confirm';
import { gradeFloor } from './floor';
import { amIOkay } from './okay';
import { pileupAhead } from './pileup';
import type { Schedule } from './schedule';
import { defaultSteps, isMilestoneWork, nextStep, stepProgress, stepsFor } from '../work/steps';

const today = '2026-09-15';
const now = '2026-09-15T12:00:00-07:00';
const at = (d: string, t = '23:59') => `${d}T${t}:00-07:00`;
const chm = mkCourse({ id: 'c1', code: 'CHM-113' });
const eng = mkCourse({ id: 'c2', code: 'ENG-105' });
const sched = (items: ReturnType<typeof mkItem>[], startBy: Record<string, string> = {}): Schedule =>
  ({ byItem: Object.fromEntries(items.map((i) => [i.id, { itemId: i.id, startBy: startBy[i.id] ?? i.dueAt.slice(0, 10), deadlineDay: i.dueAt.slice(0, 10), risk: null, fits: true, plannedByDay: {} }])), days: {} }) as unknown as Schedule;

describe('submission confirmation from Halo', () => {
  const checked = '2026-09-15T08:00:00-07:00';
  const done = (id: string, due: string, halo: { status: string; submittedAt: string | null } | null) => mkItem({ id, courseId: 'c1', title: id, label: id, status: 'done', completedAt: at(due), dueAt: at(due), halo: halo ? { ...halo, checkedAt: checked } : null });
  it('says all clear when every item due this week is in, names the ones not asked about, and shouts about a mismatch', () => {
    const clear = submissionCheck([done('a', '2026-09-10', { status: 'SUBMITTED', submittedAt: at('2026-09-10') }), done('b', '2026-09-12', { status: 'PUBLISHED', submittedAt: null })], today, TZ);
    expect(clear.line).toBe('Halo shows all 2 items due this week submitted.');
    expect(clear.level).toBe('quiet');
    const part = submissionCheck([done('a', '2026-09-10', { status: 'SUBMITTED', submittedAt: at('2026-09-10') }), done('b', '2026-09-12', null)], today, TZ);
    expect(part.line).toBe("1 thing you finished this week isn't confirmed submitted in Halo. Sync to check.");
    expect(part.level).toBe('amber');
    const bad = submissionCheck([done('a', '2026-09-10', { status: 'ACTIVE', submittedAt: null })], today, TZ);
    expect(bad.mismatches.map((i) => i.id)).toEqual(['a']);
    expect(bad.line).toBe('Halo shows a unsubmitted. You marked it done here. Check it in Halo.');
    expect(bad.level).toBe('alarm');
    expect(haloSaysIn(done('x', '2026-09-10', { status: 'LATE', submittedAt: null }))).toBe(true);
  });
  it('ignores checks made before the due date and items still open', () => {
    const early = mkItem({ id: 'a', courseId: 'c1', title: 'a', status: 'done', completedAt: at('2026-09-14'), dueAt: at('2026-09-14'), halo: { status: 'ACTIVE', submittedAt: null, checkedAt: '2026-09-13T08:00:00-07:00' } });
    expect(submissionCheck([early], today, TZ).mismatches).toEqual([]);
    const open = mkItem({ id: 'b', courseId: 'c1', title: 'b', dueAt: at('2026-09-13'), halo: { status: 'ACTIVE', submittedAt: null, checkedAt: '2026-09-15T08:00:00-07:00' } });
    expect(submissionCheck([open], today, TZ).line).toBeNull();
  });
});

describe('a pileup with lead time', () => {
  it('names the heaviest stretch, its points, its papers, and when to start the biggest thing', () => {
    const items = [
      mkItem({ id: 'ra', courseId: 'c2', title: 'Final Draft of a Rhetorical Analysis', label: 'Eng Rhetorical Analysis', type: 'paper', points: 175, estimatedMinutes: 300, dueAt: at('2026-10-07') }),
      mkItem({ id: 'op', courseId: 'c2', title: 'Op-Ed first draft', label: 'Eng Op-Ed Draft', type: 'paper', points: 100, estimatedMinutes: 200, dueAt: at('2026-10-09') }),
      mkItem({ id: 'q', courseId: 'c1', title: 'Quiz 4', label: 'Chem Quiz 4', type: 'quiz', points: 50, dueAt: at('2026-10-04') }),
      mkItem({ id: 'h', courseId: 'c1', title: 'HW 5', label: 'Chem HW 5', points: 40, dueAt: at('2026-10-06') }),
      mkItem({ id: 'd', courseId: 'c2', title: 'DQ', label: 'Eng DQ 4', type: 'discussion', points: 35, dueAt: at('2026-10-08') }),
      mkItem({ id: 'far', courseId: 'c1', title: 'Exam 2', label: 'Chem Exam 2', type: 'exam', points: 200, dueAt: at('2026-11-20') }),
    ];
    const p = pileupAhead(items, sched(items, { ra: '2026-09-29' }), today)!;
    expect(p.points).toBe(400);
    expect(p.items.length).toBe(5);
    expect(p.lead.id).toBe('ra');
    expect(p.line).toBe('Oct 4–9 is heavy: 5 items, 400 pts. Start Eng Rhetorical Analysis by Sep 29.');
    expect(pileupAhead(items.slice(2, 4), sched(items), today)).toBeNull();
  });
});

describe('the grade floor', () => {
  const graded = [
    mkItem({ id: 'g1', courseId: 'c1', title: 'Quiz 1', points: 20, score: 12, status: 'done', dueAt: at('2026-09-08') }),
    mkItem({ id: 'g2', courseId: 'c1', title: 'HW 1', points: 30, score: 27, status: 'done', dueAt: at('2026-09-10') }),
    mkItem({ id: 'x1', courseId: 'c1', title: 'Exam 1', label: 'Chem Exam 1', type: 'exam', points: 150, dueAt: at('2026-10-05') }),
    mkItem({ id: 'h2', courseId: 'c1', title: 'HW 2', points: 100, dueAt: at('2026-10-12') }),
  ];
  it('says what average keeps an A, and what a zero on the next big thing would do', () => {
    const f = gradeFloor('c1', graded);
    // total 300, earned 39 of 50; A needs 270 → 231 of the remaining 250 → 92%
    expect(f.line).toBe("Still an A if you average 92% on what's left.");
    expect(f.zeroLine).toBe('A zero on Chem Exam 1 would drop you to 39%. It matters.');
    expect(f.letter).toBe('C');
    const strong = gradeFloor('c1', graded.map((i) => (i.id === 'g1' ? { ...i, score: 20 } : i.id === 'g2' ? { ...i, score: 30 } : i)));
    expect(strong.line).toBe("On track for an A: 88% on what's left keeps it.");
    expect(gradeFloor('c1', graded.map((i) => (i.score !== null ? { ...i, score: 5 } : i))).line).toBe("An A is out of reach now; a B needs 92% on what's left.");
    expect(gradeFloor('c2', graded).line).toBeNull();
  });
});

describe('am I okay', () => {
  const base = [
    mkItem({ id: 'a', courseId: 'c1', title: 'Quiz 2', label: 'Chem Quiz 2', dueAt: at('2026-09-18') }),
    mkItem({ id: 'b', courseId: 'c2', title: 'DQ 1', label: 'Eng DQ 1', dueAt: at('2026-09-20') }),
  ];
  const data = (items: ReturnType<typeof mkItem>[], checks = 0) => ({ ...mkData([chm, eng], items), settings: { ...mkData([chm, eng], items).settings, haloChecks: checks ? [{ at: '2026-09-14T20:00:00-07:00', clean: true, findings: 0, courseId: 'c1' }] : [] } });
  it('ends in "You\'re fine." when nothing is wrong, and names the check', () => {
    const ok = amIOkay(data(base, 1), sched(base), today, now, TZ);
    expect(ok.verdict).toBe('fine');
    expect(ok.text).toBe("Nothing else is due today; 2 things land this week. Halo was checked yesterday. You're fine.");
    expect(ok.first).toBeNull();
  });
  it('puts the oldest overdue thing first, then the mismatch, and never hides a stale check', () => {
    const late = [...base, mkItem({ id: 'o', courseId: 'c1', title: 'HW 1', label: 'Chem HW 1', dueAt: at('2026-09-12') })];
    const ok = amIOkay(data(late), sched(late), today, now, TZ);
    expect(ok.verdict).toBe('handle');
    expect(ok.first?.id).toBe('o');
    expect(ok.text).toBe("Chem HW 1 is past its date. Nothing else is due today; 2 things land this week. Halo has not been checked yet, so this is only what the planner knows. Handle Chem HW 1 first; it's the oldest.");
    const three = [...late, mkItem({ id: 'o2', courseId: 'c1', title: 'HW 2', label: 'Chem HW 2', dueAt: at('2026-09-13') }), mkItem({ id: 'o3', courseId: 'c2', title: 'DQ 0', label: 'Eng DQ 0', dueAt: at('2026-09-14') })];
    expect(amIOkay(data(three), sched(three), today, now, TZ).text.startsWith('3 things are past their date: Chem HW 1, Chem HW 2, and 1 more.')).toBe(true);
    const mis = [...base, mkItem({ id: 'm', courseId: 'c1', title: 'Lab 1', label: 'Chem Lab 1', status: 'done', completedAt: at('2026-09-11'), dueAt: at('2026-09-11'), halo: { status: 'ACTIVE', submittedAt: null, checkedAt: '2026-09-14T20:00:00-07:00' } })];
    const bad = amIOkay(data(mis, 1), sched(mis), today, now, TZ);
    expect(bad.first?.id).toBe('m');
    expect(bad.text.startsWith('Halo shows Chem Lab 1 unsubmitted even though you marked it done here.')).toBe(true);
    expect(bad.text.endsWith('Check Chem Lab 1 in Halo first; if it really went in, the next sync clears this.')).toBe(true);
  });
  it('leads with a small gating task when it is due this week', () => {
    const claim = mkItem({ id: 'claim', courseId: 'c1', title: 'Claim topic', label: 'Chem Topic Claim', points: 0, dueAt: at('2026-09-20'), blocks: ['pres'] });
    const pres = mkItem({ id: 'pres', courseId: 'c1', title: 'Presentation', label: 'Chem Presentation', points: 75, dueAt: at('2026-09-27') });
    const items = [...base, claim, pres];
    const ok = amIOkay(data(items, 1), sched(items), today, now, TZ);
    expect(ok.first?.id).toBe('claim');
    expect(ok.text).toContain('Chem Topic Claim is due Sep 20 and unlocks Chem Presentation.');
    expect(ok.text.endsWith("Do Chem Topic Claim first; it's small and it holds up bigger work.")).toBe(true);
  });
});

describe('milestones inside a big item', () => {
  it('shapes steps by kind, or from the brief, and reports progress without new rows', () => {
    const paper = mkItem({ id: 'p', courseId: 'c2', title: 'Rhetorical Analysis', type: 'paper', points: 175, dueAt: at('2026-10-07') });
    expect(isMilestoneWork(paper)).toBe(true);
    expect(isMilestoneWork(mkItem({ id: 'q', courseId: 'c1', title: 'q', points: 10, estimatedMinutes: 60 }))).toBe(false);
    // Steps name the moves this kind of work takes, in order, so the first one can be started now.
    expect(defaultSteps(paper)).toEqual(['Decide what you are arguing', 'Find the evidence for it', 'Outline paragraph by paragraph', 'Write the messy first draft', 'Cut and tighten it', 'Fix the citations and the formatting']);
    const briefed = { ...paper, brief: { asks: [], rubric: [], steps: ['Pick the artifact', 'Outline the appeals', 'Draft', 'Cite in APA', 'Proofread'], at: 'x', source: 'local' as const } };
    expect(defaultSteps(briefed)[0]).toBe('Pick the artifact');
    const steps = stepsFor(paper);
    expect(steps.length).toBe(6);
    expect(stepProgress(steps)).toBe(0);
    expect(nextStep(steps)?.label).toBe('Decide what you are arguing');
    const three = steps.map((s, i) => (i < 3 ? { ...s, done: true } : s));
    expect(stepProgress(three)).toBe(0.5);
    expect(nextStep(three)?.label).toBe('Write the messy first draft');
    expect(stepsFor({ ...paper, steps: three })).toBe(three);
  });
});
