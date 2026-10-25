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
    // One item that is the whole load is named, with when: "(overdue)", "(tomorrow)".
    expect(late.why).toMatch(/^Homework \d+ \(overdue\): ~2h this week\.$/);
    expect(late.overdue).toBe(1);
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
  it('never counts participation, explained or not, weekly or a day post (never overdue or urgent anywhere)', () => {
    expect(cookMeter([item('participation', '2026-09-19', 20)], today, TZ).items).toBe(0);
    // Explained (requirements say what earns it): still a check-in, never "due in the next 48 hours".
    const weekly = item('participation', '2026-09-18', 20, { title: 'Week 7 Participation', requirements: [{ id: 'r', text: 'Post twice', scope: 'requirement' }] });
    const dayPost = item('discussion', '2026-09-21', 25, { title: 'Week 8, Day 1 Participation', label: 'Chem Participation W8 Day 1', points: 0 });
    expect(cookMeter([weekly, dayPost], today, TZ)).toMatchObject({ items: 0, soon: 0, level: 'green' });
  });

  // George's CHM-113 on 2026-10-24 (Loop 266): the card said "On pace", the meter was red with "1 due in the next 48
  // hours". The 48 hours was Week 7 Participation; the red is Exam 1, ~7h of study six days out, and now it says so.
  it('names what fills it: red from one exam reads "Exam 1, Fri", not a contradiction of "On pace"', () => {
    const sat = '2026-10-24';
    const exam = item('exam', '2026-10-30', 420, { title: 'Exam 1', label: 'Chem Exam 1', points: 150 });
    const w7 = item('participation', '2026-10-25', 20, { title: 'Week 7 Participation', label: 'Chem Participation W7', requirements: [{ id: 'r', text: 'Attend', scope: 'requirement' }] });
    const w8d1 = item('discussion', '2026-10-28', 25, { title: 'Week 8, Day 1 Participation', label: 'Chem Participation W8 Day 1', points: 0 });
    const w7d1 = item('discussion', '2026-10-21', 25, { title: 'Week 7, Day 1 Participation', label: 'Chem Participation W7 Day 1', points: 0, halo: { status: 'LATE', submittedAt: null, checkedAt: '' } });
    const c = cookMeter([exam, w7, w8d1, w7d1], sat, TZ, undefined, Date.parse('2026-10-24T20:00:00-07:00'));
    expect(c).toMatchObject({ items: 1, soon: 0, overdue: 0, level: 'red' });
    expect(c.main?.short).toBe('Exam 1, Fri');
    expect(c.why).toBe('Study for Exam 1 (Fri): ~7h this week.');
  });
  it('names nothing when no one item is most of the load, or when it is green', () => {
    const spread = [1, 2, 3, 4].map((d) => item('homework', `2026-09-${17 + d}`, 120));
    expect(cookMeter(spread, today, TZ).main).toBeNull();
    expect(cookMeter([item('homework', '2026-09-20', 60)], today, TZ).main).toBeNull();
  });
  it('says "Mostly" beside the count when one thing is most of several', () => {
    const c = cookMeter([item('paper', '2026-09-22', 360, { title: 'Essay 2' }), item('homework', '2026-09-23', 60)], today, TZ);
    expect(c.main?.short).toBe('Essay 2, Tue');
    expect(c.why).toBe('2 items, ~7h this week. Mostly Essay 2 (Tue, ~6h).');
  });
});
