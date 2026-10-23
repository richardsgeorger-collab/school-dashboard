import { describe, expect, it } from 'vitest';
import { dateOf } from '../domain/dates';
import { computeSchedule } from '../domain/schedule';
import { demoStudent } from '../demo/student';
import { classCodeOf, haloSnap } from './haloSnap';

const NOW = '2026-10-22T17:00:00.000Z';

describe('the snapshot Halo+ hands the extension for Halo pages', () => {
  const d = demoStudent(NOW).data;
  const today = dateOf(NOW, d.settings.timezone);
  const schedule = computeSchedule(d.items, d.settings, today, { start: '2026-08-31', end: '2026-12-20' }, NOW);
  const s = haloSnap({ courses: d.courses, items: d.items, settings: d.settings, schedule, canSync: true, now: NOW });

  it('carries the next three weeks and what is late, never older work or what was done on another day', () => {
    const t = Date.parse(NOW);
    for (const i of s.items) {
      const due = Date.parse(i.due);
      if (i.done) expect(dateOf(i.due, d.settings.timezone)).toBe(today);
      else expect(due >= t - 3 * 86_400_000 && due <= t + 21 * 86_400_000).toBe(true);
    }
    expect(s.items.length).toBeGreaterThan(3);
    expect(s.items.every((i) => i.ty !== 'participation')).toBe(true);
  });
  it('what announcements added, in short, and a date an announcement moved', () => {
    expect(s.items.some((i) => i.x > 0 && (i.xs ?? []).length > 0)).toBe(true);
    expect(s.items.some((i) => !!i.m)).toBe(true);
    expect(s.hidden).toBeGreaterThan(0);
  });
  it('each class with the code Halo prints on its card, and the grade', () => {
    expect(s.classes.length).toBe(d.courses.length);
    for (const c of s.classes) expect(c.cc).toBe(classCodeOf(c.slug));
    expect(classCodeOf('CHM-113-WF700A-20260908')).toBe('CHM-113-WF700A');
  });
  it('the do-now item, the plan, and the switch', () => {
    expect(s.top).toBeTruthy();
    expect(s.plan).toBe('sync');
    expect(s.show).toBe(true);
    expect(haloSnap({ courses: d.courses, items: d.items, settings: { ...d.settings, haloOnHalo: false }, schedule, canSync: false, now: NOW })).toMatchObject({ plan: 'free', show: false });
  });
});
