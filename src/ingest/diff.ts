import type { Confidence, Course, DateStr, Item, ItemPlan } from '../domain/types';
import { BIG_MINUTES, BIG_POINTS } from '../work/steps';
import type { ClassPlan, DiscoveredItem, PlannedItem } from './plan';
import type { TermResult } from './term';

/**
 * A class plan held against the planner: what would change, what is only attached, and what was left alone because
 * the student owns it. Pure. The review screen shows this; apply.ts writes it.
 */
export interface PlanChange<T> {
  itemId: string;
  label: string;
  title: string;
  from: T | null;
  to: T;
  why: string;
  confidence: Confidence;
}

export interface StepChange {
  itemId: string;
  label: string;
  steps: string[];
  /** The steps it has now, when any. */
  from: string[];
}

export interface GateChange {
  /** The prerequisite. */
  from: string;
  fromLabel: string;
  /** What it gates. */
  to: string;
  toLabel: string;
  why: string;
  source: string;
}

export interface FlagChange {
  itemId: string;
  label: string;
  flags: ('lopesWrite' | 'timed' | 'group' | 'inClass')[];
}

export interface Skipped {
  itemId: string;
  label: string;
  what: 'startBy' | 'minutes' | 'steps';
  why: 'you set it' | 'declined before' | 'steps in progress' | 'done';
}

export interface PlanDiff {
  courseId: string;
  startBy: PlanChange<DateStr>[];
  minutes: PlanChange<number>[];
  steps: StepChange[];
  gates: GateChange[];
  flags: FlagChange[];
  discovered: DiscoveredItem[];
  /** Titles the model never read. */
  missing: string[];
  /** Items that only gain what-it-asks, topics, and sources: attached without a word. */
  quiet: number;
  skipped: Skipped[];
  /** The plan's own read of the whole class, when it said something. */
  notes: string;
  total: number;
}

const MINUTES_NOISE = 15;

/** Work with parts carries steps: papers, projects, labs, exams, and anything big. */
export const carriesSteps = (item: Item, minutes: number): boolean => ['paper', 'project', 'lab', 'exam'].includes(item.type) || item.points >= BIG_POINTS || minutes >= BIG_MINUTES;

const stepsTouched = (item: Item): boolean => !!item.steps?.some((s) => s.done);

/** The start-by the plan proposes for one item: the term pass wins when it spoke, its reason on top of the class reason. */
export function proposedStart(p: PlannedItem, term: TermResult | null): ItemPlan['startBy'] {
  const t = term?.starts[p.itemId];
  if (t) return { value: t.value, why: p.startBy && p.startBy.value !== t.value ? `${t.why} (class pass said ${p.startBy.value}: ${p.startBy.why})` : t.why || p.startBy?.why || '', confidence: t.confidence };
  return p.startBy;
}

export function diffPlan(course: Course, items: Item[], plan: ClassPlan, term: TermResult | null, startByOf: (id: string) => DateStr | undefined): PlanDiff {
  const byId = new Map(items.map((i) => [i.id, i]));
  const diff: PlanDiff = { courseId: course.id, startBy: [], minutes: [], steps: [], gates: [], flags: [], discovered: plan.discovered.filter((d) => d.due), missing: [], quiet: 0, skipped: [], notes: plan.notes, total: 0 };
  const titleOf = (id: string) => byId.get(id)?.label ?? id;
  for (const p of Object.values(plan.items)) {
    const item = byId.get(p.itemId);
    if (!item) continue;
    let changed = false;
    const declined = new Set(item.planDeclined ?? []);
    const done = item.status === 'done';

    const start = proposedStart(p, term);
    if (start) {
      const current = item.startByPlan ?? startByOf(item.id) ?? null;
      if (done) diff.skipped.push({ itemId: item.id, label: item.label, what: 'startBy', why: 'done' });
      else if (item.startByOverride) diff.skipped.push({ itemId: item.id, label: item.label, what: 'startBy', why: 'you set it' });
      else if (declined.has('startBy')) diff.skipped.push({ itemId: item.id, label: item.label, what: 'startBy', why: 'declined before' });
      else if (start.value !== current) {
        diff.startBy.push({ itemId: item.id, label: item.label, title: item.title, from: current, to: start.value, why: start.why, confidence: start.confidence });
        changed = true;
      }
    }

    const minutes = p.minutes;
    if (minutes) {
      if (done) diff.skipped.push({ itemId: item.id, label: item.label, what: 'minutes', why: 'done' });
      else if (item.estimateOverridden) diff.skipped.push({ itemId: item.id, label: item.label, what: 'minutes', why: 'you set it' });
      else if (declined.has('minutes')) diff.skipped.push({ itemId: item.id, label: item.label, what: 'minutes', why: 'declined before' });
      else if (Math.abs(minutes.value - item.estimatedMinutes) >= MINUTES_NOISE) {
        diff.minutes.push({ itemId: item.id, label: item.label, title: item.title, from: item.estimatedMinutes, to: minutes.value, why: minutes.why, confidence: minutes.confidence });
        changed = true;
      }
    }

    if (p.milestones.length >= 2 && carriesSteps(item, minutes?.value ?? item.estimatedMinutes) && !done) {
      const current = (item.steps ?? []).map((s) => s.label);
      if (stepsTouched(item)) diff.skipped.push({ itemId: item.id, label: item.label, what: 'steps', why: 'steps in progress' });
      else if (declined.has('steps')) diff.skipped.push({ itemId: item.id, label: item.label, what: 'steps', why: 'declined before' });
      else if (current.join('|') !== p.milestones.join('|')) {
        diff.steps.push({ itemId: item.id, label: item.label, steps: p.milestones, from: current });
        changed = true;
      }
    }

    for (const pre of p.prerequisites) {
      if (!pre.itemId) continue;
      const gate = byId.get(pre.itemId);
      if (!gate || gate.blocks?.includes(item.id) || diff.gates.some((g) => g.from === gate.id && g.to === item.id)) continue;
      diff.gates.push({ from: gate.id, fromLabel: gate.label, to: item.id, toLabel: item.label, why: pre.text, source: pre.source });
      changed = true;
    }
    if (p.feeds) {
      const target = byId.get(p.feeds);
      if (target && !item.blocks?.includes(target.id) && !diff.gates.some((g) => g.from === item.id && g.to === target.id)) {
        diff.gates.push({ from: item.id, fromLabel: item.label, to: target.id, toLabel: target.label, why: `${item.label} feeds ${target.label}.`, source: 'class pass' });
        changed = true;
      }
    }

    const newFlags: FlagChange['flags'] = [];
    if (p.flags.lopesWrite && !item.flags.lopesWrite) newFlags.push('lopesWrite');
    if (p.flags.timed && !item.flags.timed) newFlags.push('timed');
    if (p.flags.group && !item.flags.group) newFlags.push('group');
    if (p.flags.inPerson && !item.flags.inClass && !course.online) newFlags.push('inClass');
    if (newFlags.length) {
      diff.flags.push({ itemId: item.id, label: item.label, flags: newFlags });
      changed = true;
    }

    if (!changed) diff.quiet++;
  }
  diff.missing = plan.missing.map((ref) => titleOf(ref));
  diff.total = diff.startBy.length + diff.minutes.length + diff.steps.length + diff.gates.length + diff.flags.length + diff.discovered.length;
  return diff;
}

/** One line for the compare screen: what the pass found, in plain words. */
export function diffSummary(diff: PlanDiff, course: Course, read: number): string {
  const parts: string[] = [];
  const earlier = diff.startBy.filter((c) => c.from && c.to < c.from).length;
  const later = diff.startBy.filter((c) => c.from && c.to > c.from).length;
  if (earlier) parts.push(`${earlier} earlier start${earlier === 1 ? '' : 's'}`);
  if (later) parts.push(`${later} later start${later === 1 ? '' : 's'}`);
  if (diff.startBy.length - earlier - later) parts.push(`${diff.startBy.length - earlier - later} first start${diff.startBy.length - earlier - later === 1 ? '' : 's'}`);
  if (diff.minutes.length) parts.push(`${diff.minutes.length} effort estimate${diff.minutes.length === 1 ? '' : 's'}`);
  if (diff.steps.length) parts.push(`milestones for ${diff.steps.length}`);
  if (diff.gates.length) parts.push(`${diff.gates.length} prerequisite${diff.gates.length === 1 ? '' : 's'}`);
  if (diff.flags.length) parts.push(`${diff.flags.length} flag${diff.flags.length === 1 ? '' : 's'}`);
  if (diff.discovered.length) parts.push(`${diff.discovered.length} thing${diff.discovered.length === 1 ? '' : 's'} found outside Halo`);
  const head = `The AI read ${read} ${course.code} item${read === 1 ? '' : 's'}`;
  if (!parts.length) return `${head} and agrees with the planner on all of them.`;
  const list = parts.length <= 2 ? parts.join(' and ') : `${parts.slice(0, -1).join(', ')}, and ${parts.at(-1)}`;
  return `${head}: ${list}.${diff.quiet ? ` ${diff.quiet} only gain what they ask for and where to study.` : ''}`;
}
