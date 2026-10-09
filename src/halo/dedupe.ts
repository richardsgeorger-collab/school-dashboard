import type { AppData, Course, HaloPull, Item } from '../domain/types';
import { normCode } from './normalize';

/**
 * One class, one course; one Halo assessment, one item (George's account, 2026-10-09). The move to haloplus.app on
 * Sept 30 left a second copy of every class in his account, and the sign-in to a second account surfaced them: a
 * class "never synced" was the copy without a pull stamp, an assignment "not done" was the copy the sync did not
 * touch. This folds copies into one: the primary keeps its id, takes the others' items, and a Halo assessment that
 * appears twice keeps the better item (done, edited, or planned). Pure: the store mirrors the removals it returns.
 */
export interface DedupeResult {
  data: AppData;
  removedCourses: string[];
  removedItems: string[];
}

const edited = (i: Item): boolean => !!(i.labelOverridden || i.askDone?.length || i.steps?.some((s) => s.done) || i.estimateOverridden || i.startByOverride || i.snoozedUntil || (i.notes?.trim() && i.haloNotes !== undefined && i.notes.trim() !== i.haloNotes.trim()));
const planned = (i: Item): boolean => !!(i.plan || i.brief);
/** Halo said it was handed in or graded (a graded assessment is PUBLISHED with a score; a handed-in one is SUBMITTED). */
const haloDone = (i: Item): boolean => !!(i.halo?.submittedAt || /SUBMITTED|GRADED|COMPLETED/i.test(i.halo?.status ?? '') || (i.scoreSource === 'halo' && i.score != null));

const laterOf = (a: string | null | undefined, b: string | null | undefined): string | null => (!a ? (b ?? null) : !b ? a : a > b ? a : b);

function mergePulls(a: HaloPull | undefined, b: HaloPull | undefined): HaloPull | undefined {
  if (!a) return b;
  if (!b) return a;
  const out: HaloPull = { ...a };
  for (const k of Object.keys(b) as (keyof HaloPull)[]) out[k] = laterOf(a[k], b[k]);
  return out;
}

/**
 * The copy that keeps its id: the one the student and the AI have worked in longest (plans and briefs live there, and
 * links, skips and undo point at it), then the edited one, then the one the syncs stamp, then the fuller one. A pull
 * stamp alone says little: in George's account the syncs landed on either copy by turns.
 */
function pickPrimary(copies: Course[], items: Item[], pulls: Record<string, HaloPull>): Course {
  const score = (c: Course): number => {
    const mine = items.filter((i) => i.courseId === c.id);
    return mine.filter(planned).length * 1000 + mine.filter(edited).length * 100 + (pulls[c.id]?.assessments ? 10 : 0) + (c.haloClassId ? 5 : 0) + Math.min(mine.length, 4);
  };
  return [...copies].sort((a, b) => score(b) - score(a))[0];
}

/** Of two items for one Halo assessment, the one to keep. */
function pickItem(a: Item, b: Item): Item {
  const rank = (i: Item): number => (i.status === 'done' ? 1000 : 0) + (edited(i) ? 100 : 0) + (planned(i) ? 10 : 0);
  const [keep, drop] = rank(a) >= rank(b) ? [a, b] : [b, a];
  // Halo's word carries over: handed in on either copy is handed in.
  const out: Item = { ...keep };
  if (keep.status !== 'done' && (drop.status === 'done' || haloDone(drop))) {
    out.status = 'done';
    out.completedAt = drop.completedAt ?? drop.halo?.submittedAt ?? keep.completedAt ?? null;
    if (keep.score == null && drop.score != null) out.score = drop.score;
  }
  if (!out.halo && drop.halo) out.halo = drop.halo;
  if (!out.plan && drop.plan) out.plan = drop.plan;
  if (!out.brief && drop.brief) out.brief = drop.brief;
  if (!out.rubric && drop.rubric) out.rubric = drop.rubric;
  return out;
}

export function dedupeData(data: AppData): DedupeResult {
  const pulls = data.settings.haloPulls ?? {};
  // Groups: by Halo class id; a copy without one joins the group whose primary has its code.
  const groups = new Map<string, Course[]>();
  const unlinked: Course[] = [];
  for (const c of data.courses) {
    if (c.haloClassId) groups.set(c.haloClassId, [...(groups.get(c.haloClassId) ?? []), c]);
    else unlinked.push(c);
  }
  for (const c of unlinked) {
    const code = normCode(c.code);
    const home = [...groups.entries()].find(([, copies]) => copies.some((x) => normCode(x.code) === code));
    if (home) home[1].push(c);
    else groups.set(`code:${code || c.id}`, [...(groups.get(`code:${code || c.id}`) ?? []), c]);
  }
  const dupGroups = [...groups.values()].filter((g) => g.length > 1);
  if (dupGroups.length === 0) return { data, removedCourses: [], removedItems: [] };

  const removedCourses: string[] = [];
  const removedItems: string[] = [];
  let items = [...data.items];
  let courses = [...data.courses];
  const haloPulls: Record<string, HaloPull> = { ...pulls };
  const now = new Date().toISOString();
  for (const copies of dupGroups) {
    const primary = pickPrimary(copies, items, pulls);
    for (const c of copies) {
      if (c.id === primary.id) continue;
      removedCourses.push(c.id);
      items = items.map((i) => (i.courseId === c.id ? { ...i, courseId: primary.id, updatedAt: now } : i));
      const merged = mergePulls(haloPulls[primary.id], haloPulls[c.id]);
      if (merged) haloPulls[primary.id] = merged;
      delete haloPulls[c.id];
    }
    courses = courses.filter((c) => c.id === primary.id || !copies.some((x) => x.id === c.id));
    // One Halo assessment, one item.
    const byHalo = new Map<string, Item>();
    const keep: Item[] = [];
    for (const i of items) {
      if (i.courseId !== primary.id || !i.haloId) continue;
      const had = byHalo.get(i.haloId);
      if (!had) {
        byHalo.set(i.haloId, i);
        continue;
      }
      const chosen = pickItem(had, i);
      const dropped = chosen.id === had.id ? i : had;
      removedItems.push(dropped.id);
      byHalo.set(i.haloId, { ...chosen, updatedAt: now });
    }
    for (const i of items) {
      if (i.courseId !== primary.id || !i.haloId) {
        keep.push(i);
        continue;
      }
      const chosen = byHalo.get(i.haloId)!;
      if (chosen.id === i.id) keep.push(chosen);
    }
    items = keep;
  }
  return {
    data: { ...data, courses, items, settings: { ...data.settings, haloPulls, updatedAt: now } },
    removedCourses,
    removedItems,
  };
}
