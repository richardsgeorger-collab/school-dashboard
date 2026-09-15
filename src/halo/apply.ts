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
  /** Posted scores to write, marking the item done if it is not yet. */
  scores: { id: string; score: number; at: string }[];
  /** Halo's own submission state per item; metadata, never a planner change. */
  facts: { id: string; status: string | null; submittedAt: string | null }[];
}

export interface Selection {
  added: Set<string>;
  changed: Set<string>;
  missing: Set<string>;
  submitted: Set<string>;
  graded: Set<string>;
}

export function defaultSelection(diff: HaloDiff): Selection {
  return {
    added: new Set(diff.added.map((e) => e.key)),
    changed: new Set(diff.changed.map((e) => e.key)),
    missing: new Set(diff.missing.filter((e) => e.suggestRemove).map((e) => e.key)),
    submitted: new Set(diff.submitted.map((e) => e.key)),
    graded: new Set(diff.graded.map((e) => e.key)),
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
  const scores = diff.graded.filter((e) => sel.graded.has(e.key) && (!e.isNew || ids.has(e.id))).map((e) => ({ id: e.id, score: e.score, at: e.at }));
  return { courses: [...diff.courses.created, ...diff.courses.linked], upserts, deletes, complete, scores, facts: diff.facts };
}

/** Changes the user will notice: new, updated, removed, marked done. Links and blank fill-ins are not counted. */
export function countVisible(sel: Selection): number {
  return sel.added.size + sel.changed.size + sel.missing.size + sel.submitted.size + sel.graded.size;
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
  for (const s of plan.scores ?? []) {
    const item = byId.get(s.id);
    if (!item) continue;
    const done = item.status === 'done' ? item : completeItem(item, startByOf(s.id) ?? dateOf(s.at, tz), s.at, tz);
    byId.set(s.id, { ...withScore(done, s.score), scoreSource: 'halo', updatedAt: now });
  }
  for (const f of plan.facts ?? []) {
    const item = byId.get(f.id);
    if (!item) continue;
    byId.set(f.id, { ...item, halo: { status: f.status, submittedAt: f.submittedAt, checkedAt: now }, updatedAt: now });
  }
  const touched = new Set([...plan.upserts.map((u) => u.id), ...plan.complete.map((c) => c.id), ...(plan.scores ?? []).map((s) => s.id), ...(plan.facts ?? []).map((f) => f.id)].filter((id) => byId.has(id)));
  if (touched.size) ops.push({ kind: 'items', ids: [...touched] });
  for (const id of plan.deletes) ops.push({ kind: 'deleteItem', id, deletedAt: now });
  return { data: { ...data, courses, items: [...byId.values()] }, ops };
}
