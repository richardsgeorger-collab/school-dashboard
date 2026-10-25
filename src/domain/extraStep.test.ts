import { describe, expect, it } from 'vitest';
import { isExtraStep } from './extraStep';

const step = (text: string, gradedOn = true) => isExtraStep({ text, gradedOn, scope: 'instance' });

describe('a real extra step (the gold dot, the assignment line, the class card)', () => {
  it('something to bring, do or hand in', () => {
    expect(step('Closed-toe shoes, lab coat and goggles, or no entry', false)).toBe(true);
    expect(step('Bring a printed copy of your draft', false)).toBe(true);
    expect(step('Post your main response by Wednesday, at least 250 words')).toBe(true);
    expect(step('Submit the data table as one PDF')).toBe(true);
    expect(step('Sign the lab safety waiver')).toBe(true);
  });
  // What George saw on real class cards (2026-10-24), and rules about the work.
  it('never a reminder, a rule about the work, or "acknowledge this"', () => {
    expect(step('Acknowledge this announcement after reading it')).toBe(false);
    expect(step('Op-ed follows five-paragraph structure')).toBe(false);
    expect(step('Op-ed argues a position without first-person narrative')).toBe(false);
    expect(step('Cite the textbook in APA format in the main post')).toBe(false);
    expect(step('Review chapters 3 and 4 before the quiz', false)).toBe(false);
    expect(step('Submit by Friday', false)).toBe(false);
  });
});
