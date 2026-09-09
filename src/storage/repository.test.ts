import { describe, expect, it } from 'vitest';
import { mergeData } from './repository';
import { DEFAULT_FLAGS, DEFAULT_SETTINGS, type AppData, type Course, type Item } from '../domain/types';

const course = (id: string, updatedAt: string, name = 'x'): Course => ({
  id,
  code: 'C',
  name,
  color: '#000',
  credits: 1,
  instructors: [],
  meetings: [],
  online: false,
  termStart: '2026-09-08',
  termEnd: '2026-12-20',
  updatedAt,
});
const item = (id: string, updatedAt: string, title = 'x'): Item => ({
  id,
  courseId: 'c',
  title,
  type: 'homework',
  points: 1,
  opensAt: null,
  dueAt: '2026-09-20T23:59:00-07:00',
  estimatedMinutes: 60,
  estimateOverridden: false,
  startByOverride: null,
  status: 'todo',
  completedAt: null,
  score: null,
  notes: '',
  topic: null,
  flags: { ...DEFAULT_FLAGS },
  source: 'manual',
  updatedAt,
});

describe('mergeData', () => {
  it('newest wins per id, and each side learns what the other has', () => {
    const local: AppData = {
      courses: [course('c1', '2026-09-09T10:00:00Z', 'local-newer'), course('c2', '2026-09-09T08:00:00Z', 'local-older')],
      items: [item('i1', '2026-09-09T10:00:00Z', 'local-only')],
      settings: { ...DEFAULT_SETTINGS, updatedAt: '2026-09-09T10:00:00Z', weekdayMinutes: 200 },
    };
    const remote: Partial<AppData> = {
      courses: [course('c1', '2026-09-09T09:00:00Z', 'remote-older'), course('c2', '2026-09-09T09:00:00Z', 'remote-newer')],
      items: [item('i2', '2026-09-09T09:00:00Z', 'remote-only')],
      settings: { ...DEFAULT_SETTINGS, updatedAt: '2026-09-09T11:00:00Z', weekdayMinutes: 240 },
    };
    const r = mergeData(local, remote);
    expect(r.merged.courses.map((c) => c.name).sort()).toEqual(['local-newer', 'remote-newer']);
    expect(r.merged.items.map((i) => i.title).sort()).toEqual(['local-only', 'remote-only']);
    expect(r.merged.settings.weekdayMinutes).toBe(240);
    expect(r.pushCourses.map((c) => c.id)).toEqual(['c1']);
    expect(r.pushItems.map((i) => i.id)).toEqual(['i1']);
    expect(r.pushSettings).toBe(false);
  });

  it('pushes local settings when they are newer', () => {
    const local: AppData = { courses: [], items: [], settings: { ...DEFAULT_SETTINGS, updatedAt: '2026-09-09T12:00:00Z' } };
    const r = mergeData(local, { settings: { ...DEFAULT_SETTINGS, updatedAt: '2026-09-09T11:00:00Z' } });
    expect(r.pushSettings).toBe(true);
    expect(r.merged.settings.updatedAt).toBe('2026-09-09T12:00:00Z');
  });

  it('treats a missing remote as everything-local-is-new', () => {
    const local: AppData = { courses: [course('c1', '2026-09-09T10:00:00Z')], items: [item('i1', '2026-09-09T10:00:00Z')], settings: DEFAULT_SETTINGS };
    const r = mergeData(local, {});
    expect(r.pushCourses).toHaveLength(1);
    expect(r.pushItems).toHaveLength(1);
    expect(r.pushSettings).toBe(true);
  });

  it('respects tombstones: a remote deletion newer than the local row removes it', () => {
    const local: AppData = { courses: [], items: [item('i1', '2026-09-09T10:00:00Z')], settings: DEFAULT_SETTINGS };
    const r = mergeData(local, { items: [], deletedItemIds: { i1: '2026-09-09T11:00:00Z' } });
    expect(r.merged.items).toHaveLength(0);
    expect(r.pushItems).toHaveLength(0);
  });
});
