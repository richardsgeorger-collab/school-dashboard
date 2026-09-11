/**
 * TWO SYNC PATHS, TWO OPPOSITE TIME RULES. Keep both tests here so nobody merges the code paths.
 *
 * 1. The .ics export (Better Halo "Export Assignments") writes FLOATING local time:
 *    "DTEND:20260913T235959" has no Z and no TZID and is already Phoenix wall-clock.
 *    It must be read as-is in the settings zone. Shifting it by seven hours is the bug.
 *
 * 2. The GraphQL bookmark path gets bare strings from Halo's backend that ARE UTC:
 *    "2026-09-14 06:59:00" means 06:59Z, which is Sep 13 11:59 PM in Phoenix.
 *
 * Same assignment, both paths, one answer: 2026-09-13T23:59:00-07:00.
 */
import { describe, expect, it } from 'vitest';
import { parseHaloDate } from '../halo/normalize';
import { parseIcsDate, stampIso } from './parse';

const PHX = 'America/Phoenix';
const ANSWER = '2026-09-13T23:59:00-07:00';

describe('the same assignment through both paths', () => {
  it('ics: floating local DTEND is Phoenix wall time, no shift', () => {
    expect(parseIcsDate({ value: '20260913T235959', tzid: null }, PHX)).toBe(ANSWER);
    // DTSTART is fifteen minutes earlier by construction; it is never the due time.
    expect(parseIcsDate({ value: '20260913T234459', tzid: null }, PHX)).toBe('2026-09-13T23:44:00-07:00');
    // The five in-class items land at 8:00 AM, not 1:00 AM.
    expect(parseIcsDate({ value: '20260916T080000', tzid: null }, PHX)).toBe('2026-09-16T08:00:00-07:00');
  });
  it('graphql: zoned and bare-UTC strings both shift into Phoenix', () => {
    expect(parseHaloDate('2026-09-14T06:59:00.000Z', PHX)).toBe(ANSWER);
    expect(parseHaloDate('2026-09-14 06:59:00', PHX)).toBe(ANSWER);
  });
  it('the two rules disagree on the same bare digits, which is the point', () => {
    const icsRead = parseIcsDate({ value: '20260914T065900', tzid: null }, PHX);
    const halo = parseHaloDate('2026-09-14 06:59:00', PHX);
    expect(icsRead).toBe('2026-09-14T06:59:00-07:00');
    expect(halo).toBe(ANSWER);
    expect(icsRead).not.toBe(halo);
  });
});

describe('ics zone markers are honored when present', () => {
  it('Z means UTC, TZID means that zone, both re-expressed in Phoenix', () => {
    expect(parseIcsDate({ value: '20260914T065900Z', tzid: null }, PHX)).toBe(ANSWER);
    expect(parseIcsDate({ value: '20260914T005900', tzid: 'America/Denver' }, PHX)).toBe('2026-09-13T23:59:00-07:00');
    expect(parseIcsDate({ value: '20260913', tzid: null }, PHX)).toBe('2026-09-13T23:59:00-07:00');
    expect(parseIcsDate({ value: 'soon', tzid: null }, PHX)).toBeNull();
    expect(parseIcsDate(null, PHX)).toBeNull();
  });
  it('DTSTAMP is UTC with or without the Z', () => {
    expect(stampIso({ value: '20260911T153000Z', tzid: null })).toBe('2026-09-11T15:30:00.000Z');
    expect(stampIso({ value: '20260911T153000', tzid: null })).toBe('2026-09-11T15:30:00.000Z');
  });
});

describe('Arizona has no daylight saving time; offsets come from Intl zone rules, not a constant', () => {
  it('July: Phoenix stays -07:00 while Denver is -06:00', () => {
    expect(parseIcsDate({ value: '20260714T235959', tzid: null }, PHX)).toBe('2026-07-14T23:59:00-07:00');
    expect(parseIcsDate({ value: '20260714T235959', tzid: null }, 'America/Denver')).toBe('2026-07-14T23:59:00-06:00');
    expect(parseHaloDate('2026-07-15T06:59:00Z', PHX)).toBe('2026-07-14T23:59:00-07:00');
    expect(parseHaloDate('2026-07-15T06:59:00Z', 'America/Denver')).toBe('2026-07-15T00:59:00-06:00');
  });
  it('November, after the switch: both are -07:00 again', () => {
    expect(parseIcsDate({ value: '20261115T235959', tzid: null }, 'America/Denver')).toBe('2026-11-15T23:59:00-07:00');
    expect(parseHaloDate('2026-11-16T06:59:00Z', 'America/Denver')).toBe('2026-11-15T23:59:00-07:00');
  });
});
