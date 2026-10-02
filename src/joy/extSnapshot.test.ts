import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Course, Item } from '../domain/types';
import { haloDoneLine, joySnap } from './extSnapshot';

const course = (id: string, code: string) => ({ id, code, name: code }) as Course;
const item = (id: string, courseId: string, points: number, extra: Partial<Item> = {}) => ({ id, courseId, points, source: 'halo', haloId: `h-${id}`, status: 'todo', score: null, halo: null, ...extra }) as Item;

describe('the snapshot the extension celebrates from', () => {
  const courses = [course('c1', 'CHM-113L'), course('c2', 'ENG-105')];
  const items = [item('a', 'c1', 50), item('b', 'c1', 100, { status: 'done' }), item('c', 'c1', 50), item('d', 'c2', 0), item('e', 'c1', 20, { source: 'manual' })];
  const snap = joySnap(courses, items, true);

  it('carries each Halo assignment with points, its class, and whether it already counts', () => {
    expect(snap.items).toEqual({ 'h-a': [50, '0', 0], 'h-b': [100, '0', 1], 'h-c': [50, '0', 0] });
    expect(snap.classes).toEqual({ '0': ['CHM-113L', 100, 200] });
  });
  it('says the class after this submission, from the real Halo total', () => {
    expect(haloDoneLine(snap, 'h-a')).toBe('+50 pts · CHM-113L now 75% done');
    // Already counted (checked off before it was turned in): the class does not move twice.
    expect(haloDoneLine(snap, 'h-b')).toBe('+100 pts · CHM-113L now 50% done');
    expect(haloDoneLine(snap, 'nope')).toBeNull();
    expect(haloDoneLine(snap, null)).toBeNull();
  });
  it('holds nothing personal beyond codes and points', () => {
    expect(JSON.stringify(snap)).not.toMatch(/ENG-105|title|name/);
  });
  it('matches the extension line for line', () => {
    const halo = readFileSync('extension/content-halo.js', 'utf8');
    expect(halo).toContain('now ${pct}% done');
    expect(halo).toContain('Math.floor(((c[1] + (done ? 0 : points)) / c[2]) * 100)');
  });
});
