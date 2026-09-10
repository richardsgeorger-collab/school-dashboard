import { describe, expect, it } from 'vitest';
import { buildContext, CHAT_TOOLS, dispatchTool } from './context';
import { computeSchedule } from '../domain/schedule';
import { DEFAULT_FLAGS, DEFAULT_SETTINGS, type Course, type Item } from '../domain/types';

const TODAY = '2026-09-09';
const NOW = '2026-09-09T12:00:00-07:00';
let n = 0;
function item(over: Partial<Item>): Item {
  n += 1;
  return {
    id: over.id ?? `item-${n}`,
    courseId: 'chem',
    title: `Item ${n}`,
    label: `Chem HW ${n}`,
    labelOverridden: false,
    type: 'homework',
    points: 10,
    opensAt: null,
    dueAt: '2026-09-13T23:59:00-07:00',
    estimatedMinutes: 120,
    estimateOverridden: false,
    startByOverride: null,
    status: 'todo',
    completedAt: null,
    score: null,
    notes: '',
    topic: null,
    flags: { ...DEFAULT_FLAGS },
    source: 'parsed',
    award: null,
    updatedAt: NOW,
    ...over,
  };
}
const chem: Course = {
  id: 'chem',
  code: 'CHM-113',
  name: 'General Chemistry I',
  color: '#000',
  credits: 3,
  instructors: [],
  meetings: [{ day: 3, start: '07:00', end: '08:15' }],
  online: false,
  termStart: '2026-09-08',
  termEnd: '2026-12-20',
  updatedAt: NOW,
};

describe('buildContext', () => {
  it('lists open items with both deadlines, capacity, notes and class times; omits done items', () => {
    const open = item({ id: 'a' });
    const done = item({ id: 'b', status: 'done', completedAt: NOW });
    const items = [open, done];
    const derived = { a: { deadlineAt: '2026-09-12T23:59:00-07:00', reasons: ['Sunday due → Saturday'] } };
    const schedule = computeSchedule(items.map((i) => (derived[i.id as 'a'] ? { ...i, deadlineAt: derived.a.deadlineAt } : i)), DEFAULT_SETTINGS, TODAY, { start: '2026-09-08', end: '2026-12-20' }, NOW);
    const ctx = JSON.parse(buildContext({ items, courses: [chem], settings: DEFAULT_SETTINGS, schedule, derived, nudges: [], today: TODAY, notes: ['slammed Thursday'] }));
    expect(ctx.today).toBe(TODAY);
    expect(ctx.capacity).toEqual({ weekdayHours: 3, weekendHours: 5 });
    expect(ctx.notes).toEqual(['slammed Thursday']);
    expect(ctx.classes).toEqual([{ code: 'CHM-113', name: 'General Chemistry I', meets: 'Wed 7:00 AM–8:15 AM' }]);
    expect(ctx.done).toBe(1);
    expect(ctx.open).toHaveLength(1);
    expect(ctx.open[0]).toMatchObject({ id: 'a', label: open.label, class: 'CHM-113', due: '2026-09-13', realDeadline: '2026-09-12', startBy: '2026-09-11', minutes: 120, points: 10, status: 'todo' });
  });

  it('caps the open list at 80 items nearest their deadline', () => {
    const items = Array.from({ length: 100 }, (_, k) => item({ id: `k${k}`, dueAt: `2026-${String(9 + Math.floor(k / 28)).padStart(2, '0')}-${String((k % 28) + 1).padStart(2, '0')}T23:59:00-07:00` }));
    const schedule = computeSchedule(items, DEFAULT_SETTINGS, TODAY, { start: '2026-09-08', end: '2026-12-20' }, NOW);
    const ctx = JSON.parse(buildContext({ items, courses: [chem], settings: DEFAULT_SETTINGS, schedule, derived: {}, nudges: [], today: TODAY, notes: [] }));
    expect(ctx.open).toHaveLength(80);
    expect(ctx.openTotal).toBe(100);
  });
});

describe('tools', () => {
  it('declares remember_note and update_item with strict schemas', () => {
    expect(CHAT_TOOLS.map((t) => t.name)).toEqual(['remember_note', 'update_item']);
    for (const t of CHAT_TOOLS) expect(t.input_schema.additionalProperties).toBe(false);
  });

  it('dispatches remember_note and update_item to the app', () => {
    const notes: string[] = [];
    const updates: { id: string; patch: Record<string, unknown> }[] = [];
    const items = [item({ id: 'a' })];
    const api = {
      items,
      addNote: (t: string) => notes.push(t),
      updateItem: (id: string, patch: Record<string, unknown>) => updates.push({ id, patch }),
    };
    expect(dispatchTool('remember_note', { note: 'Chem reading half done' }, api)).toBe('Noted.');
    expect(notes).toEqual(['Chem reading half done']);
    expect(dispatchTool('update_item', { item_id: 'a', status: 'in_progress', estimate_minutes: 60 }, api)).toBe(`Updated ${items[0].label}: status in_progress, estimate 60 min.`);
    expect(updates).toEqual([{ id: 'a', patch: { status: 'in_progress', estimatedMinutes: 60 } }]);
    expect(dispatchTool('update_item', { item_id: 'zzz' }, api)).toBe('No item with id zzz.');
    expect(dispatchTool('nope', {}, api)).toBe('Unknown tool nope.');
  });
});
