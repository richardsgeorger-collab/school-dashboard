import { describe, expect, it } from 'vitest';
import { itemTone, toneLabel } from './status';

const NOW = '2026-09-25T20:00:00-07:00';
const TZ = 'America/Phoenix';
describe('one meaning per colour', () => {
  it('red only when late', () => {
    expect(itemTone({ dueAt: '2026-09-25T19:00:00-07:00', status: 'todo', haloLate: null }, NOW)).toBe('late');
    expect(itemTone({ dueAt: '2026-09-25T19:00:00-07:00', status: 'done', haloLate: null }, NOW)).toBeNull();
    expect(itemTone({ dueAt: '2026-10-25T19:00:00-07:00', status: 'todo', haloLate: 'Halo says late' }, NOW)).toBe('late');
  });
  it('amber only within a day and not started', () => {
    expect(itemTone({ dueAt: '2026-09-26T08:00:00-07:00', status: 'todo', haloLate: null }, NOW)).toBe('soon');
    expect(itemTone({ dueAt: '2026-09-26T08:00:00-07:00', status: 'in_progress', haloLate: null }, NOW)).toBeNull();
    expect(itemTone({ dueAt: '2026-09-27T08:00:00-07:00', status: 'todo', haloLate: null }, NOW)).toBeNull();
  });
  it('labels', () => {
    expect(toneLabel('soon', { dueAt: '2026-09-25T23:59:00-07:00' }, '2026-09-25', TZ)).toBe('Due today');
    expect(toneLabel('soon', { dueAt: '2026-09-26T08:00:00-07:00' }, '2026-09-25', TZ)).toBe('Due tomorrow');
    expect(toneLabel(null, { dueAt: '2026-09-26T08:00:00-07:00' }, '2026-09-25', TZ)).toBeNull();
  });
});
