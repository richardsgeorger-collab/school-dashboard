import { describe, expect, it } from 'vitest';
import { recapLines } from './TrialStatus';

describe('the end-of-week recap', () => {
  it('shows only lines with a real number behind them, in order', () => {
    const lines = recapLines({ classes: 6, fromHalo: 39, read: 0, found: 4, caught: 1, practice: 0, answered: 12 });
    expect(lines).toEqual([
      [6, 'classes synced from Halo'],
      [39, 'assignments pulled in'],
      [4, 'requirements found in announcements'],
      [1, 'due date change caught'],
      [12, 'questions answered'],
    ]);
  });
  it('says one the right way, and nothing at all for an empty week', () => {
    expect(recapLines({ classes: 1, fromHalo: 1, read: 1, found: 1, caught: 2, practice: 1, answered: 1 }).map(([, l]) => l)).toEqual(['class synced from Halo', 'assignment pulled in', 'announcement read for you', 'requirement found in announcements', 'due date changes caught', 'study plan or practice set built', 'question answered']);
    expect(recapLines({ classes: 0, fromHalo: 0, read: 0, found: 0, caught: 0, practice: 0, answered: 0 })).toEqual([]);
    expect(recapLines(null)).toEqual([]);
  });
});
