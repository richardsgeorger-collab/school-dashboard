import { describe, expect, it } from 'vitest';
import { headsUpText } from './HeadsUp';

describe('a heads-up line', () => {
  it('is about fifteen words, and a link becomes Open rather than an address', () => {
    const long = 'UNV-106 posted: Please complete the Career Reflection survey before Friday at https://gcu.qualtrics.com/jfe/form/SV_abc123 and then upload the PDF to the dropbox, remembering the rubric and the cover page.';
    const r = headsUpText(long);
    expect(r.href).toBe('https://gcu.qualtrics.com/jfe/form/SV_abc123');
    expect(r.text).not.toMatch(/https?:/);
    expect(r.text.split(' ').length).toBeLessThanOrEqual(16);
    expect(r.text.endsWith('…')).toBe(true);
  });
  it('leaves a short line alone', () => {
    expect(headsUpText('Oct 2–7 has 645 pts across 11 items.')).toEqual({ text: 'Oct 2–7 has 645 pts across 11 items.', href: null });
  });
});
