import { describe, expect, it } from 'vitest';
import { trustText } from './Trust';

describe('the trust line (Loop 302)', () => {
  it('a number only when there is a real one', () => {
    expect(trustText(null)).toBe('Free. Join GCU students already using it.');
    expect(trustText(40)).toBe('Free. Join 40+ GCU students already using it.');
  });
});
