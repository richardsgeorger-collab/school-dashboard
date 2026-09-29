import { describe, expect, it } from 'vitest';
import { sessionTopics, topicBlocks } from './examTopics';

describe('session topic lines', () => {
  it('does not say the tag twice when the deck title starts with it', () => {
    const decks = [{ id: 'd', courseId: 'c', title: 'Topic 4: Stoichiometry', tag: 'Topic 4', date: '2026-09-23', pages: 8 }] as never;
    const pages = [1, 2, 3].map((n) => ({ deckId: 'd', n, text: 'x' }));
    const blocks = topicBlocks('c', decks, pages, undefined);
    expect(sessionTopics(1, blocks)[0].text).toBe('Topic 4: Stoichiometry, slides 1–3, plus practice');
  });
  it('still names the topic when the title does not carry it', () => {
    const decks = [{ id: 'd', courseId: 'c', title: 'Week 5 slides', tag: 'Moles', date: '2026-09-23', pages: 8 }] as never;
    const pages = [1, 2].map((n) => ({ deckId: 'd', n, text: 'x' }));
    expect(sessionTopics(1, topicBlocks('c', decks, pages, undefined))[0].text).toBe('Moles: Week 5 slides, slides 1–2, plus practice');
  });
});
