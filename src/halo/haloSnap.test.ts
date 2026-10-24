import { describe, expect, it } from 'vitest';
import { dateOf } from '../domain/dates';
import { computeSchedule } from '../domain/schedule';
import { demoStudent } from '../demo/student';
import { boxWorthy, classCodeOf, haloSnap } from './haloSnap';

const NOW = '2026-10-22T17:00:00.000Z';

describe('the snapshot Halo+ hands the extension for Halo pages', () => {
  const d = demoStudent(NOW).data;
  const today = dateOf(NOW, d.settings.timezone);
  const schedule = computeSchedule(d.items, d.settings, today, { start: '2026-08-31', end: '2026-12-20' }, NOW);
  const s = haloSnap({ courses: d.courses, items: d.items, settings: d.settings, schedule, canSync: true, now: NOW });

  // Done work in the window too (2026-10-24): "done" in Halo+ must win over the extension's own Halo reading.
  it('carries three days back to three weeks ahead, done work included, never older work', () => {
    const t = Date.parse(NOW);
    for (const i of s.items) {
      const due = Date.parse(i.due);
      expect(due >= t - 3 * 86_400_000 && due <= t + 21 * 86_400_000).toBe(true);
    }
    expect(s.items.some((i) => i.done === 1)).toBe(true);
    expect(s.items.length).toBeGreaterThan(3);
    expect(s.items.every((i) => i.ty !== 'participation')).toBe(true);
  });
  it('the assignment-page line only for something to bring or a new deliverable, never a reading reminder', () => {
    expect(boxWorthy([{ text: 'Bring your lab coat and goggles', gradedOn: false, scope: 'instance' }, { text: 'Review chapters 3 and 4 before the quiz', gradedOn: false, scope: 'instance' }, { text: 'Submit the data table as one PDF', gradedOn: true, scope: 'instance' }, { text: 'Read the lab manual pages 40-45', gradedOn: true, scope: 'instance' }, { text: 'Scientific calculator only', gradedOn: false, scope: 'reference' }])).toEqual(['Bring your lab coat and goggles', 'Submit the data table as one PDF', 'Scientific calculator only']);
  });
  it('what announcements added, in short, and a date an announcement moved', () => {
    expect(s.items.some((i) => i.x > 0 && (i.xs ?? []).length > 0)).toBe(true);
    expect(s.items.some((i) => !!i.m)).toBe(true);
    expect(s.hidden).toBeGreaterThan(0);
  });
  it('each class with the code Halo prints on its card, the grade, and its Halo+ color (the dot in "This week")', () => {
    expect(s.classes.length).toBe(d.courses.length);
    for (const c of s.classes) expect(c.col).toBe(d.courses.find((k) => k.id === c.id)?.color);
    for (const c of s.classes) expect(c.cc).toBe(classCodeOf(c.slug));
    expect(classCodeOf('CHM-113-WF700A-20260908')).toBe('CHM-113-WF700A');
  });
  it('where an item opens on Halo: its topic and Halo\'s own type, when Halo+ has them', () => {
    const one = d.items.find((i) => i.haloId && i.type !== 'participation' && Date.parse(i.dueAt) > Date.parse(NOW))!;
    const s2 = haloSnap({ courses: d.courses, items: d.items.map((i) => (i.id === one.id ? { ...i, haloUnitId: 'unit-9', haloType: 'QUIZ' } : i)), settings: d.settings, schedule, canSync: true, now: NOW });
    expect(s2.items.find((i) => i.id === one.id)).toMatchObject({ u: 'unit-9', hy: 'QUIZ' });
  });
    it('the do-now item, the plan, and the switch', () => {
    expect(s.top).toBeTruthy();
    expect(s.plan).toBe('sync');
    expect(s.show).toBe(true);
    expect(haloSnap({ courses: d.courses, items: d.items, settings: { ...d.settings, haloOnHalo: false }, schedule, canSync: false, now: NOW })).toMatchObject({ plan: 'free', show: false });
  });
});
