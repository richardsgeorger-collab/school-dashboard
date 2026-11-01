import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';
import { addDays, dateOf, diffDays, makeIso, todayStr } from '../domain/dates';
import type { Item } from '../domain/types';
import { daysEarly } from '../joy/joy';
import { dueLabel, relativeDay } from '../ui/format';

// Every countdown across a clock change (Loop 306). GCU's deadlines are Arizona time, which never changes its clocks,
// but a student can be anywhere: on a 23- or 25-hour day "tomorrow" must still mean the next calendar day where the
// student is, and "in 3h" must still be three real hours. Each zone is tested on its spring and fall change days.
const ctx: Record<string, unknown> = { URL, Intl, Date };
ctx.globalThis = ctx;
runInNewContext(readFileSync('extension/onhalo/logic.js', 'utf8'), ctx);
runInNewContext(readFileSync('extension/halo-model.js', 'utf8'), ctx);
const L = ctx.HaloPlusOnLogic as {
  dueIn: (due: string, now: number, tz: string) => string | null;
  dueDayWord: (at: string | number, now: number, tz: string) => string;
  haloDateTime: (t: string, tz: string) => number | null;
  haloFormat: (t: number, tz: string, kind?: string) => string;
};
const M = ctx.HaloPlusModel as unknown as {
  when: (at: string, now: number, tz: string) => string;
  whenAt: (at: string, now: number, tz: string) => string;
  rowTime: (at: string, now: number, tz: string) => string;
  dayOf: (at: string | number, tz: string) => string;
};

// [zone, the day clocks go forward (a 23-hour day), the day they go back (25 hours)] in 2026. Phoenix has neither, so
// it is tested on the US days, where nothing may change for it.
const ZONES: [string, string, string][] = [
  ['America/New_York', '2026-03-08', '2026-11-01'],
  ['America/Los_Angeles', '2026-03-08', '2026-11-01'],
  ['America/Phoenix', '2026-03-08', '2026-11-01'],
  ['Europe/London', '2026-03-29', '2026-10-25'],
  ['Australia/Sydney', '2026-10-04', '2026-04-05'],
];
const H = 3_600_000;
const at = (d: string, t: string, tz: string) => makeIso(d, t, tz);
const ms = (d: string, t: string, tz: string) => Date.parse(at(d, t, tz));
const weekday = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' });

describe.each(ZONES)('%s', (tz, spring, fall) => {
  it('really has the clock changes the tests rely on (or none, in Phoenix)', () => {
    const len = (d: string) => (Date.parse(at(addDays(d, 1), '00:00', tz)) - Date.parse(at(d, '00:00', tz))) / H;
    expect(len(spring)).toBe(tz === 'America/Phoenix' ? 24 : 23);
    expect(len(fall)).toBe(tz === 'America/Phoenix' ? 24 : 25);
    expect(len(addDays(spring, -1))).toBe(24);
  });

  describe.each([
    ['spring', spring],
    ['fall', fall],
  ])('on the %s change (%s)', (_name, D) => {
    const before = addDays(D, -1);
    const after = addDays(D, 1);
    // Late the evening before, just after midnight on the day, and late on the day: every way 24 hours can miss.
    const nows: [string, number, string][] = [
      ['11:30 PM the night before', ms(before, '23:30', tz), before],
      ['12:30 AM on the day', ms(D, '00:30', tz), D],
      ['11:30 PM on the day', ms(D, '23:30', tz), D],
    ];

    it.each(nows)('the extension says tomorrow for the next calendar day, from %s', (_w, now, today) => {
      const next = at(addDays(today, 1), '23:59', tz);
      expect(L.dueIn(next, now, tz)).toBe('tomorrow');
      expect(L.dueDayWord(next, now, tz)).toBe('tomorrow');
      expect(M.when(next, now, tz)).toBe('tomorrow');
      expect(M.rowTime(next, now, tz)).toBe('11:59 PM');
      const two = at(addDays(today, 2), '23:59', tz);
      expect(L.dueIn(two, now, tz)).toBe('in 2 days');
      expect(L.dueDayWord(two, now, tz)).toBe(weekday(addDays(today, 2)));
      expect(M.when(two, now, tz)).toBe(weekday(addDays(today, 2)).slice(0, 3));
      expect(L.dueDayWord(at(today, '23:59', tz), now, tz)).toBe('today');
    });

    it.each(nows)('the app says tomorrow for the next calendar day, from %s', (_w, now, today) => {
      expect(todayStr(tz, new Date(now))).toBe(today);
      const next = at(addDays(today, 1), '23:59', tz);
      expect(dateOf(next, tz)).toBe(addDays(today, 1));
      expect(relativeDay(today, dateOf(next, tz))).toBe('tomorrow');
      expect(dueLabel({ dueAt: next } as Item, tz, today)).toMatch(/^tomorrow, /);
      expect(relativeDay(today, dateOf(at(addDays(today, -1), '23:59', tz), tz))).toBe('yesterday');
    });

    it('finished yesterday reads yesterday, a day back over the change', () => {
      expect(M.whenAt(at(D, '00:30', tz), ms(after, '00:30', tz), tz)).toBe(`yesterday 12:30 AM`);
      expect(M.whenAt(at(before, '23:30', tz), ms(D, '23:30', tz), tz)).toBe(`yesterday 11:30 PM`);
    });

    it('hours count real time: the clock change neither adds nor loses an hour', () => {
      const now = ms(D, '00:30', tz);
      const due = at(D, '05:00', tz);
      const real = Math.floor((Date.parse(due) - now) / H);
      expect(L.dueIn(due, now, tz)).toBe(`in ${real}h`);
      expect(real).toBe(tz === 'America/Phoenix' ? 4 : D === spring ? 3 : 5);
    });

    it('11:59 PM is 11:59 PM on the day, and round-trips', () => {
      const iso = at(D, '23:59', tz);
      expect(dateOf(iso, tz)).toBe(D);
      expect(L.haloFormat(Date.parse(iso), tz)).toContain('11:59 PM');
      expect(M.dayOf(iso, tz)).toBe(D);
      expect(diffDays(before, after)).toBe(2);
    });

    it('days early counts calendar days, not 24-hour blocks', () => {
      // Done late the night before the change, due the night after it: two days early, however long the day was.
      expect(daysEarly(at(after, '23:59', tz), at(before, '23:30', tz), tz)).toBe(2);
      expect(daysEarly(at(D, '23:59', tz), at(before, '23:30', tz), tz)).toBe(1);
      expect(daysEarly(at(D, '23:59', tz), at(D, '00:30', tz), tz)).toBeNull();
    });
  });

  it('a Halo time that never happened (the skipped hour) is not read as some other time', () => {
    const skipped = tz === 'Europe/London' ? '1:30 AM' : '2:30 AM';
    const [y, m, d] = spring.split('-').map(Number);
    const text = `${new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' })} ${d}, ${y}, ${skipped}`;
    const t = L.haloDateTime(text, tz);
    if (tz === 'America/Phoenix') expect(t).toBe(ms(spring, '02:30', tz));
    else expect(t).toBeNull();
  });

  it('a Halo time that happened twice (the repeated hour) reads as one of the two', () => {
    const twice = tz === 'Europe/London' ? '1:30 AM' : tz === 'Australia/Sydney' ? '2:30 AM' : '1:30 AM';
    const [y, m, d] = fall.split('-').map(Number);
    const text = `${new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' })} ${d}, ${y}, ${twice}`;
    const t = L.haloDateTime(text, tz);
    expect(t).not.toBeNull();
    expect(L.haloFormat(t as number, tz)).toContain(twice);
    expect(M.dayOf(t as number, tz)).toBe(fall);
  });
});

describe('Arizona deadlines seen from a zone that changes its clocks', () => {
  it('a GCU 11:59 PM Arizona deadline on the US fall change lands on Monday for a New York student (1:59 AM there)', () => {
    const due = makeIso('2026-11-01', '23:59', 'America/Phoenix'); // 1:59 AM Monday, Nov 2 in New York (EST by then)
    const now = ms('2026-10-31', '23:30', 'America/New_York');
    expect(L.dueIn(due, now, 'America/New_York')).toBe('in 2 days');
    expect(L.dueDayWord(due, now, 'America/New_York')).toBe('Monday');
    expect(L.dueIn(due, ms('2026-11-01', '23:30', 'America/New_York'), 'America/New_York')).toBe('in 2h');
  });
});
