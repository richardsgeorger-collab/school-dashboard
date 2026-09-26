import { describe, expect, it } from 'vitest';
import { freshMax, maxOpen, maxStepIndex } from './maxState';

describe('the Max welcome', () => {
  it('opens fresh and closes when done', () => {
    const s = freshMax('2026-09-25T00:00:00Z');
    expect(maxOpen(s)).toBe(true);
    expect(maxOpen({ ...s, doneAt: '2026-09-25T00:05:00Z' })).toBe(false);
    expect(maxOpen({ ...s, step: 'done' })).toBe(false);
    expect(maxOpen(undefined)).toBe(false);
  });
  it('numbers the four screens', () => {
    expect(maxStepIndex('welcome')).toBe(0);
    expect(maxStepIndex('tour')).toBe(3);
    expect(maxStepIndex('done')).toBe(0);
  });
});
