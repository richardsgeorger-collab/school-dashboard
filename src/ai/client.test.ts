import { describe, expect, it } from 'vitest';
import { notesAreEmpty, notesFromTool } from '../record/summarize';
import { reviveJsonStrings } from './client';
import { MODEL } from './model';

describe('tool answers with lists sent as strings', () => {
  it('turns a string holding JSON back into the list or object, and leaves other strings alone', () => {
    const got = reviveJsonStrings({ concepts: '["moles", "limiting reagent"]', knowledge: '{"a":1}', summary: 'Plain words.', odd: '[not json', n: 3 });
    expect(got).toEqual({ concepts: ['moles', 'limiting reagent'], knowledge: { a: 1 }, summary: 'Plain words.', odd: '[not json', n: 3 });
    expect(reviveJsonStrings(null)).toBeNull();
    expect(reviveJsonStrings(['x'])).toEqual(['x']);
  });

  it('a lecture answer written that way is read in full instead of saved as an empty lecture', () => {
    const stringified = {
      summary: JSON.stringify(['Stoichiometry: convert to moles first.']),
      concepts: JSON.stringify(['limiting reagent', 'percent yield']),
      mentions: '[]',
      emphasized: '[]',
      exam_flags: JSON.stringify([{ point: 'Limiting reagent is on the exam', quote: 'this is on the exam', at: '' }]),
      terms: '[]',
      dwelt: '[]',
      skipped: '[]',
    };
    const before = notesFromTool(stringified, MODEL);
    expect(notesAreEmpty(before)).toBe(true);
    const after = notesFromTool(reviveJsonStrings(stringified), MODEL);
    expect(notesAreEmpty(after)).toBe(false);
    expect(after.concepts).toContain('percent yield');
    expect(after.knowledge?.examFlags[0].point).toMatch(/limiting reagent/i);
  });
});
