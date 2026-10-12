import { describe, expect, it } from 'vitest';
import { failWords, relTime } from './syncWords';

const TZ = 'America/Phoenix';
describe('the last-synced words (George, 2026-10-11)', () => {
  const now = Date.parse('2026-10-11T22:00:00Z'); // 3:00 PM Phoenix
  it('relative time, the way a person says it', () => {
    expect(relTime('2026-10-11T21:59:40Z', now, TZ, '2026-10-11')).toBe('just now');
    expect(relTime('2026-10-11T21:55:00Z', now, TZ, '2026-10-11')).toBe('5 min ago');
    expect(relTime('2026-10-11T16:12:00Z', now, TZ, '2026-10-11')).toBe('today 9:12 AM');
    expect(relTime('2026-10-10T19:48:00Z', now, TZ, '2026-10-11')).toBe('yesterday 12:48 PM');
    expect(relTime('2026-10-09T19:48:00Z', now, TZ, '2026-10-11')).toMatch(/^Oct 9 12:48 PM$/);
  });
  it('every way a sync can fail has words and a next step, never a bare error', () => {
    expect(failWords('logged-out', null)).toEqual({ text: "Halo isn't logged in on this computer. Log in at halo.gcu.edu, then try again.", halo: true });
    expect(failWords('move', 'x').text).toMatch(/Move prompt/);
    expect(failWords('foreign', 'This Halo account belongs to ge***@gmail.com. A test account can\'t take it.').text).toBe("This Halo account belongs to ge***@gmail.com. A test account can't take it.");
    expect(failWords('not-landed', 'Read Halo at 4:52 PM, but it did not reach your account: Too many syncs in the last hour. It is kept here; press Sync now to try again.').text).toBe("The sync didn't reach your account: Too many syncs in the last hour. Try again.");
    expect(failWords(null, null).text).toBe("The sync didn't reach your account. Try again.");
  });
});
