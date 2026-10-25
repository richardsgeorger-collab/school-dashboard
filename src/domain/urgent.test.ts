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
  // What George saw on real class cards (2026-10-24): neither is a step to take.
  it('never "Acknowledge this announcement…" or a format rule', () => {
    expect(urgentFor('c', [lab([req({ text: 'Acknowledge this announcement after reading it' })])], TODAY, TZ)).toEqual([]);
    expect(urgentFor('c', [lab([req({ text: 'Op-ed follows five-paragraph structure' })])], TODAY, TZ)).toEqual([]);
    expect(urgentFor('c', [lab([req({ text: 'Cite the textbook in APA format in the main post' })])], TODAY, TZ)).toEqual([]);
    expect(urgentFor('c', [lab([req({ text: 'Post your main response by Wednesday, at least 250 words' })])], TODAY, TZ)).toHaveLength(1);
  });
  it('red only when due today or tomorrow; the chip says the step and its day', () => {
    const near = urgentFor('c', [lab([req({ text: 'Bring goggles', dueAt: '2026-09-30T08:00:00-07:00' })])], TODAY, TZ)[0];
    const later = urgentFor('c', [lab([req({ text: 'Bring goggles', dueAt: '2026-10-02T08:00:00-07:00' })], '2026-10-02T23:59:00-07:00')], TODAY, TZ)[0];
    expect([near.short, near.soon]).toEqual(['Bring goggles · Tomorrow', true]);
    expect([later.short, later.soon]).toEqual(['Bring goggles · Friday', false]);
  });
  it('says the day when the line has none, soonest first', () => {
    const u = urgentFor('c', [lab([req({ id: 'a', text: 'Bring goggles', dueAt: '2026-10-01T08:00:00-07:00' }), req({ id: 'b', text: 'Upload the pre-lab', dueAt: '2026-09-30T23:59:00-07:00' })])], TODAY, TZ);
    expect(u.map((x) => x.line)).toEqual(["Don't forget: Upload the pre-lab by tomorrow", "Don't forget: Bring goggles by Thursday"]);
  });
});
