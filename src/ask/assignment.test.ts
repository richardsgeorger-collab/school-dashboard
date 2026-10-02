import { describe, expect, it } from 'vitest';
import type { Course, Item } from '../domain/types';
import { assignmentBlocks, assignmentFacts, ASSIGNMENT_QUESTION_RULES, QUESTION_CHIPS } from './assignment';

const course = { id: 'c1', code: 'ENG-105', name: 'English Composition', haloSlugId: 'eng-x' } as Course;
const item = {
  id: 'i1', courseId: 'c1', title: 'Rhetorical Analysis Draft', label: 'Rhetorical analysis', type: 'paper', points: 100, dueAt: '2026-10-05T06:59:00.000Z', status: 'todo', score: null,
  notes: 'Analyze the rhetorical strategies in your chosen article. Use APA 7.',
  rubric: { id: 'r', name: 'Draft rubric', at: '', criteria: [{ id: 'k1', name: 'Thesis', description: 'Clear, arguable claim', points: 25, levels: [{ cellId: 'a', name: 'Full', description: 'Specific and arguable', points: 25 }] }] },
  feedback: { comment: 'Good start, tighten the thesis.', gradedAt: '2026-09-30T00:00:00Z', criteria: [{ criteriaId: 'k1', cellId: 'a', comment: 'Narrow it.' }], files: [], at: '' },
  requirements: [{ id: 'q', text: 'Reply to 2 classmates by Sunday', dueAt: null, done: false, doneAt: null, gradedOn: true, source: { kind: 'announcement', id: 'p', title: 'Week 3 notes', quote: 'reply to two classmates by Sunday', at: '' }, addedAt: '' }],
} as unknown as Item;

describe('the facts an assignment question is answered from', () => {
  const t = assignmentFacts(item, course, 'America/Phoenix');
  it('carries the title, class, due date, points, instructions, rubric, feedback and announcement to-dos', () => {
    expect(t).toContain('Title: Rhetorical Analysis Draft');
    expect(t).toContain('Class: ENG-105 English Composition');
    expect(t).toMatch(/Due: Sun, Oct 4 at 11:59 PM/);
    expect(t).toContain('Points: 100');
    expect(t).toContain('Use APA 7.');
    expect(t).toContain('Thesis (25 pts): Clear, arguable claim');
    expect(t).toContain('Good start, tighten the thesis.');
    expect(t).toContain('[Thesis: Narrow it.]');
    expect(t).toContain('Reply to 2 classmates by Sunday');
    expect(t).toContain('[announcement: Week 3 notes]');
  });
  it('says plainly what is missing instead of leaving a gap to fill', () => {
    const bare = assignmentFacts({ ...item, notes: '', rubric: null, feedback: null, requirements: [], points: 0, dueAt: '' } as unknown as Item, course, 'America/Phoenix');
    expect(bare).toContain('Due: not listed');
    expect(bare).toContain('Points: not listed');
    expect(bare).toContain('Instructions from Halo: none came with this assignment');
    expect(bare).toContain('Rubric: none on file');
    expect(bare).toContain('To-dos from announcements: none linked');
  });
  it('the rules forbid guessing and point to Open in Halo; the block holds both', () => {
    expect(ASSIGNMENT_QUESTION_RULES).toMatch(/ONLY from the assignment facts/);
    expect(ASSIGNMENT_QUESTION_RULES).toMatch(/Never guess/);
    expect(ASSIGNMENT_QUESTION_RULES).toMatch(/word count/);
    expect(ASSIGNMENT_QUESTION_RULES).toMatch(/Open in Halo/);
    const [b] = assignmentBlocks(item, course, 'America/Phoenix');
    expect(b.text).toContain(ASSIGNMENT_QUESTION_RULES);
    expect(b.text).toContain('Rhetorical Analysis Draft');
  });
  it('the three chips are the ones asked for', () => {
    expect([...QUESTION_CHIPS]).toEqual(['When is it due?', 'How long does it need to be?', 'What does the rubric want?']);
  });
});
