import { describe, expect, it } from 'vitest';
import { mkItem } from './fixtures';
import { addPeeked, lockedLine, peekFromTool, PEEK_TOOL, PEEKED_CAP } from './peek';
import { nudgeDue } from '../views/ExtensionNudge';

// Free (George, 2026-10-25, Loop 268): which assignment an announcement changed and how, never the details.
const items = [mkItem({ id: 'lab3', courseId: 'c', title: 'Lab 3' }), mkItem({ id: 'quiz2', courseId: 'c', title: 'Quiz 2' })];

describe('the kinds-only check', () => {
  it('keeps listed assignments and the two kinds only, one entry per assignment', () => {
    const raw = { changes: [{ item_id: 'lab3', kind: 'due_date' }, { item_id: 'lab3', kind: 'extra_step' }, { item_id: 'quiz2', kind: 'points' }, { item_id: 'made-up', kind: 'due_date' }, { item_id: 'quiz2', kind: 'extra_step', detail: 'Bring goggles' }] };
    expect(peekFromTool(raw, items)).toEqual([
      { itemId: 'lab3', kinds: ['due_date', 'extra_step'] },
      { itemId: 'quiz2', kinds: ['extra_step'] },
    ]);
    expect(peekFromTool(null, items)).toEqual([]);
  });
  it('asks the model for the kind alone: the tool has no field for a detail', () => {
    const props = (PEEK_TOOL.input_schema as { properties: { changes: { items: { properties: Record<string, unknown> } } } }).properties.changes.items.properties;
    expect(Object.keys(props).sort()).toEqual(['item_id', 'kind']);
  });
  it('says the kind, the same words everywhere', () => {
    expect(lockedLine(['due_date'])).toBe('An announcement changed the due date');
    expect(lockedLine(['extra_step'])).toBe('An announcement added a step');
    expect(lockedLine(['due_date', 'extra_step'])).toBe('An announcement changed the due date and added a step');
  });
  it('remembers what it looked at, newest last, capped', () => {
    expect(addPeeked(['a', 'b'], ['b', 'c'])).toEqual(['a', 'b', 'c']);
    expect(addPeeked(Array.from({ length: PEEKED_CAP }, (_, i) => `p${i}`), ['new'])).toHaveLength(PEEKED_CAP);
  });
});

describe("Now's extension card during the trial", () => {
  it('twice at most, two days apart, and all day once it showed', () => {
    expect(nudgeDue([], '2026-10-20')).toBe(true);
    expect(nudgeDue(['2026-10-20'], '2026-10-20')).toBe(true);
    expect(nudgeDue(['2026-10-20'], '2026-10-21')).toBe(false);
    expect(nudgeDue(['2026-10-20'], '2026-10-22')).toBe(true);
    expect(nudgeDue(['2026-10-20', '2026-10-22'], '2026-10-25')).toBe(false);
  });
});
