import { describe, expect, it } from 'vitest';
import { mkCourse, mkItem, TZ } from '../halo/fixtures';
import { formatRules, handoffPrompt, localHandoff, progressLine } from './handoff';

const eng = mkCourse({ id: 'eng', code: 'ENG-105', name: 'English Composition I' });
const at = (d: string) => `${d}T23:59:00-07:00`;
const today = '2026-09-17';

describe('the format rules the prompt states', () => {
  it('reads word count, style, and sources from the description, and never asserts a rule the text cancels', () => {
    const paper = mkItem({ id: 'p', courseId: 'eng', title: 'Rhetorical Analysis', type: 'paper', points: 175, dueAt: at('2026-09-20'), notes: 'Write 400-600 words. APA formatting. Cite two scholarly sources.', flags: { inClass: false, group: false, lopesWrite: true, timed: false, practice: false } });
    expect(formatRules(paper)).toEqual(['400–600 words', 'APA formatting', 'two sources cited', 'submitted through LopesWrite (it checks for AI-written and copied text)']);
    // The worksheet that says APA is not required, and that it does not go through LopesWrite.
    const sheet = mkItem({ id: 's', courseId: 'eng', title: 'Chemical Safety and Equipment', type: 'lab', points: 50, dueAt: at('2026-09-18'), notes: 'Complete and submit the worksheet as directed. APA style is not required, but solid academic writing is expected. You are not required to submit this assignment to LopesWrite.' });
    expect(formatRules(sheet)).toEqual([]);
  });
});

describe('the prompt for one assignment', () => {
  it('differs by kind of work, names what must not be written, and says where the student is', () => {
    const dq = mkItem({ id: 'd', courseId: 'eng', title: 'Topic 3 DQ 1', label: 'Eng DQ 3.1', type: 'discussion', points: 5, dueAt: at('2026-09-19'), notes: 'Describe a time a source felt persuasive but was biased.' });
    const hw = mkItem({ id: 'h', courseId: 'eng', title: 'HW 3', label: 'Eng HW 3', type: 'homework', points: 20, dueAt: at('2026-09-19'), notes: 'Problems 1 through 12.' });
    const dqText = handoffPrompt(dq, eng, { sources: [], flagged: [] }, TZ, today);
    const hwText = handoffPrompt(hw, eng, { sources: [], flagged: [] }, TZ, today);
    expect(dqText).toContain('Do not write the post or the replies');
    expect(hwText).toContain('Do not solve any problem');
    expect(dqText).not.toContain('Do not solve any problem');
    // The two prompts share the frame and nothing else.
    expect(dqText.split('\n').filter((l) => hwText.includes(l) && l.startsWith('- ')).length).toBeLessThan(3);
    expect(dqText).toContain('## Where I am\nI am on: Read the prompt twice.');
    expect(dqText).toContain('anything you write for me is worse than useless');
    const started = { ...dq, steps: [{ id: 's1', label: 'Read the prompt twice', done: true }, { id: 's2', label: 'Decide what you actually think', done: false }] };
    expect(progressLine(started, TZ)).toBe('Done so far: Read the prompt twice. I am on: Decide what you actually think.');
  });
  it('carries the stored tailored half when there is one, and stands on its own when there is not', () => {
    const item = mkItem({ id: 'x', courseId: 'eng', title: 'Effective Scheduling', type: 'other', points: 50, dueAt: at('2026-09-21'), notes: 'Build a weekly schedule table covering all 168 hours.' });
    // No pass has run: the local handoff still knows a worksheet from an essay.
    expect(localHandoff(item).build[0]).toContain('worksheet or table');
    const tailored = { ...item, handoff: { kind: 'a scheduling worksheet I fill with my own week', build: ['Build the weekly table, empty.'], withhold: ['Do not invent my schedule.'], format: [], model: 'm', at: '' } };
    const text = handoffPrompt(tailored, eng, { sources: [], flagged: [] }, TZ, today);
    expect(text).toContain('It is a scheduling worksheet I fill with my own week.');
    expect(text).toContain('2. Build the weekly table, empty.');
    expect(text).toContain('- Do not invent my schedule.');
  });
});
