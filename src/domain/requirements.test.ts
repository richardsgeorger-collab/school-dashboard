import { describe, expect, it } from 'vitest';
import { dedupeRequirements, mergeRequirements } from './requirements';
import type { Requirement } from './types';

const src = (id: string, quote: string) => ({ kind: 'announcement' as const, id, title: 'Week 5', quote, at: null });
const req = (id: string, text: string, quote = `q${id}`, over: Partial<Requirement> = {}): Requirement => ({ id, text, dueAt: null, done: false, doneAt: null, gradedOn: true, source: src(`p${id}`, quote), addedAt: '2026-09-27', ...over });

const A = 'Use the attached Connections_Presentation_Guide and APA_Guide/APA_Template to create your Chemistry Connections Presentation';
const B = 'Create your Chemistry Connections Presentation using the attached Connections_Presentation_Guide and APA_Guide/APA_Template';

describe('one part, two wordings', () => {
  it('a rewording arriving later merges into the part already there, keeping its tick and gaining the source', () => {
    const out = mergeRequirements([req('1', A, 'first', { done: true, doneAt: '2026-09-26' })], [req('2', B, 'second')]);
    expect(out).toHaveLength(1);
    expect(out[0].done).toBe(true);
    expect(out[0].sources?.map((s) => s.quote)).toEqual(['first', 'second']);
  });
  it('two wordings already stored on an item fold into one when the data loads', () => {
    const out = dedupeRequirements([req('1', A), req('2', B), req('3', 'Cite two peer-reviewed sources')]);
    expect(out.map((r) => r.id)).toEqual(['1', '3']);
  });
  it('word forms do not keep two parts apart: using/use, guides/guide, attached/attach', () => {
    const out = dedupeRequirements([req('1', 'Attach the lab guides and use the template'), req('2', 'Using the template, the lab guide must be attached')]);
    expect(out).toHaveLength(1);
  });
  it('genuinely different parts stay apart', () => {
    const out = dedupeRequirements([req('1', 'Cite two peer-reviewed sources'), req('2', 'Bring your own splash goggles to lab')]);
    expect(out).toHaveLength(2);
  });
});
