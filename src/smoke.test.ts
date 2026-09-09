import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from './domain/types';

describe('smoke', () => {
  it('has Phoenix defaults', () => {
    expect(DEFAULT_SETTINGS.timezone).toBe('America/Phoenix');
    expect(DEFAULT_SETTINGS.weekdayMinutes).toBe(180);
  });
});
