import { describe, expect, it } from 'vitest';
import { mkItem, TZ } from '../halo/fixtures';
import { cookMeter } from './cook';

// "How much unfinished work this class needs from me in the next 7 days" (George, 2026-10-04).
const at = (d: string) => `${d}T23:59:00-07:00`;
const today = '2026-09-17';
let n = 0;
const item = (type: Parameters<typeof mkItem>[0]['type'], due: string, minutes = 60, extra = {}) => mkItem({ id: `i${(n += 1)}`, courseId: 'c', title: `${type} ${n}`, label: `${type} ${n}`, type, points: 10, dueAt: at(due), estimatedMinutes: minutes, ...extra });

describe('the Cooked meter', () => {
  it('is green with nothing due this week, and says so', () => {
    const c = cookMeter([], today, TZ);
    expect(c).toMatchObject({ level: 'green', items: 0, hours: 0 });
    expect(c.fill).toBeGreaterThan(0);
    expect(c.why).toBe('Nothing due in the next 7 days.');
  });
  it('counts only the next 7 days: something due in 8 days is not this week', () => {
    expect(cookMeter([item('paper', '2026-09-25', 600)], today, TZ).items).toBe(0);
    expect(cookMeter([item('paper', '2026-09-23', 120)], today, TZ).items).toBe(1);
  });
  it('never counts work that is checked off, submitted on Halo or graded', () => {
    const c = cookMeter(
      [
        item('homework', '2026-09-20', 120, { status: 'done', completedAt: '2026-09-16T10:00:00Z' }),
        item('homework', '2026-09-20', 120, { halo: { status: 'SUBMITTED', submittedAt: '2026-09-16T10:00:00Z', checkedAt: '' } }),
        item('homework', '2026-09-20', 120, { score: 9 }),
        item('homework', '2026-09-20', 90),
      ],
      today,
      TZ,
    );
    expect(c.items).toBe(1);
    expect(c.why).toBe('1 item, ~1.5h this week.');
  });
  it('weighs by hours, not by kind: a short essay is lighter than a long homework', () => {
    const essay = cookMeter([item('paper', '2026-09-22', 30)], today, TZ).load;
    const hw = cookMeter([item('homework', '2026-09-22', 150)], today, TZ).load;
    expect(hw).toBeGreaterThan(essay);
  });
  it('bumps overdue work and work due in the next 48 hours, and says so', () => {
    const later = cookMeter([item('homework', '2026-09-22', 120)], today, TZ).load;
    const soon = cookMeter([item('homework', '2026-09-18', 120)], today, TZ);
    const late = cookMeter([item('homework', '2026-09-15', 120)], today, TZ);
    expect(soon.load).toBeGreaterThan(later);
    expect(late.load).toBeGreaterThan(soon.load);
    expect(late.why).toBe('1 item, ~2h this week, 1 overdue.');
    expect(soon.why).toBe('1 item, ~2h this week, 1 due in the next 48 hours.');
    // Overdue for more than two weeks is history, not this week's load.
    expect(cookMeter([item('homework', '2026-08-30', 120)], today, TZ).items).toBe(0);
  });
  it('goes green, yellow, red by hours: under 3, from 3, from 6', () => {
    expect(cookMeter([item('homework', '2026-09-22', 150)], today, TZ).level).toBe('green');
    expect(cookMeter([item('homework', '2026-09-22', 200)], today, TZ).level).toBe('yellow');
    expect(cookMeter([item('paper', '2026-09-22', 240), item('homework', '2026-09-21', 150)], today, TZ).level).toBe('red');
  });
  it('counts half of something already started, and uses the estimate it is given', () => {
    expect(cookMeter([item('homework', '2026-09-22', 120, { status: 'in_progress' })], today, TZ).hours).toBe(1);
    expect(cookMeter([item('homework', '2026-09-22', 120)], today, TZ, () => 30).hours).toBe(0.5);
  });
  it('leaves out an unexplained participation check-in', () => {
    expect(cookMeter([item('participation', '2026-09-19', 20)], today, TZ).items).toBe(0);
  });
});
