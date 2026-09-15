import { describe, expect, it } from 'vitest';
import { mkItem, TZ } from '../halo/fixtures';
import { effectivePoints, gatedBy, gatingLine, unlocks } from './gating';
import { isBigWork, pickReason } from './now';
import type { Schedule } from './schedule';

const claim = mkItem({ id: 'claim', courseId: 'c1', title: 'Claim your Chemistry Connections topic', label: 'Chem Topic Claim', points: 0, estimatedMinutes: 10, dueAt: '2026-09-20T23:59:00-07:00', blocks: ['pres', 'essay'] });
const pres = mkItem({ id: 'pres', courseId: 'c1', title: 'Chemistry Connections Presentation', label: 'Chem Presentation', points: 50, dueAt: '2026-09-27T23:59:00-07:00' });
const essay = mkItem({ id: 'essay', courseId: 'c1', title: 'Chemistry Connections Essay', label: 'Chem Essay', points: 100, dueAt: '2026-10-09T23:59:00-07:00' });
const items = [claim, pres, essay];

describe('a small task that gates bigger work', () => {
  it('carries the points of what it unlocks, soonest first, and drops what is done', () => {
    expect(unlocks(claim, items).map((i) => i.id)).toEqual(['pres', 'essay']);
    expect(effectivePoints(claim, items)).toBe(150);
    expect(effectivePoints(pres, items)).toBe(50);
    expect(isBigWork(claim, items)).toBe(true);
    expect(isBigWork(claim)).toBe(false);
    expect(gatingLine(claim, items, TZ)).toBe('Unlocks Chem Presentation (Sep 27) and Chem Essay (Oct 9).');
    expect(gatingLine(pres, items, TZ)).toBeNull();
    expect(gatedBy(essay, items).map((i) => i.id)).toEqual(['claim']);
    const done = [{ ...claim, blocks: ['pres', 'essay'] }, { ...pres, status: 'done' as const }, essay];
    expect(unlocks(done[0], done).map((i) => i.id)).toEqual(['essay']);
    expect(effectivePoints(done[0], done)).toBe(100);
  });
  it('leads the hero reason with what it unlocks', () => {
    const sched = { byItem: { claim: { startBy: '2026-09-19', deadlineDay: '2026-09-20' } }, days: {} } as unknown as Schedule;
    expect(pickReason(claim, items, sched, '2026-09-14', '2026-09-14T12:00:00-07:00', TZ, {})).toBe("Picked because it's small and it gates bigger work. Unlocks Chem Presentation (Sep 27) and Chem Essay (Oct 9).");
  });
});
