import { describe, expect, it } from 'vitest';
import type { Settings } from '../domain/types';
import { mergeSettings } from './repository';
import { stampChanged } from './store';

const base = { updatedAt: '2026-10-12T10:00:00.000Z' } as unknown as Settings;

describe('stampChanged with clocks that disagree', () => {
  it('a slow clock still stamps its newest change after the last one', () => {
    // A phone set the theme at 10:05 (true time). The laptop's clock is 10 minutes slow and changes it at "9:56".
    const seen = { ...base, theme: 'dark', stamps: { theme: '2026-10-12T10:05:00.000Z' } } as unknown as Settings;
    const mine = stampChanged(seen, { ...seen, theme: 'light', updatedAt: '2026-10-12T09:56:00.000Z' } as unknown as Settings);
    expect(mine.stamps?.theme).toBe('2026-10-12T10:05:00.001Z');
    // And the merge keeps the laptop's change, not the phone's older one.
    const merged = mergeSettings(mine, seen);
    expect((merged as unknown as { theme: string }).theme).toBe('light');
  });
  it('a correct clock stamps with the time when it is later', () => {
    const seen = { ...base, theme: 'dark', stamps: { theme: '2026-10-12T09:00:00.000Z' } } as unknown as Settings;
    const mine = stampChanged(seen, { ...seen, theme: 'light', updatedAt: '2026-10-12T10:01:00.000Z' } as unknown as Settings);
    expect(mine.stamps?.theme).toBe('2026-10-12T10:01:00.000Z');
  });
  it('only changed keys are stamped', () => {
    const seen = { ...base, theme: 'dark', density: 'cozy', stamps: { density: '2026-10-12T08:00:00.000Z' } } as unknown as Settings;
    const mine = stampChanged(seen, { ...seen, theme: 'light', updatedAt: '2026-10-12T10:01:00.000Z' } as unknown as Settings);
    expect(mine.stamps?.density).toBe('2026-10-12T08:00:00.000Z');
  });
});
