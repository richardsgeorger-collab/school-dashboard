import { describe, expect, it } from 'vitest';
import { mkCourse, mkItem } from '../halo/fixtures';
import { localBrief } from './brief';

const item = mkItem({ id: 'i1', courseId: 'c1', title: 'AI-Assisted Career Reflection' });
const course = mkCourse({ id: 'c1', code: 'UNV-106' });

describe('the brief built from the description alone', () => {
  it('leads with what the work asks for, never with the course objective or the benchmark blurb', () => {
    const description = [
      'Objective: Develop proficiency in utilizing Generative AI (GenAI) tools to enhance your writing and research process.',
      'Benchmark Information: This benchmark assignment assesses the following general education competencies.',
      'Use a GCU-approved GenAI tool to draft an outline of your career reflection, then refine it in your own words.',
      'Cite one credible academic source from the GCU Library in APA format.',
      'Short line.',
    ].join('\n');
    const b = localBrief({ item, course, description, rubricText: '' }, 'x');
    expect(b.asks).toEqual(['Use a GCU-approved GenAI tool to draft an outline of your career reflection, then refine it in your own words.', 'Cite one credible academic source from the GCU Library in APA format.']);
    expect(b.source).toBe('local');
  });
  it('keeps a plain description whole, up to four lines', () => {
    const description = ['Access and complete the homework in ALEKS before Sunday night.', 'Show all working in the notebook and upload it as one PDF.', 'Late work loses ten percent a day.', 'Bring a calculator to the review session on Thursday.', 'A fifth line that never shows.'].join('\n');
    expect(localBrief({ item, course, description, rubricText: '' }, 'x').asks).toHaveLength(4);
  });
});
