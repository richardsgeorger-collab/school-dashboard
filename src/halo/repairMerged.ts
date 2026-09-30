import { PALETTE } from '../data/courseDefaults';
import { stableId } from '../domain/ids';
import type { Course, Item } from '../domain/types';
import { courseKey } from './normalize';
import { isLabCode, sectionMeetings } from './section';

/**
 * Repairing, without a sync, a class the old matcher merged into another (George, 2026-09-30). Until loop 150 a Halo
 * class could match any planner class its class code merely started with, so CHM-113L-M600A folded into CHM-113: the
 * planner kept one class, named for the lecture, linked to the lab, holding both classes' work.
 *
 * Items carry no class of their own, but Halo's ids do: a unit id and an assessment id belong to exactly one Halo class,
 * and a lab section is shared by every student in it. So a class seen correctly on any account (CHM-113L-M600A on the
 * accounts that synced after the fix) says which units, assessments and announcement forums are the lab's. Whatever
 * that evidence names moves to a class of its own; everything else stays. With no evidence for the lab, nothing
 * moves and the app asks for one sync instead (mergedClasses).
 */

/** The course part of a section slug or class code: "CHM-113L-M600A-20260908" is CHM-113L. */
export const slugCourse = (slug: string | null | undefined): string => (slug ?? '').split('-').slice(0, 2).join('-');

/** A class linked to a Halo section of a different course: the sign of the old merge. */
export function isMerged(c: Pick<Course, 'code' | 'haloSlugId'>): boolean {
  const s = slugCourse(c.haloSlugId);
  return !!c.haloSlugId && !!s && courseKey(s) !== courseKey(c.code);
}

/** Classes still merged on this account, for the one-sync banner. */
export const mergedClasses = <T extends Pick<Course, 'code' | 'haloSlugId'>>(courses: T[]): T[] => courses.filter(isMerged);

/** What a correctly linked class, on any account, says about its Halo section. */
export interface SectionFacts {
  slug: string;
  classId: string;
  code: string;
  name: string;
  instructors: Course['instructors'];
  gradeScale?: Course['gradeScale'];
  participation?: Course['participation'];
  holidays?: Course['holidays'];
}
export interface Knowledge {
  units: Map<string, string>;
  assessments: Map<string, string>;
  forums: Map<string, string>;
  sections: Map<string, SectionFacts>;
}

export function emptyKnowledge(): Knowledge {
  return { units: new Map(), assessments: new Map(), forums: new Map(), sections: new Map() };
}

/** Learn from one account's correctly linked classes (never from a merged one). */
export function learn(k: Knowledge, courses: Course[], items: Item[], posts: { courseId: string; forumId: string | null }[]): void {
  for (const c of courses) {
    if (!c.haloSlugId || !c.haloClassId || isMerged(c)) continue;
    const slug = c.haloSlugId;
    if (!k.sections.has(slug)) k.sections.set(slug, { slug, classId: c.haloClassId, code: slugCourse(slug), name: c.name, instructors: c.instructors, gradeScale: c.gradeScale, participation: c.participation, holidays: c.holidays });
    for (const i of items) {
      if (i.courseId !== c.id) continue;
      if (i.haloUnitId) k.units.set(i.haloUnitId, slug);
      if (i.haloId) k.assessments.set(i.haloId, slug);
    }
    for (const p of posts) if (p.courseId === c.id && p.forumId) k.forums.set(p.forumId, slug);
  }
}

export interface RepairPlan {
  merged: Course;
  /** The class restored for the section the merged class was linked to (the lab). */
  restored: Course;
  /** The merged class as it should be: its own code and name, no link to the other section, no borrowed grade. */
  kept: Course;
  moveItems: string[];
  movePosts: string[];
  /** Items no evidence places: they stay with the kept class. */
  unplaced: number;
}

/** The repair for one merged class, or null when nothing on any account knows the other section. */
export function planRepair(merged: Course, items: Item[], posts: { id: string; courseId: string; forumId: string | null }[], k: Knowledge, taken: Course[], now: string): RepairPlan | null {
  if (!isMerged(merged)) return null;
  const slug = merged.haloSlugId!;
  const facts = k.sections.get(slug);
  if (!facts) return null;
  const mine = items.filter((i) => i.courseId === merged.id);
  const isTheirs = (i: Item) => (i.haloUnitId && k.units.get(i.haloUnitId) === slug) || (i.haloId && k.assessments.get(i.haloId) === slug);
  const placedElsewhere = (i: Item) => (i.haloUnitId && k.units.has(i.haloUnitId) && k.units.get(i.haloUnitId) !== slug) || (i.haloId && k.assessments.has(i.haloId) && k.assessments.get(i.haloId) !== slug);
  const moveItems = mine.filter((i) => isTheirs(i)).map((i) => i.id);
  if (moveItems.length === 0) return null;
  const unplaced = mine.filter((i) => !isTheirs(i) && !placedElsewhere(i) && i.source === 'halo').length;
  const movePosts = posts.filter((p) => p.courseId === merged.id && p.forumId && k.forums.get(p.forumId) === slug).map((p) => p.id);
  const used = new Set(taken.map((c) => c.color));
  const meetings = sectionMeetings(slug, isLabCode(facts.code));
  const restored: Course = {
    id: stableId(`course|halo|${facts.classId}`),
    code: facts.code,
    name: facts.name,
    color: PALETTE.find((p) => !used.has(p)) ?? PALETTE[taken.length % PALETTE.length],
    credits: merged.credits,
    instructors: facts.instructors?.length ? facts.instructors : merged.instructors,
    meetings: meetings ?? [],
    meetingsFrom: meetings ? 'section' : null,
    online: false,
    haloSlugId: slug,
    haloClassId: facts.classId,
    ...(facts.gradeScale?.length ? { gradeScale: facts.gradeScale } : {}),
    ...(facts.participation ? { participation: facts.participation } : {}),
    ...(facts.holidays?.length ? { holidays: facts.holidays } : {}),
    // The merged class's Halo grade came from the section it was linked to: this one.
    ...(merged.haloGrade ? { haloGrade: merged.haloGrade } : {}),
    termStart: merged.termStart,
    termEnd: merged.termEnd,
    updatedAt: now,
  };
  // What the last Halo write left on the merged class belongs to the section it was linked to; the next sync gives the
  // kept class its own again.
  const { haloGrade: _g, participation: _p, holidays: _h, ...rest } = merged;
  const kept: Course = { ...rest, haloSlugId: null, haloClassId: null, updatedAt: now };
  return { merged, restored, kept, moveItems, movePosts, unplaced };
}
