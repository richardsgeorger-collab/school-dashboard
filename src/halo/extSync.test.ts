import { describe, expect, it } from 'vitest';
import { syncPercent } from './extSync';

describe('syncPercent', () => {
  it('moves with time alone, toward 90 and never past it', () => {
    expect(syncPercent(0, null)).toBe(0);
    expect(syncPercent(20_000, null)).toBeGreaterThan(25);
    expect(syncPercent(600_000, null)).toBeLessThanOrEqual(90);
  });
  it('a reported step pushes it further, class by class', () => {
    expect(syncPercent(2000, 'Reading BIO-181 (3 of 6)…')).toBe(45);
    expect(syncPercent(2000, 'Reading BIO-181 rubrics (1 of 2)…')).toBe(80);
    expect(syncPercent(2000, 'Sending to your Halo+ account…')).toBe(93);
  });
  it('never 100 (the payoff takes over then)', () => {
    expect(syncPercent(10_000_000, 'Getting rubric files (9 of 9)…')).toBeLessThan(100);
  });
});
