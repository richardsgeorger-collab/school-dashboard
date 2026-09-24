import { describe, expect, it } from 'vitest';
import { mkItem } from '../halo/fixtures';
import { formatRules } from './handoff';

const at = (d: string) => `${d}T23:59:00-07:00`;

describe('the format rules the prompt states', () => {
  it('reads word count, style, and sources from the description, and never asserts a rule the text cancels', () => {
    const paper = mkItem({ id: 'p', courseId: 'eng', title: 'Rhetorical Analysis', type: 'paper', points: 175, dueAt: at('2026-09-20'), notes: 'Write 400-600 words. APA formatting. Cite two scholarly sources.', flags: { inClass: false, group: false, lopesWrite: true, timed: false, practice: false } });
    expect(formatRules(paper)).toEqual(['400–600 words', 'APA formatting', 'two sources cited', 'submitted through LopesWrite']);
    // The worksheet that says APA is not required, and that it does not go through LopesWrite.
    const sheet = mkItem({ id: 's', courseId: 'eng', title: 'Chemical Safety and Equipment', type: 'lab', points: 50, dueAt: at('2026-09-18'), notes: 'Complete and submit the worksheet as directed. APA style is not required, but solid academic writing is expected. You are not required to submit this assignment to LopesWrite.' });
    expect(formatRules(sheet)).toEqual([]);
  });
});
