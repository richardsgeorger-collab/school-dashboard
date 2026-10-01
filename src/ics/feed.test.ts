import { describe, expect, it } from 'vitest';
import { feedUrls } from '../views/calendar/CalendarFeed';
import { buildFeed, fold, icsText, icsUtc } from './feed';
import { parseIcs, parseIcsDate } from './parse';

const now = '2026-10-01T15:00:00.000Z';
const courses = [{ id: 'c1', code: 'ENG-105', name: 'English' }];
const items = [
  { id: 'i1', courseId: 'c1', title: 'Rhetorical analysis draft, with sources; APA', label: 'Rhetorical analysis', points: 100, dueAt: '2026-10-02T23:59:00-07:00', status: 'todo', estimatedMinutes: 120 },
  { id: 'i2', courseId: 'c1', title: 'Topic 3 DQ', dueAt: '2026-09-29T23:59:00-07:00', status: 'done', points: 10 },
  { id: 'i3', courseId: 'c1', title: 'Old quiz', dueAt: '2026-08-01T23:59:00-07:00', status: 'done' },
  { id: 'i4', courseId: 'gone', title: 'No class', dueAt: '2026-10-05T12:00:00-07:00' },
];

describe('the calendar feed', () => {
  const ics = buildFeed({ items, courses, now });
  it('is a calendar with CRLF line ends and no line over 75 octets', () => {
    expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
    for (const line of ics.split('\r\n')) expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    expect(ics).toContain('X-WR-CALNAME:Halo+ deadlines');
  });
  it('one event per item at its due time, done ones marked, anything due over 30 days ago left out', () => {
    const file = parseIcs(ics);
    expect(file.events.map((e) => e.summary)).toEqual(['✓ ENG-105: Topic 3 DQ', 'ENG-105: Rhetorical analysis', 'No class']);
    const draft = file.events[1];
    expect(draft.uid).toBe('i1@haloplus.app');
    expect(Date.parse(parseIcsDate(draft.dtstart, 'America/Phoenix')!)).toBe(Date.parse('2026-10-02T23:59:00-07:00'));
    expect(draft.description).toContain('Rhetorical analysis draft, with sources; APA');
    expect(draft.description).toContain('100 pts · about 2h');
    expect(draft.url).toBe('https://haloplus.app/#/class?c=c1&i=i1');
  });
  it('escapes text and folds long lines on character boundaries', () => {
    expect(icsText('a, b; c\\d\ne')).toBe(String.raw`a\, b\; c\\d\ne`);
    const long = `SUMMARY:${'é'.repeat(80)}`;
    const folded = fold(long);
    for (const l of folded.split('\r\n')) expect(new TextEncoder().encode(l).length).toBeLessThanOrEqual(75);
    expect(folded.split('\r\n').map((l, i) => (i ? l.slice(1) : l)).join('')).toBe(long);
    expect(icsUtc('2026-10-01T23:59:00-07:00')).toBe('20261002T065900Z');
  });
  it('a plan without the feed gets one event saying it is paused, not an empty calendar', () => {
    const file = parseIcs(buildFeed({ items, courses, now, paused: true }));
    expect(file.events).toHaveLength(1);
    expect(file.events[0].summary).toBe('Halo+ calendar is paused');
    expect(file.events[0].description).toContain('#/you?s=plan');
  });
  it('Google, Apple and the plain link all point at the same feed', () => {
    const u = feedUrls('https://abc.supabase.co/', 'f'.repeat(48));
    expect(u.https).toBe(`https://abc.supabase.co/functions/v1/calendar/${'f'.repeat(48)}.ics`);
    expect(u.webcal).toBe(`webcal://abc.supabase.co/functions/v1/calendar/${'f'.repeat(48)}.ics`);
    expect(u.google).toBe(`https://calendar.google.com/calendar/r?cid=${encodeURIComponent(u.webcal)}`);
  });
});
