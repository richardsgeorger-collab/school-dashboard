import { describe, expect, it } from 'vitest';
import { topicCovered, topicTerms } from './topic';

const sources = [{ text: 'Limiting reagent: the reactant that runs out first. Molarity M = mol / L.' }, { text: 'Percent yield = actual / theoretical × 100.' }];

describe('whether the material covers a topic by name', () => {
  it('ignores the words that name a place in the course', () => {
    expect(topicTerms('Topic 4: Molecular Shapes and Intermolecular Forces')).toEqual(['molecular', 'shapes', 'intermolecular', 'forces']);
    expect(topicCovered('Topic 4: Molecular Shapes and Intermolecular Forces', sources)).toBe(false);
  });
  it('is true when any real word of the topic is in the material', () => {
    expect(topicCovered('limiting reagent', sources)).toBe(true);
    expect(topicCovered('Week 3 percent yield', sources)).toBe(true);
    expect(topicCovered('', sources)).toBe(false);
  });
});
