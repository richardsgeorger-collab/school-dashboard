import { describe, expect, it } from 'vitest';
import { mkCourse } from '../halo/fixtures';
import type { QuizSource } from '../quiz/sources';
import { buildKit, buildKitPrompt, kitFromTool, kitHash } from './kits';

const chm = mkCourse({ id: 'chm', code: 'CHM-113', name: 'General Chemistry I' });
const sources: QuizSource[] = [
  { id: 'S1', kind: 'slide', label: 'Stoichiometry, slide 4', href: '#/library?v=slides&deck=d1', text: 'n = m / M. Mole ratios come from the balanced equation.' },
  { id: 'S2', kind: 'syllabus', label: 'CHM-113 syllabus', href: '#/library?c=chm', text: 'Exam 1 covers stoichiometry.' },
];

describe('study kits from the student’s own material', () => {
  it('asks for one kind at a time, weak topics first, and keeps only entries with a real source', () => {
    const prompt = buildKitPrompt(chm, 'cards', 'stoichiometry', sources, ['limiting reagent'], ['Limiting reagent will be on Exam 1']);
    expect(prompt.user).toContain('Build: flashcards (fill cards only)');
    expect(prompt.user).toContain('Weak topics, first and heaviest: limiting reagent');
    expect(prompt.user).toContain('Called exam material by the professor: Limiting reagent will be on Exam 1');
    expect(prompt.system[1].text).toContain('[S1] slide · Stoichiometry, slide 4');
    expect(prompt.system.every((b) => b.cache)).toBe(true);
    const kit = kitFromTool(
      { formulas: [{ name: 'Moles from mass', formula: 'n = m / M', when: 'Given grams, need moles.', sourceId: 'S1' }, { name: '', formula: 'x', when: '', sourceId: 'S1' }], cards: [{ front: 'Where do mole ratios come from?', back: 'The balanced equation.', sourceId: 'S1' }, { front: 'Made up', back: 'Not in the sources', sourceId: 'S7' }], sections: [{ heading: 'What Exam 1 covers', lines: ['Stoichiometry.', ''], sourceId: 'S2' }, { heading: 'Empty', lines: [], sourceId: 'S2' }] },
      { course: chm, kind: 'formulas', topic: 'stoichiometry', sources, weak: ['limiting reagent'], model: 'm', at: '2026-09-15T00:00:00.000Z' },
    );
    expect(kit.formulas).toEqual([{ name: 'Moles from mass', formula: 'n = m / M', when: 'Given grams, need moles.', sourceId: 'S1' }]);
    // A card citing a source that does not exist keeps the card but loses the citation.
    expect(kit.cards.map((c) => [c.front, c.sourceId])).toEqual([
      ['Where do mole ratios come from?', 'S1'],
      ['Made up', ''],
    ]);
    expect(kit.sections).toEqual([{ heading: 'What Exam 1 covers', lines: ['Stoichiometry.'], sourceId: 'S2' }]);
    expect(kit.sourcesHash).toBe(kitHash('formulas', 'stoichiometry', sources, ['limiting reagent']));
    expect(kitHash('formulas', 'Stoichiometry', sources, ['limiting reagent'])).toBe(kit.sourcesHash);
    expect(kitHash('cards', 'stoichiometry', sources, ['limiting reagent'])).not.toBe(kit.sourcesHash);
  });
  it('builds through one forced tool call and stamps the model', async () => {
    const fetch = (async () => new Response(JSON.stringify({ id: 'm', type: 'message', role: 'assistant', model: 'claude-haiku-4-5-20251001', content: [{ type: 'tool_use', id: 't', name: 'study_kit', input: { formulas: [], cards: [], sections: [{ heading: 'Stoichiometry', lines: ['Mole ratios come from the balanced equation.'], sourceId: 'S1' }] } }], stop_reason: 'tool_use', usage: { input_tokens: 5, output_tokens: 5 } }), { status: 200, headers: { 'content-type': 'application/json' } })) as unknown as typeof globalThis.fetch;
    const kit = await buildKit({ apiKey: 'k', fetch, course: chm, kind: 'onepager', topic: '', sources, weak: [], flagged: [] });
    expect(kit.sections.length).toBe(1);
    expect(kit.model).toBe('claude-haiku-4-5-20251001');
    expect(kit.kind).toBe('onepager');
  });
});
