import { describe, expect, it } from 'vitest';
import { mkCourse, mkItem, TZ } from '../halo/fixtures';
import { MODEL } from '../ai/model';
import { buildNotesPrompt, notesFromTool, NOTES_TOOL } from './summarize';

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
    expect(MODEL).toMatch(/^claude-haiku-4-5/);
    expect('strict' in NOTES_TOOL).toBe(false);
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

describe('what the lecture said that a file cannot', () => {
  it('reads what was stressed, what was called exam material, which slides got the time, and the terms, and shapes bad fields', () => {
    const notes = notesFromTool(
      { summary: ['x'], concepts: [], mentions: [], emphasized: [{ point: 'Logos carries an op-ed', quote: 'logos carries it', at: '12:30' }, { point: '', quote: 'nothing', at: '' }], exam_flags: [{ point: 'Know the three appeals', quote: 'this is on the test', at: 'noon' }], dwelt: [{ slide: 3, title: 'Op-ed structure', why: 'ten minutes' }, { slide: 0, title: '', why: '' }], skipped: [{ slide: null, title: 'Ethos', why: 'ran out of time' }], terms: [{ term: 'kairos', meaning: 'the right moment for an argument' }, { term: '', meaning: 'x' }] },
      'm',
      '2026-09-15T00:00:00.000Z',
      'd1',
    );
    expect(notes.knowledge).toEqual({
      emphasized: [{ point: 'Logos carries an op-ed', quote: 'logos carries it', at: '12:30' }],
      examFlags: [{ point: 'Know the three appeals', quote: 'this is on the test', at: '' }],
      dwelt: [{ slide: 3, title: 'Op-ed structure', why: 'ten minutes' }],
      skipped: [{ slide: null, title: 'Ethos', why: 'ran out of time' }],
      terms: [{ term: 'kairos', meaning: 'the right moment for an argument' }],
      deckId: 'd1',
    });
    // An older answer without the fields carries no knowledge block.
    expect(notesFromTool({ summary: [], concepts: [], mentions: [] }, 'm').knowledge).toBeUndefined();
  });
});
