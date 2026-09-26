import { describe, expect, it } from 'vitest';
import { ACCENTS, accentToShow, isAccent } from './accents';

describe('accent presets', () => {
  it('gold is the default and the first preset', () => {
    expect(ACCENTS[0].id).toBe('gold');
    expect(accentToShow(undefined, true)).toBe('gold');
    expect(accentToShow(undefined, false)).toBe('gold');
  });
  it('a chosen preset shows only while the account has the feature; the choice itself is kept', () => {
    expect(accentToShow('violet', true)).toBe('violet');
    expect(accentToShow('violet', false)).toBe('gold');
  });
  it('an unknown value falls back to gold', () => {
    expect(isAccent('mauve')).toBe(false);
    expect(accentToShow('mauve' as never, true)).toBe('gold');
  });
});
