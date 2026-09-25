import { describe, expect, it } from 'vitest';
import { mkCourse, mkItem, TZ } from '../halo/fixtures';
import type { QuizSource } from '../quiz/sources';
import type { Recording } from '../record/db';
import { askTutor, BEHIND, buildTutorBlocks, citedSources, situationText, tutorSituation } from './tutor';

const chm = mkCourse({ id: 'chm', code: 'CHM-113', name: 'General Chemistry I' });
const esg = mkCourse({ id: 'esg', code: 'ESG-162', name: 'Engineering Math' });
const at = (d: string) => `${d}T23:59:00-07:00`;
const items = [
  mkItem({ id: 'q3', courseId: 'chm', title: 'Topic 3 Quiz', label: 'Chem Quiz 3', type: 'quiz', points: 20, dueAt: at('2026-09-19'), topic: 'stoichiometry' }),
  mkItem({ id: 'hw', courseId: 'chm', title: 'HW 3', label: 'Chem HW 3', points: 10, dueAt: at('2026-09-18') }),
  mkItem({ id: 'ex', courseId: 'chm', title: 'Exam 1', label: 'Chem Exam 1', type: 'exam', points: 150, dueAt: at('2026-10-02'), plan: { asks: '', startBy: null, minutes: null, milestones: [], prerequisites: [], flags: { lopesWrite: false, timed: true, group: false, inPerson: true }, topics: ['stoichiometry', 'limiting reagent'], feeds: null, sources: [], citations: [], model: 'm', at: '', inputHash: 'h' } }),
  mkItem({ id: 'old', courseId: 'chm', title: 'Quiz 1', label: 'Chem Quiz 1', type: 'quiz', points: 20, dueAt: at('2026-09-05'), status: 'done' }),
];
const recordings: Recording[] = [{ id: 'r1', courseId: 'chm', title: 'CHM-113 lecture', startedAt: '2026-09-10T14:00:00.000Z', endedAt: null, status: 'done', durationMs: 1, bytes: 0, mimeType: '', chunkCount: 0, segmentCount: 1, audioDeleted: true, processedAt: null, review: {}, notes: { summary: [], concepts: [], mentions: [], model: 'x', createdAt: '', knowledge: { emphasized: [], examFlags: [{ point: 'Limiting reagent will be on Exam 1', quote: 'this will be on the exam', at: '31:05' }], dwelt: [], skipped: [], terms: [], deckId: null } } }];
const sources: QuizSource[] = [
  { id: 'S1', kind: 'slide', label: 'Stoichiometry, slide 4', href: '#/library?v=slides&deck=d1', text: 'Mole ratios come from the balanced equation.' },
  { id: 'S2', kind: 'recording', label: 'CHM-113 lecture (Sep 10), 31:05', href: '#/library?c=chm', text: 'this will be on the exam' },
];

describe('what the tutor knows beyond the sources', () => {
  it('names what is coming, what the professor flagged, the weak spots, and the cross-class link for the topic', () => {
    const s = tutorSituation(chm, items, recordings, ['limiting reagent'], [{ a: { courseId: 'chm', topic: 'stoichiometry' }, b: { courseId: 'esg', topic: 'dimensional analysis' }, note: 'Mole ratios are unit conversions.' }], [chm, esg], '2026-09-15', TZ, 'stoichiometry', items[2]);
    expect(s.upcoming.map((u) => [u.label, u.due, u.topics])).toEqual([
      ['Chem Quiz 3', '2026-09-19', ['stoichiometry']],
      ['Chem Exam 1', '2026-10-02', ['stoichiometry', 'limiting reagent']],
    ]);
    expect(s.examFlags).toEqual([{ point: 'Limiting reagent will be on Exam 1', quote: 'this will be on the exam', at: '31:05', lecture: 'CHM-113 lecture, Sep 10' }]);
    expect(s.links).toEqual([{ other: 'ESG-162', topic: 'dimensional analysis', note: 'Mole ratios are unit conversions.' }]);
    const text = situationText(s);
    expect(text).toContain('Coming up: Chem Quiz 3 (quiz, 20 pts, due 2026-09-19, 4 days, on stoichiometry)');
    expect(text).toContain('The professor called exam material: "Limiting reagent will be on Exam 1" (CHM-113 lecture, Sep 10 at 31:05)');
    expect(text).toContain('Where the student has been weak: limiting reagent');
    expect(text).toContain('Cross-class links: ESG-162 dimensional analysis — Mole ratios are unit conversions.');
    expect(text).toContain('The assignment they are working toward: "Exam 1"');
    const blocks = buildTutorBlocks(sources, s);
    expect(blocks.map((b) => !!b.cache)).toEqual([true, true, undefined].map(Boolean));
    expect(blocks[1].text).toContain('[S1] slide · Stoichiometry, slide 4');
    expect(blocks[0].text).toContain('never give the answer');
    expect(blocks[0].text).toContain('Never write anything the student would submit');
    expect(buildTutorBlocks([], s)[1].text).toContain('No class material is on file');
    expect(BEHIND('stoichiometry')).toBe("Explain stoichiometry like I'm behind.");
  });
  it('lists the sources an answer cited, once each, in order', () => {
    expect(citedSources('Mole ratios come from the balanced equation [S1]. The professor said so [S2], and again [S1]. Nothing here [S9].', sources).map((s) => s.id)).toEqual(['S1', 'S2']);
    expect(citedSources('No citations.', sources)).toEqual([]);
  });
  it('sends the cached rules and sources with a short history and returns the text', async () => {
    let sent: Record<string, unknown> | null = null;
    const fetch = (async (_url: unknown, init?: RequestInit) => {
      sent = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return new Response(JSON.stringify({ id: 'm', type: 'message', role: 'assistant', model: 'claude-haiku-4-5-20251001', content: [{ type: 'text', text: 'What have you tried so far? [S1]' }], stop_reason: 'end_turn', usage: { input_tokens: 10, output_tokens: 5 } }), { status: 200, headers: { 'content-type': 'application/json' } });
    }) as unknown as typeof globalThis.fetch;
    const s = tutorSituation(chm, items, recordings, [], [], [chm], '2026-09-15', TZ, 'stoichiometry');
    const answer = await askTutor({ apiKey: 'k', fetch, sources, situation: s, history: [{ role: 'user', text: 'hi' }, { role: 'assistant', text: 'hello' }], text: 'How many moles?' });
    expect(answer).toBe('What have you tried so far? [S1]');
    const body = sent as unknown as { system: { text: string; cache_control?: unknown }[]; messages: { role: string; content: string }[]; max_tokens: number };
    expect(body.system.length).toBe(3);
    expect(body.system[0].cache_control).toEqual({ type: 'ephemeral' });
    expect(body.system[2].cache_control).toBeUndefined();
    expect(body.messages.map((m) => m.role)).toEqual(['user', 'assistant', 'user']);
    expect(body.messages[2].content).toBe('How many moles?');
  });
});
