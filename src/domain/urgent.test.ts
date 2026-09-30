import { describe, expect, it } from 'vitest';
import { mkItem } from '../halo/fixtures';
import type { Requirement } from './types';
import { urgentFor } from './urgent';

const TZ = 'America/Phoenix';
const TODAY = '2026-09-29'; // Tuesday
const src = { kind: 'announcement' as const, id: 'p', title: 'Week 3', quote: 'q', at: '2026-09-28T15:00:00Z' };
const req = (o: Partial<Requirement>): Requirement => ({ id: 'r', text: 'Sign the Lab Safety Waiver before Thursday\'s lab', dueAt: null, done: false, doneAt: null, gradedOn: true, source: src, addedAt: 'x', ...o });
const lab = (reqs: Requirement[], due = '2026-10-01T23:59:00-07:00') => mkItem({ id: 'lab', courseId: 'c', title: 'Stoichiometry Lab', dueAt: due, haloId: 'h', requirements: reqs });

describe('the urgent warning on a class card', () => {
  it('a required part due within three days', () => {
    const u = urgentFor('c', [lab([req({})])], TODAY, TZ);
    expect(u.map((x) => x.line)).toEqual(["Don't forget: Sign the Lab Safety Waiver before Thursday's lab"]);
  });
  it('a gate (waiver before lab) when the lab is within a week, even if the lab itself is five days out', () => {
    expect(urgentFor('c', [lab([req({})], '2026-10-04T23:59:00-07:00')], TODAY, TZ)).toHaveLength(1);
    expect(urgentFor('c', [lab([req({ text: 'Cite two sources' })], '2026-10-04T23:59:00-07:00')], TODAY, TZ)).toHaveLength(0);
  });
  it('not when ticked, past, not required, not from an announcement, or someone else\'s class', () => {
    expect(urgentFor('c', [lab([req({ done: true })])], TODAY, TZ)).toHaveLength(0);
    expect(urgentFor('c', [lab([req({})], '2026-09-27T23:59:00-07:00')], TODAY, TZ)).toHaveLength(0);
    expect(urgentFor('c', [lab([req({ text: 'Reading the chapter helps', gradedOn: false })])], TODAY, TZ)).toHaveLength(0);
    expect(urgentFor('c', [lab([req({ source: { ...src, kind: 'syllabus' as never } })])], TODAY, TZ)).toHaveLength(0);
    expect(urgentFor('other', [lab([req({})])], TODAY, TZ)).toHaveLength(0);
  });
  it('says the day when the line has none, soonest first', () => {
    const u = urgentFor('c', [lab([req({ id: 'a', text: 'Bring goggles', dueAt: '2026-10-01T08:00:00-07:00' }), req({ id: 'b', text: 'Upload the pre-lab', dueAt: '2026-09-30T23:59:00-07:00' })])], TODAY, TZ);
    expect(u.map((x) => x.line)).toEqual(["Don't forget: Upload the pre-lab by tomorrow", "Don't forget: Bring goggles by Thursday"]);
  });
});
