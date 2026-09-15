import { describe, expect, it } from 'vitest';
import { buildSummaryPrompt, localSummary, summaryFromTool, type SummaryInput } from './summary';

const input: SummaryInput = {
  findings: [
    { id: 'a1', classCode: 'CHM-113', classWord: 'Chem', status: 'changed', title: 'Topic 3 Quiz', quote: 'CHM-113 | Topic 3 Quiz | changed | 2026-09-27 23:59 | was 2026-09-25', proposal: 'Move Chem Quiz 3 from Sep 25 11:59 PM to Sep 27 11:59 PM', kind: 'update', confidence: 'high', date: '2026-09-27' },
    { id: 'a2', classCode: 'CHM-113', classWord: 'Chem', status: 'grade', title: 'Topic 1 Quiz', quote: 'CHM-113 | Topic 1 Quiz | grade | | 14/20', proposal: 'Record Chem Quiz 1 as graded at 14 of 20', kind: 'score', confidence: 'high', date: null },
    { id: 'a3', classCode: 'ESG-162', classWord: 'Eng', status: 'missing', title: 'Homework 2', quote: 'ESG-162 | Homework 2 | missing | | not in Halo', proposal: 'Remove Eng HW 2 from the planner (Halo no longer lists it)', kind: 'remove', confidence: 'high', date: null },
    { id: 'a4', classCode: 'ESG-162', classWord: 'Eng', status: 'note', title: 'this line means nothing', quote: 'this line means nothing', proposal: 'this line means nothing', kind: 'none', confidence: 'low', date: null },
  ],
  classes: [
    { code: 'CHM-113', word: 'Chem', outcome: 'findings', reason: 'Every one of 4 planned pages visited.', skipped: [] },
    { code: 'ESG-162', word: 'Eng', outcome: 'partial', reason: 'Visited 2 of 3 pages.', skipped: ['Syllabus — link returned 404'] },
    { code: 'UNV-106', word: 'UNV', outcome: 'not reached', reason: 'Not reached.', skipped: [] },
  ],
  planner: 'CHM-113 · Chem Quiz 3 · Topic 3 Quiz · due 2026-09-25 · 50 pts',
};

describe('the plain-language overview', () => {
  it('reads like a person: one verdict, what matters, what will happen, what needs a look, and what is not trustworthy yet', () => {
    const s = localSummary(input);
    expect(s.verdict).toBe('Mostly clean — 2 things to act on. 1 grade comes over on its own.');
    expect(s.matters).toEqual(['Move Chem Quiz 3 from Sep 25 11:59 PM to Sep 27 11:59 PM', 'Remove Eng HW 2 from the planner (Halo no longer lists it)', 'Record Chem Quiz 1 as graded at 14 of 20']);
    const headlined = localSummary({ ...input, findings: input.findings.map((f) => (f.id === 'a1' ? { ...f, headline: 'Chem Quiz 3 moved: Sep 25 → Sep 27.' } : f)) });
    expect(headlined.matters[0]).toBe('Chem Quiz 3 moved: Sep 25 → Sep 27.');
    expect(headlined.plan).toBe(s.plan);
    expect(s.plan).toBe("I'll move Chem Quiz 3 from Sep 25 11:59 PM to Sep 27 11:59 PM and record Chem Quiz 1 as graded at 14 of 20.");
    expect(s.needsYou).toEqual(['Remove Eng HW 2 from the planner (Halo no longer lists it)']);
    expect(s.partial).toEqual(["ESG-162 wasn't fully checked: visited 2 of 3 pages. Not checked: Syllabus — link returned 404. Don't trust its result yet.", "UNV-106 wasn't reached yet, so its result isn't in."]);
    const two = localSummary({ ...input, classes: [...input.classes, { code: 'ENG-105', word: 'English', outcome: 'not reached', reason: 'Not reached.', skipped: [] }] });
    expect(two.partial[1]).toBe("UNV-106 and ENG-105 weren't reached yet, so their results aren't in.");
    expect(s.decisions).toEqual({ a1: 'apply', a2: 'apply', a3: 'ask' });
    expect(s.source).toBe('local');
  });
  it('folds a whole-class import into one line and one plan step', () => {
    const eng = Array.from({ length: 28 }, (_, i) => ({ id: `e${i}`, classCode: 'ENG-105', classWord: 'English', status: 'new', title: `Item ${i}`, quote: `row ${i}`, proposal: `Add Item ${i} to the planner, due Oct ${i + 1}`, kind: 'add' as const, confidence: 'high', date: `2026-10-${String(i + 1).padStart(2, '0')}` }));
    const s = localSummary({ ...input, findings: [...input.findings, ...eng], bulk: [{ code: 'ENG-105', word: 'English', ids: eng.map((f) => f.id) }] });
    expect(s.verdict).toBe('Mostly clean — 2 things to act on. 1 grade comes over on its own.');
    expect(s.matters[0]).toBe("ENG-105 isn't in your planner yet — 28 items to add.");
    expect(s.plan.startsWith("I'll add all 28 ENG-105 items, move Chem Quiz 3")).toBe(true);
    expect(s.decisions.e3).toBe('apply');
    const only = localSummary({ ...input, findings: eng, bulk: [{ code: 'ENG-105', word: 'English', ids: eng.map((f) => f.id) }] });
    expect(only.verdict).toBe("ENG-105 isn't in your planner yet — 28 items to add. Otherwise nothing to fix.");
    const p = buildSummaryPrompt({ ...input, findings: eng, bulk: [{ code: 'ENG-105', word: 'English', ids: eng.map((f) => f.id) }] });
    expect(p.user).toContain('Whole-class imports');
  });
  it('says so plainly when only judgment calls remain, or nothing at all', () => {
    const asks = localSummary({ ...input, findings: input.findings.filter((f) => f.id === 'a3') });
    expect(asks.verdict).toBe('Mostly clean — 1 thing to act on.');
    expect(asks.plan).toBe('Nothing will change on its own.');
    expect(localSummary({ ...input, findings: [] }).verdict).toBe('Nothing to fix — your planner matches Halo.');
    const grades = localSummary({ ...input, findings: input.findings.filter((f) => f.id === 'a2') });
    expect(grades.verdict).toBe('Nothing needs fixing. 1 grade comes over on its own.');
    const many = localSummary({ ...input, findings: [...input.findings, { ...input.findings[0], id: 'a5', classCode: 'CHM-113', kind: 'update' as const }, { ...input.findings[0], id: 'a6', classCode: 'ESG-162', kind: 'flag' as const, status: 'overdue' }] });
    expect(many.verdict).toBe('A few things need attention — 4 things to act on, 2 of them in CHM-113. 1 grade comes over on its own.');
    const gate = localSummary({ ...input, findings: [{ ...input.findings[0], id: 'g', kind: 'add' as const, status: 'announce', gating: true, proposal: 'Add Claim your topic to the planner, due Sep 20' }] });
    expect(gate.verdict).toBe('Mostly clean — 1 thing to act on.');
  });
  it('takes the model’s wording but never lets a removal or an unmatched row apply on its own', () => {
    const s = summaryFromTool({ verdict: 'Pretty much fine — two small moves in Chem.', matters: ['Chem Quiz 3 slid two days to Sep 27.'], plan: "I'll move it and log the 14/20.", needs_you: ['Halo dropped Eng HW 2 — check whether it moved or was cancelled.'], partial: ['Eng: syllabus page never loaded, so its result is shaky.'], decisions: [{ id: 'a1', action: 'apply' }, { id: 'a2', action: 'ask' }, { id: 'a3', action: 'apply' }, { id: 'zz', action: 'apply' }] }, input);
    expect(s.source).toBe('claude');
    expect(s.verdict).toBe('Pretty much fine — two small moves in Chem.');
    expect(s.decisions).toEqual({ a1: 'apply', a2: 'ask', a3: 'ask' });
    expect(s.partial).toEqual(['Eng: syllabus page never loaded, so its result is shaky.']);
    const thin = summaryFromTool({ verdict: '', matters: [], plan: '', needs_you: [], partial: [], decisions: [] }, input);
    expect(thin.verdict).toBe('Mostly clean — 2 things to act on. 1 grade comes over on its own.');
    expect(thin.partial.length).toBe(2);
  });
  it('hands the model every finding with its id and proposal, the class coverage, and the planner', () => {
    const p = buildSummaryPrompt(input);
    expect(p.user).toContain('a1 · CHM-113 · changed · "Topic 3 Quiz" · 2026-09-27 · high confidence\n   Halo said: CHM-113 | Topic 3 Quiz | changed | 2026-09-27 23:59 | was 2026-09-25\n   Proposal (update): Move Chem Quiz 3');
    expect(p.user).toContain('ESG-162: partial — Visited 2 of 3 pages. Skipped: Syllabus — link returned 404');
    expect(p.user).toContain('UNV-106: not reached');
    expect(p.system).toContain('Posted grades and plain new items are housekeeping');
    expect(p.user).toContain('Planner, open items of the audited classes:\nCHM-113 · Chem Quiz 3');
    expect(p.system).toContain('Never apply removals');
  });
});
