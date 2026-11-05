import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// One time estimate everywhere (George, 2026-11-04: Now said ~1.5h in the hero sentence and ~45m on the card's chip
// for the same Chem HW 4). The card's chip is the calibrated time (your own pace when Halo+ has enough of it, the
// estimate otherwise), the time the plan uses: every other place on Now and the class page shows that same time.
describe('one time estimate', () => {
  it('Now and the class page show the calibrated time, never the raw estimate', () => {
    for (const f of ['src/views/Now.tsx', 'src/views/ClassPage.tsx']) {
      const src = readFileSync(f, 'utf8');
      expect(src, f).not.toMatch(/(approx|fmtMinutes)\((hero|item|next)\.estimatedMinutes\)/);
    }
    const now = readFileSync('src/views/Now.tsx', 'utf8');
    expect(now).toMatch(/approx\(calibrate\(hero\)\.minutes\)/);
    expect(now).toMatch(/pickReason\(\{ \.\.\.hero, estimatedMinutes: calibrate\(hero\)\.minutes \}/);
    expect(readFileSync('src/views/HeroCard.tsx', 'utf8')).toMatch(/const cal = calibrate\(item\)/);
  });
  it('"due" on Now is Halo\'s due date: the hero sentence says it through dueWords, never the finish-by day', () => {
    const now = readFileSync('src/views/Now.tsx', 'utf8');
    expect(now).toMatch(/dueWords\(hero, schedule, today, tz, derived\)/);
    expect(now).not.toMatch(/due\{' '\}\s*\{WEEKDAY_LONG\[new Date\(\(schedule\.byItem/);
  });
});
