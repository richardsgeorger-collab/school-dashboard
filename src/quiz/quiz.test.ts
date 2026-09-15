import { describe, expect, it } from 'vitest';
import { mkCourse, TZ } from '../halo/fixtures';
import type { Deck, DeckPage } from '../library/db';
import type { Recording, Segment } from '../record/db';
import { checkAnswer } from './check';
import { buildQuizPrompt, setFromTool, wantsWorkedProblems, type QuizQuestion } from './generate';
import { gatherSources, sourcesBlock } from './sources';
import { practiceLine, recordAnswer, weakTopics } from './stats';

const chm = mkCourse({ id: 'c1', code: 'CHM-113', name: 'General Chemistry I' });
const eng = mkCourse({ id: 'c2', code: 'ENG-105', name: 'English Composition' });
const deck = (o: Partial<Deck>): Deck => ({ id: 'd1', courseId: 'c1', title: 'Stoichiometry', tag: 'Topic 3', date: '2026-09-10', fileName: 'x.pdf', kind: 'pdf', mimeType: 'application/pdf', bytes: 1, pages: 2, chars: 100, addedAt: '2026-09-10T20:00:00Z', recordingId: null, fileDeleted: false, ...o });
const rec = (o: Partial<Recording>): Recording => ({ id: 'r1', courseId: 'c1', title: 'Chem lecture', startedAt: '2026-09-10T14:00:00Z', endedAt: null, status: 'done', durationMs: 0, bytes: 0, mimeType: 'audio/webm', chunkCount: 0, segmentCount: 0, audioDeleted: false, notes: null, processedAt: null, review: {}, ...o });
const seg = (recordingId: string, seq: number, at: number, text: string): Segment => ({ recordingId, seq, at, text });
const filler = (s: string) => `${s} `.repeat(6).trim();

const pool = {
  decks: [deck({}), deck({ id: 'd2', title: 'Gas laws', tag: 'Topic 5', date: '2026-09-12' }), deck({ id: 'd3', courseId: 'c2', title: 'Essay structure' })],
  pages: [
    { deckId: 'd1', n: 1, text: filler('A mole is 6.022e23 particles; molar mass converts grams to moles.') },
    { deckId: 'd1', n: 2, text: filler('The limiting reagent is the reactant that runs out first and caps the yield.') },
    { deckId: 'd2', n: 1, text: filler('PV = nRT relates pressure, volume, moles and temperature.') },
    { deckId: 'd3', n: 1, text: filler('A thesis statement goes at the end of the introduction.') },
    { deckId: 'd2', n: 2, text: 'short' },
  ] as DeckPage[],
  recordings: [rec({}), rec({ id: 'r2', courseId: 'c2', title: 'Eng lecture' })],
  segmentsOf: {
    r1: [seg('r1', 0, 0, filler('Welcome back, today we finish stoichiometry.')), seg('r1', 1, 65_000, filler('The limiting reagent decides how much product forms, so find moles of each first.')), seg('r1', 2, 130_000, filler('Then next week we start gas laws.'))],
    r2: [seg('r2', 0, 0, filler('Essays need a thesis.'))],
  },
  syllabus: { courseId: 'c1', name: 'chm.pdf', text: `Course description.\n\nExam 1 covers stoichiometry and limiting reagents, 150 points.\n\nLate work loses ten percent a day.`, chars: 100, addedAt: '2026-09-01T00:00:00Z' },
};

describe('gathering the student’s own material', () => {
  it('picks slides, transcript windows, and syllabus lines about the topic, from this class only, each labeled', () => {
    const s = gatherSources(chm, 'limiting reagent', pool, TZ);
    expect(s.map((x) => [x.id, x.kind, x.label])).toEqual([
      ['S1', 'slide', 'Stoichiometry, slide 2'],
      ['S2', 'recording', 'Chem lecture (Sep 10), 1:05'],
      ['S3', 'syllabus', 'CHM-113 syllabus'],
    ]);
    expect(s[2].text).toContain('Exam 1 covers stoichiometry');
    expect(s[2].text).not.toContain('Late work');
    expect(s[1].href).toBe('#/library?c=c1');
    expect(sourcesBlock(s).startsWith('[S1] slide · Stoichiometry, slide 2\n')).toBe(true);
  });
  it('with no topic takes the newest slides first, the latest recording’s opening, and the whole syllabus', () => {
    const s = gatherSources(chm, '', pool, TZ);
    expect(s.map((x) => x.label)).toEqual(['Gas laws, slide 1', 'Stoichiometry, slide 1', 'Stoichiometry, slide 2', 'Chem lecture (Sep 10), 0:00', 'CHM-113 syllabus']);
    expect(gatherSources(eng, '', { ...pool, syllabus: null }, TZ).map((x) => x.label)).toEqual(['Essay structure, slide 1', 'Eng lecture (Sep 10), 0:00']);
  });
});

describe('the practice-set prompt and its answer', () => {
  const sources = gatherSources(chm, 'limiting reagent', pool, TZ);
  it('asks for worked problems in chem and math only, and feeds weak topics back in', () => {
    expect(wantsWorkedProblems(chm)).toBe(true);
    expect(wantsWorkedProblems(eng)).toBe(false);
    const p = buildQuizPrompt({ course: chm, topic: 'limiting reagent', sources, weakTopics: ['molar mass'], avoid: ['What is a mole?'] });
    expect(p.user).toContain('at least three of the five worked problems');
    expect(p.user).toContain('missed before, in at least two questions: molar mass');
    expect(p.user).toContain('- What is a mole?');
    expect(p.user).toContain('[S1] slide · Stoichiometry, slide 2');
    expect(buildQuizPrompt({ course: eng, topic: '', sources, weakTopics: [], avoid: [] }).user).toContain('No worked problems');
  });
  it('keeps well-formed questions that cite a real source and drops the rest', () => {
    const set = setFromTool(
      {
        questions: [
          { kind: 'multiple_choice', topic: 'Limiting Reagent', prompt: 'Which reactant limits?', choices: ['A', 'B', 'C', 'D'], answer: '1', explanation: 'B runs out first.', steps: [], sourceId: 'S1' },
          { kind: 'worked', topic: 'moles', prompt: 'How many moles in 36 g of water?', choices: [], answer: '2.0 mol', explanation: 'Molar mass 18.', steps: ['n = m / M', 'n = 36 / 18 = 2.0 mol'], sourceId: '[S2]' },
          { kind: 'multiple_choice', topic: 'x', prompt: 'Bad choices', choices: ['A', 'B'], answer: '0', explanation: '', steps: [], sourceId: 'S1' },
          { kind: 'short', topic: 'x', prompt: 'Cites nothing real', choices: [], answer: 'y', explanation: '', steps: [], sourceId: 'S9' },
          { kind: 'short', topic: '', prompt: 'No answer', choices: [], answer: '', explanation: '', steps: [], sourceId: 'S1' },
          { kind: 'short', topic: '', prompt: 'Topic falls back', choices: [], answer: 'yes', explanation: '', steps: ['ignored'], sourceId: 'S3' },
        ],
      },
      { course: chm, topic: 'Limiting reagent', sources },
      'test',
      '2026-09-14T00:00:00Z',
    );
    expect(set.questions.map((q) => [q.id, q.kind, q.topic, q.sourceId, q.steps.length])).toEqual([
      ['q1', 'multiple_choice', 'limiting reagent', 'S1', 0],
      ['q2', 'worked', 'moles', 'S2', 2],
      ['q3', 'short', 'limiting reagent', 'S3', 0],
    ]);
    expect(set.courseId).toBe('c1');
  });
});

describe('checking an answer', () => {
  const q = (o: Partial<QuizQuestion>): QuizQuestion => ({ id: 'q', kind: 'short', topic: 't', prompt: 'p', choices: [], answer: '', explanation: '', steps: [], sourceId: 'S1', ...o });
  it('numbers within 2% are right, within 10% unsure, otherwise wrong; units and notation do not matter', () => {
    const w = q({ kind: 'worked', answer: '2.0 mol' });
    expect(checkAnswer(w, '2')).toBe('right');
    expect(checkAnswer(w, '2.03 mol')).toBe('right');
    expect(checkAnswer(w, '2.1')).toBe('unsure');
    expect(checkAnswer(w, '3')).toBe('wrong');
    expect(checkAnswer(w, 'no idea')).toBe('wrong');
    expect(checkAnswer(w, '')).toBe('wrong');
    expect(checkAnswer(q({ answer: '6.022e23 particles' }), '6.02 x 10^23')).toBe('right');
    expect(checkAnswer(q({ answer: '0 J' }), '0')).toBe('right');
  });
  it('multiple choice compares the index; words compare by overlap and hand close calls to the student', () => {
    const mc = q({ kind: 'multiple_choice', choices: ['a', 'b', 'c', 'd'], answer: '2' });
    expect(checkAnswer(mc, '2')).toBe('right');
    expect(checkAnswer(mc, '0')).toBe('wrong');
    const s = q({ answer: 'the reactant that runs out first' });
    expect(checkAnswer(s, 'The reactant which runs out first')).toBe('right');
    expect(checkAnswer(s, 'the one that runs out')).toBe('unsure');
    expect(checkAnswer(s, 'pressure times volume')).toBe('wrong');
  });
});

describe('what keeps getting missed', () => {
  it('counts attempts and misses per class and topic, and names the weak ones', () => {
    let s = recordAnswer(undefined, 'c1', 'Limiting reagent', true, '2026-09-10T00:00:00Z');
    s = recordAnswer(s, 'c1', 'limiting reagent', true, '2026-09-11T00:00:00Z');
    s = recordAnswer(s, 'c1', 'limiting reagent', false, '2026-09-12T00:00:00Z');
    s = recordAnswer(s, 'c1', 'moles', true, '2026-09-12T00:00:00Z');
    s = recordAnswer(s, 'c1', 'gas laws', false, '2026-09-12T00:00:00Z');
    s = recordAnswer(s, 'c2', 'thesis', true, '2026-09-12T00:00:00Z');
    s = recordAnswer(s, 'c2', 'thesis', true, '2026-09-13T00:00:00Z');
    expect(s['c1:limiting reagent']).toEqual({ courseId: 'c1', topic: 'limiting reagent', attempts: 3, misses: 2, lastAt: '2026-09-12T00:00:00Z' });
    expect(weakTopics(s, 'c1')).toEqual([{ topic: 'limiting reagent', attempts: 3, misses: 2 }]);
    expect(weakTopics(s, 'c2')).toEqual([{ topic: 'thesis', attempts: 2, misses: 2 }]);
    expect(practiceLine(s, 'c1')).toBe('40% right over 5 questions · keeps slipping on limiting reagent');
    expect(practiceLine(s, 'c3')).toBeNull();
    expect(practiceLine(recordAnswer(undefined, 'c3', 'x', false, 'now'), 'c3')).toBe('100% right over 1 question');
  });
});
