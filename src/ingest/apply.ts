import { makeIso } from '../domain/dates';
import { estimateMinutes } from '../domain/estimate';
import { stableId } from '../domain/ids';
import { shortLabel } from '../domain/labels';
import { DEFAULT_FLAGS, type Course, type Item, type ItemPlan, type PlanField } from '../domain/types';
import { makeSteps } from '../work/steps';
import type { PlanDiff } from './diff';
import type { ClassPlan, DiscoveredItem } from './plan';

/**
 * Writing an approved plan. Pure: returns the new item list. Nothing the student owns is touched: their edits, notes,
 * completion state, logged time, overrides. What they turned down is remembered so it is never suggested again.
 */
export interface PlanSelection {
  startBy: Set<string>;
  minutes: Set<string>;
  steps: Set<string>;
  /** "from|to" keys. */
  gates: Set<string>;
  flags: Set<string>;
  /** Indexes into diff.discovered. */
  discovered: Set<number>;
}

export const gateKey = (from: string, to: string) => `${from}|${to}`;

/** Everything checked, except found-outside-Halo items the model was unsure of. */
export function defaultPlanSelection(diff: PlanDiff): PlanSelection {
  return {
    startBy: new Set(diff.startBy.map((c) => c.itemId)),
    minutes: new Set(diff.minutes.map((c) => c.itemId)),
    steps: new Set(diff.steps.map((c) => c.itemId)),
    gates: new Set(diff.gates.map((g) => gateKey(g.from, g.to))),
    flags: new Set(diff.flags.map((f) => f.itemId)),
    discovered: new Set(diff.discovered.map((d, i) => (d.confidence === 'low' ? -1 : i)).filter((i) => i >= 0)),
  };
}

export const countSelected = (sel: PlanSelection): number => sel.startBy.size + sel.minutes.size + sel.steps.size + sel.gates.size + sel.flags.size + sel.discovered.size;

/** A found-outside-Halo item as a planner row, with where it came from written in. Same id every run. */
export function discoveredToItem(d: DiscoveredItem, course: Course, plan: ClassPlan, tz: string, now: string): Item | null {
  if (!d.due) return null;
  const title = d.title;
  const points = d.points ?? 0;
  return {
    id: stableId(`ai|${course.id}|${title.toLowerCase()}`),
    courseId: course.id,
    title,
    label: shortLabel({ title, courseCode: course.code, type: d.type }),
    labelOverridden: false,
    type: d.type,
    points,
    opensAt: null,
    dueAt: makeIso(d.due, d.dueTime ?? '23:59', tz),
    estimatedMinutes: estimateMinutes({ title, type: d.type, points, courseCode: course.code }),
    estimateOverridden: false,
    startByOverride: null,
    status: 'todo',
    completedAt: null,
    score: null,
    notes: `Found in the ${d.source || 'syllabus'}, not in Halo: "${d.quote}"`,
    topic: null,
    flags: { ...DEFAULT_FLAGS },
    source: 'parsed',
    award: null,
    plan: { asks: d.why, startBy: null, minutes: null, milestones: [], prerequisites: [], flags: { lopesWrite: false, timed: false, group: false, inPerson: false }, topics: [], feeds: null, sources: [], citations: [`${d.source || 'syllabus'}: "${d.quote}"`], model: plan.model, at: plan.at, inputHash: plan.inputHash, found: true },
    updatedAt: now,
  };
}

export interface Applied {
  items: Item[];
  added: Item[];
  /** Ids whose fields changed, for the undo batch and the remote push. */
  touched: string[];
  declined: number;
}

export function applyPlan(items: Item[], course: Course, plan: ClassPlan, diff: PlanDiff, sel: PlanSelection, opts: { now: string; tz: string }): Applied {
  const byId = new Map(items.map((i) => [i.id, i]));
  const touched = new Set<string>();
  let declined = 0;
  const decline = (item: Item, field: PlanField) => {
    const list = item.planDeclined ?? [];
    if (list.includes(field)) return item;
    declined++;
    return { ...item, planDeclined: [...list, field] };
  };

  for (const p of Object.values(plan.items)) {
    let item = byId.get(p.itemId);
    if (!item) continue;
    const before = item;
    const attached: ItemPlan = { asks: p.asks, startBy: p.startBy, minutes: p.minutes, milestones: p.milestones, prerequisites: p.prerequisites, flags: p.flags, topics: p.topics, feeds: p.feeds, sources: p.sources, citations: p.citations, model: p.model, at: p.at, inputHash: p.inputHash };
    item = { ...item, plan: attached, topic: item.topic ?? p.topics[0] ?? null };

    const start = diff.startBy.find((c) => c.itemId === item!.id);
    if (start) item = sel.startBy.has(item.id) ? { ...item, startByPlan: start.to, plan: { ...attached, startBy: { value: start.to, why: start.why, confidence: start.confidence } } } : decline(item, 'startBy');

    const minutes = diff.minutes.find((c) => c.itemId === item!.id);
    if (minutes) item = sel.minutes.has(item.id) ? { ...item, estimatedMinutes: minutes.to } : decline(item, 'minutes');

    const steps = diff.steps.find((c) => c.itemId === item!.id);
    if (steps) item = sel.steps.has(item.id) ? { ...item, steps: makeSteps(steps.steps) } : decline(item, 'steps');

    const flags = diff.flags.find((c) => c.itemId === item!.id);
    if (flags && sel.flags.has(item.id)) {
      const f = { ...item.flags };
      for (const k of flags.flags) f[k] = true;
      item = { ...item, flags: f };
    }

    if (item !== before) {
      byId.set(item.id, { ...item, updatedAt: opts.now });
      touched.add(item.id);
    }
  }

  for (const g of diff.gates) {
    if (!sel.gates.has(gateKey(g.from, g.to))) continue;
    const gate = byId.get(g.from);
    if (!gate || !byId.has(g.to) || gate.blocks?.includes(g.to)) continue;
    byId.set(gate.id, { ...gate, blocks: [...(gate.blocks ?? []), g.to], updatedAt: opts.now });
    touched.add(gate.id);
  }

  const added: Item[] = [];
  diff.discovered.forEach((d, i) => {
    if (!sel.discovered.has(i)) return;
    const fresh = discoveredToItem(d, course, plan, opts.tz, opts.now);
    if (!fresh || byId.has(fresh.id)) return;
    byId.set(fresh.id, fresh);
    added.push(fresh);
    touched.add(fresh.id);
  });

  return { items: [...byId.values()], added, touched: [...touched], declined };
}
