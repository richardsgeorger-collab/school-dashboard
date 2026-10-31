import { describe, expect, it } from 'vitest';
import { trustText } from './Trust';

describe('the trust line (Loop 302)', () => {
  it('a number only when there is a real one', () => {
    // The Web Store's 212 installs stand until the live account count passes them; "hundreds" only from 200.
    expect(trustText(null)).toBe('Free. Join hundreds of GCU students already using it.');
    expect(trustText(40)).toBe('Free. Join hundreds of GCU students already using it.');
  });
});
