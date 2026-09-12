import type { AppData, BankedAward, Item, Settings, TimingEntry } from './types';

/**
 * Per-class housekeeping that must not cost the student anything they earned:
 * awards move to a bank before their items go, and logged minutes live in a ledger.
 */

/** Ledger entries for items that carry a real time but are not in the ledger yet. */
export function ledgerWith(items: Item[], ledger: TimingEntry[] = [], at = new Date().toISOString()): TimingEntry[] {
  const have = new Set(ledger.map((t) => t.itemId));
  const add = items.filter((i) => i.actualMinutes && i.actualMinutes > 0 && !have.has(i.id)).map((i) => ({ itemId: i.id, courseId: i.courseId, type: i.type, minutes: i.actualMinutes!, at }));
  return add.length ? [...ledger, ...add] : ledger;
}

/** Record one timing: on the item and in the ledger (replacing an older entry for the same item). */
export function logTiming(ledger: TimingEntry[] = [], item: Item, minutes: number, at = new Date().toISOString()): TimingEntry[] {
  return [...ledger.filter((t) => t.itemId !== item.id), { itemId: item.id, courseId: item.courseId, type: item.type, minutes, at }];
}

/** Bank the awards of done items about to be deleted. */
export function bankAwards(items: Item[], bank: BankedAward[] = []): BankedAward[] {
  const have = new Set(bank.map((b) => b.itemId));
  const add = items
    .filter((i) => i.status === 'done' && i.award && i.completedAt && !have.has(i.id))
    .map((i) => ({ itemId: i.id, courseId: i.courseId, label: i.label, dueAt: i.dueAt, points: i.points, completedAt: i.completedAt!, award: i.award! }));
  return add.length ? [...bank, ...add] : bank;
}

/** Banked awards as the shape the points engine reads, so XP, streaks, and badges include them. */
export function bankedAsItems(bank: BankedAward[] = [], liveIds: Set<string>): Item[] {
  return bank
    .filter((b) => !liveIds.has(b.itemId))
    .map((b) => ({
      id: b.itemId,
      courseId: b.courseId,
      title: b.label,
      label: b.label,
      labelOverridden: false,
      type: 'other' as const,
      points: b.points,
      opensAt: null,
      dueAt: b.dueAt,
      estimatedMinutes: 0,
      estimateOverridden: true,
      startByOverride: null,
      status: 'done' as const,
      completedAt: b.completedAt,
      score: null,
      notes: '',
      topic: null,
      flags: { inClass: false, group: false, lopesWrite: false, timed: false, practice: false },
      source: 'manual' as const,
      award: b.award,
      updatedAt: b.completedAt,
    }));
}

export interface ResetPlan {
  deletedIds: string[];
  items: Item[];
  settings: Settings;
}

/** Remove every item of one class and nothing else, keeping its earned awards and logged minutes. */
export function resetCourseItems(data: AppData, courseId: string, at = new Date().toISOString()): ResetPlan {
  const mine = data.items.filter((i) => i.courseId === courseId);
  return {
    deletedIds: mine.map((i) => i.id),
    items: data.items.filter((i) => i.courseId !== courseId),
    settings: { ...data.settings, timings: ledgerWith(mine, data.settings.timings, at), bankedAwards: bankAwards(mine, data.settings.bankedAwards), updatedAt: at },
  };
}

/** An online class has no meetings and nothing "in class". */
export function applyOnline(items: Item[], courseId: string, online: boolean): { items: Item[]; touched: string[] } {
  if (!online) return { items, touched: [] };
  const touched: string[] = [];
  const next = items.map((i) => {
    if (i.courseId !== courseId || !i.flags.inClass) return i;
    touched.push(i.id);
    return { ...i, flags: { ...i.flags, inClass: false } };
  });
  return { items: next, touched };
}
