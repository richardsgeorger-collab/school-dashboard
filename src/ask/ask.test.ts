import { describe, expect, it } from 'vitest';
import type { Course, Item } from '../domain/types';
import { appSteps, askBlocks, askLoadingLine, askSuggestions, gradesLine, parseNextSteps } from './ask';

const tz = 'America/Phoenix';
const today = '2026-09-28';
const chm = { id: 'chm', code: 'CHM-113', name: 'General Chemistry I', meetings: [], online: false, haloGrade: { letter: 'A', percent: 96, points: 96, maxPoints: 100, at: 'x' }, instructors: [] } as unknown as Course;
const eng = { id: 'eng', code: 'ENG-105', name: 'English Composition I', meetings: [], online: true, instructors: [] } as unknown as Course;
const quiz = { id: 'q2', courseId: 'chm', title: 'Chem Quiz 2', label: 'Chem Quiz 2', type: 'quiz', topic: 'limiting reagent', dueAt: '2026-10-02T15:00:00.000Z', points: 50, status: 'todo', estimatedMinutes: 120, flags: {}, source: 'halo', updatedAt: 'x' } as unknown as Item;
const essay = { id: 'e1', courseId: 'eng', title: 'Rhetorical Analysis', label: 'English Rhetorical', type: 'paper', topic: null, dueAt: '2026-10-09T06:59:00.000Z', points: 210, status: 'todo', estimatedMinutes: 300, flags: {}, source: 'halo', updatedAt: 'x' } as unknown as Item;

describe('the follow-up line', () => {
  it('comes off the answer and becomes up to three short buttons', () => {
    const r = parseNextSteps('Start the lab write-up tonight.\n\n>> Plan my week | Quiz me on this | What earns points?');
    expect(r.text).toBe('Start the lab write-up tonight.');
    expect(r.next).toEqual(['Plan my week', 'Quiz me on this', 'What earns points?']);
  });
  it('shows plain text when the model slips in markdown emphasis', () => {
    const r = parseNextSteps('Start with **Eng Math Lab CLC Math 2** tonight, *then* the reply.\n>> Plan my week | **Quiz me**');
    expect(r.text).toBe('Start with Eng Math Lab CLC Math 2 tonight, then the reply.');
    expect(r.next).toEqual(['Plan my week', 'Quiz me']);
  });
  it('takes "Next:" too, drops empties and over-long ones, and copes with no line at all', () => {
    expect(parseNextSteps('Answer.\nNext: one | | ' + 'x'.repeat(80) + ' | two | three | four').next).toEqual(['one', 'two', 'three']);
    expect(parseNextSteps('Just an answer.')).toEqual({ text: 'Just an answer.', next: [] });
  });
});

describe('what the app adds under an answer', () => {
  it('a test in focus gets Practice; an assignment gets Check; both get Open', () => {
    expect(appSteps({ course: chm, item: quiz }, 'x', [quiz, essay], today, tz)).toEqual([
      { label: 'Practice for Chem Quiz 2', href: '#/practice?i=q2' },
      { label: 'Open Chem Quiz 2', href: '#/class?c=chm&i=q2' },
    ]);
    expect(appSteps({ course: eng, item: essay }, 'x', [quiz, essay], today, tz)[0]).toEqual({ label: 'Check my work', href: '#/check?i=e1' });
  });
  it('an unscoped answer that names a coming test gets Practice for it', () => {
    expect(appSteps({ course: null, item: null }, 'Start with Chem Quiz 2: it is Friday.', [quiz, essay], today, tz)).toEqual([{ label: 'Practice for Chem Quiz 2', href: '#/practice?i=q2' }]);
    expect(appSteps({ course: null, item: null }, 'Do the reply first.', [quiz, essay], today, tz)).toEqual([]);
  });
});

describe('the empty conversation and the waiting line', () => {
  it('offers the student’s own next test', () => {
    expect(askSuggestions({ course: null, item: null }, [quiz, essay], today, tz)[1]).toBe('I have Chem Quiz 2 in 4 days, help me study');
    expect(askSuggestions({ course: chm, item: quiz }, [quiz], today, tz)[2]).toBe("Explain limiting reagent like I'm behind");
    expect(askSuggestions({ course: eng, item: essay }, [essay], today, tz)[0]).toContain('Rhetorical Analysis');
  });
  it('says which class it is reading', () => {
    expect(askLoadingLine({ course: chm, item: null }, 'x', [chm, eng])).toBe('Reading your CHM-113 slides, lectures and announcements…');
    expect(askLoadingLine({ course: null, item: null }, 'is my eng-105 essay ok', [chm, eng])).toContain('ENG-105');
    expect(askLoadingLine({ course: null, item: null }, 'what should I do tonight', [chm, eng])).toBe('Reading your week…');
  });
});

describe('what the model is given', () => {
  it('carries the grades Halo reported and caches the rules, the syllabi and the class sources', () => {
    expect(gradesLine([chm, eng], [])).toBe('CHM-113: A (96.0%)');
    const blocks = askBlocks({
      context: { items: [quiz], courses: [chm, eng], settings: { timezone: tz, weekdayMinutes: 120, weekendMinutes: 240 } as never, schedule: { byItem: {}, loadByDay: {}, capacityByDay: {} } as never, derived: {}, nudges: [], today, notes: [] },
      courses: [chm, eng],
      syllabi: 'CHM-113: late work loses 10% a day.',
      materials: '',
      sources: [{ id: 'S1', kind: 'slide', label: 'Topic 4, slide 4', href: '#', text: 'Limiting reagent…' }],
      situation: { course: chm, topic: 'limiting reagent', today, upcoming: [], examFlags: [], weak: [], links: [], item: null },
    });
    expect(blocks[0].cache).toBe(true);
    expect(blocks[1]).toEqual({ text: 'Syllabi:\nCHM-113: late work loses 10% a day.', cache: true });
    expect(blocks[2].text).toContain('[S1] slide · Topic 4, slide 4');
    expect(blocks[2].cache).toBe(true);
    expect(blocks.at(-1)!.text).toContain('Grades (Halo\'s own, as of the last sync): CHM-113: A (96.0%)');
    expect(blocks.at(-1)!.text).toContain('Class in focus:\nClass: CHM-113');
    expect(blocks.at(-1)!.cache).toBeUndefined();
  });
});
