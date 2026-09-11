import { dateOf } from '../domain/dates';
import { completeItem, withScore } from '../domain/points';
import type { AppData, Course, DateStr, Item } from '../domain/types';
import type { PendingOp } from '../storage/localRepo';
import type { HaloDiff } from './diff';

export interface HaloPlan {
  courses: Course[];
  upserts: Item[];
  deletes: string[];
  complete: { id: string; at: string; score: number | null }[];
}

export interface Selection {
  added: Set<string>;
  changed: Set<string>;
  missing: Set<string>;
  submitted: Set<string>;
}

export function defaultSelection(diff: HaloDiff): Selection {
  return {
    added: new Set(diff.added.map((e) => e.key)),
    changed: new Set(diff.changed.map((e) => e.key)),
    missing: new Set(diff.missing.filter((e) => e.suggestRemove).map((e) => e.key)),
    submitted: new Set(diff.submitted.map((e) => e.key)),
  };
}

export function planFromDiff(diff: HaloDiff, sel: Selection): HaloPlan {
  const upserts: Item[] = [];
  for (const e of diff.added) if (sel.added.has(e.key)) upserts.push(e.item);
  for (const e of diff.changed) if (sel.changed.has(e.key)) upserts.push(e.next);
  for (const e of diff.unchanged) upserts.push(e.next);
  const ids = new Set(upserts.map((i) => i.id));
  const complete = diff.submitted
    .filter((e) => sel.submitted.has(e.key) && (!e.isNew || ids.has(e.id)))
    .map((e) => ({ id: e.id, at: e.at, score: e.score }));
  const deletes = diff.missing.filter((e) => sel.missing.has(e.key)).map((e) => e.key);
  return { courses: [...diff.courses.created, ...diff.courses.linked], upserts, deletes, complete };
}

/** Changes the user will notice: new, updated, removed, marked done. Links and blank fill-ins are not counted. */
export function countVisible(sel: Selection): number {
  return sel.added.size + sel.changed.size + sel.missing.size + sel.submitted.size;
}

export function applyHaloPlan(
  data: AppData,
  plan: HaloPlan,
  startByOf: (id: string) => DateStr | undefined,
  now: string,
  tz: string,
): { data: AppData; ops: PendingOp[] } {
  const ops: PendingOp[] = [];
  const courses = [...data.courses];
  for (const c of plan.courses) {
    const stamped = { ...c, updatedAt: now };
    const idx = courses.findIndex((x) => x.id === c.id);
    if (idx >= 0) courses[idx] = stamped;
    else courses.push(stamped);
  }
  if (plan.courses.length) ops.push({ kind: 'courses', ids: plan.courses.map((c) => c.id) });

  const deleted = new Set(plan.deletes);
  const byId = new Map(data.items.filter((i) => !deleted.has(i.id)).map((i) => [i.id, i]));
  for (const u of plan.upserts) byId.set(u.id, { ...u, updatedAt: now });
  for (const c of plan.complete) {
    const item = byId.get(c.id);
    if (!item || item.status === 'done') continue;
    let done = completeItem(item, startByOf(c.id) ?? dateOf(c.at, tz), c.at, tz);
    if (c.score != null) done = withScore(done, c.score);
    byId.set(c.id, { ...done, updatedAt: now });
  }
  const touched = new Set([...plan.upserts.map((u) => u.id), ...plan.complete.map((c) => c.id)].filter((id) => byId.has(id)));
  if (touched.size) ops.push({ kind: 'items', ids: [...touched] });
  for (const id of plan.deletes) ops.push({ kind: 'deleteItem', id, deletedAt: now });
  return { data: { ...data, courses, items: [...byId.values()] }, ops };
}
