import { describe, expect, it } from 'vitest';
import { mkCourse, mkItem, TZ } from '../halo/fixtures';
import { buildNotesPrompt, notesFromTool, NOTES_MODEL, NOTES_TOOL } from './summarize';

describe('lecture notes prompt and parsing', () => {
  it('gives the model the date, the meeting times, and the open items with ids', () => {
    const course = mkCourse({ id: 'c1', code: 'CHM-113', name: 'General Chemistry I', meetings: [{ day: 3, start: '07:00', end: '08:15' }] });
    const items = [mkItem({ id: 'q2', courseId: 'c1', title: 'Topic 2 Quiz', label: 'Chem Quiz 2', dueAt: '2026-09-16T23:59:00-07:00' }), mkItem({ id: 'old', courseId: 'c1', title: 'Old', dueAt: '2026-09-01T23:59:00-07:00' }), mkItem({ id: 'x', courseId: 'c2', title: 'Other class' })];
    const p = buildNotesPrompt({ course, lectureDate: '2026-09-14', items, transcript: 'hello', tz: TZ });
    expect(p.user).toContain('Lecture date: 2026-09-14 (Monday)');
    expect(p.user).toContain('Class meets: Wed 07:00');
    expect(p.user).toContain('q2 · Chem Quiz 2 · Topic 2 Quiz · due');
    expect(p.user).not.toContain('Old');
    expect(p.user).not.toContain('Other class');
    expect(p.system).toMatch(/lecture_notes/);
    expect(NOTES_MODEL).toBe('claude-sonnet-4-6');
    expect(NOTES_TOOL.strict).toBe(true);
  });
  it('shapes model output defensively', () => {
    const notes = notesFromTool(
      {
        summary: ['a', 'b', 'c', 'd', 'e', 'f', 7],
        concepts: ['mole', ''],
        mentions: [
          { quote: 'quiz moves to Friday', kind: 'date_change', title: 'Quiz 2', date: '2026-09-18', time: '7:00', points: 20, confidence: 'high', itemId: 'q2' },
          { quote: 'bad date', kind: 'weird', title: 'X', date: 'Friday', time: '25:00', points: -3, confidence: 'sure', itemId: '' },
          { quote: '', kind: 'new', title: 'no quote' },
          'garbage',
        ],
      },
      'test-model',
      '2026-09-14T15:00:00Z',
    );
    expect(notes.summary).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(notes.concepts).toEqual(['mole']);
    expect(notes.mentions.length).toBe(2);
    expect(notes.mentions[0]).toMatchObject({ id: 'm1', kind: 'date_change', date: '2026-09-18', time: null, points: 20, itemId: 'q2' });
    expect(notes.mentions[1]).toMatchObject({ id: 'm2', kind: 'info', date: null, time: null, points: null, confidence: 'low', itemId: null });
    expect(notes.model).toBe('test-model');
    expect(notesFromTool(null, 'm').mentions).toEqual([]);
  });
});
