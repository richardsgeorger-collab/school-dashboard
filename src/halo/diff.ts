import { dateOf } from '../domain/dates';
import { estimateMinutes } from '../domain/estimate';
import { shortLabel } from '../domain/labels';
import type { AppData, Course, Item } from '../domain/types';
import { assessmentIssue, findCourse, hasZone, isSubmitted, normTitle, parseHaloDate, toCourse, toItem, type BareDateMode } from './normalize';
import type { HaloAssessment, HaloExport } from './types';

export interface FieldChange {
  field: 'dueAt' | 'points' | 'title';
  from: string | number | null;
  to: string | number | null;
}
export interface AddedEntry {
  key: string;
  item: Item;
  halo: HaloAssessment;
  course: Course;
  submitted: boolean;
}
export interface ChangedEntry {
  key: string;
  existing: Item;
  next: Item;
  halo: HaloAssessment;
  course: Course;
  changes: FieldChange[];
}
export interface MissingEntry {
  key: string;
  existing: Item;
  course: Course;
  /** Remove by default only when nothing has been started. */
  suggestRemove: boolean;
}
export interface SubmittedEntry {
  key: string;
  id: string;
  title: string;
  course: Course;
  at: string;
  score: number | null;
  isNew: boolean;
}
export interface SkippedEntry {
  title: string;
  course: string;
  reason: string;
}
export interface HaloDiff {
  exportedAt: string;
  courses: { created: Course[]; linked: Course[] };
  added: AddedEntry[];
  changed: ChangedEntry[];
  /** Matched with no visible change; still written when linking or filling in blanks. */
  unchanged: ChangedEntry[];
  missing: MissingEntry[];
  submitted: SubmittedEntry[];
  skipped: SkippedEntry[];
  /** Local items in synced classes with no Halo counterpart. Left alone. */
  untouched: Item[];
  /** A few raw Halo due strings, for the trust line. */
  rawDates: string[];
  bareDates: boolean;
}
export interface DiffOptions {
  tz: string;
  now: string;
  includeZeroPoint?: boolean;
  bareAs?: BareDateMode;
}

const SKIP_STAGES = new Set(['CLOSED', 'INACTIVE']);

function tokens(s: string): Set<string> {
  return new Set(normTitle(s).split(' ').filter((w) => w.length > 1));
}
function jaccard(a: string, b: string): number {
  const A = tokens(a);
  const B = tokens(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const w of A) if (B.has(w)) inter++;
  return inter / (A.size + B.size - inter);
}
function sameInstant(a: string | null, b: string | null): boolean {
  if (!a || !b) return a === b;
  return Date.parse(a) === Date.parse(b);
}

/** Link, then exact title, then a close title due the same day. */
export function findMatch(candidates: Item[], next: Item, tz: string): Item | undefined {
  const byHalo = candidates.find((i) => i.haloId && i.haloId === next.haloId);
  if (byHalo) return byHalo;
  const nt = normTitle(next.title);
  const byTitle = candidates.find((i) => normTitle(i.title) === nt);
  if (byTitle) return byTitle;
  const day = dateOf(next.dueAt, tz);
  let best: { item: Item; score: number } | undefined;
  for (const i of candidates) {
    if (dateOf(i.dueAt, tz) !== day) continue;
    const s = jaccard(i.title, next.title);
    if (s >= 0.6 && (!best || s > best.score)) best = { item: i, score: s };
  }
  return best?.item;
}

/** Halo's facts onto the local item. Everything the user owns stays: status, score, award, estimate and label overrides, start-by, snooze, notes. */
export function mergeItem(existing: Item, next: Item, course: Course, now: string): Item {
  const points = next.points > 0 ? next.points : existing.points;
  const merged: Item = {
    ...existing,
    title: next.title,
    label: existing.labelOverridden ? existing.label : shortLabel({ title: next.title, courseCode: course.code, type: existing.type }),
    haloId: next.haloId,
    dueAt: next.dueAt,
    opensAt: next.opensAt ?? existing.opensAt,
    points,
    flags: {
      inClass: existing.flags.inClass || next.flags.inClass,
      group: existing.flags.group || next.flags.group,
      lopesWrite: existing.flags.lopesWrite || next.flags.lopesWrite,
      timed: existing.flags.timed || next.flags.timed,
      practice: existing.flags.practice || next.flags.practice,
    },
    notes: existing.notes?.trim() ? existing.notes : next.notes,
    topic: existing.topic ?? next.topic,
    source: existing.source === 'manual' ? 'manual' : 'halo',
    updatedAt: now,
  };
  if (!existing.estimateOverridden) {
    merged.estimatedMinutes = estimateMinutes({ title: merged.title, type: merged.type, points: merged.points, courseCode: course.code });
  }
  return merged;
}

export function changesBetween(existing: Item, merged: Item): FieldChange[] {
  const out: FieldChange[] = [];
  if (!sameInstant(existing.dueAt, merged.dueAt)) out.push({ field: 'dueAt', from: existing.dueAt, to: merged.dueAt });
  if (existing.points !== merged.points) out.push({ field: 'points', from: existing.points, to: merged.points });
  if (normTitle(existing.title) !== normTitle(merged.title)) out.push({ field: 'title', from: existing.title, to: merged.title });
  return out;
}

const strip = (i: Item) => JSON.stringify({ ...i, updatedAt: '' });
/** True when writing `next` would change anything at all (links, opens-at, flags, notes). */
export const differs = (a: Item, b: Item): boolean => strip(a) !== strip(b);

export function diffHalo(payload: HaloExport, data: AppData, opts: DiffOptions): HaloDiff {
  const { tz, now } = opts;
  const diff: HaloDiff = {
    exportedAt: payload.exportedAt,
    courses: { created: [], linked: [] },
    added: [],
    changed: [],
    unchanged: [],
    missing: [],
    submitted: [],
    skipped: [],
    untouched: [],
    rawDates: [],
    bareDates: false,
  };
  const courses = [...data.courses];
  let created = 0;
  for (const c of payload.classes) {
    if (c.stage && SKIP_STAGES.has(c.stage)) continue;
    const existing = findCourse(courses, c);
    const course = toCourse(c, existing, { tz, now, index: data.courses.length + created });
    if (existing) {
      diff.courses.linked.push(course);
      courses[courses.indexOf(existing)] = course;
    } else {
      diff.courses.created.push(course);
      courses.push(course);
      created++;
    }
    const local = data.items.filter((i) => i.courseId === course.id);
    const taken = new Set<string>();
    for (const a of c.assessments ?? []) {
      if (a.dueDate && diff.rawDates.length < 3 && !diff.rawDates.includes(a.dueDate)) diff.rawDates.push(a.dueDate);
      if (a.dueDate && !hasZone(a.dueDate)) diff.bareDates = true;
      const issue = assessmentIssue(a, opts);
      if (issue) {
        diff.skipped.push({ title: a.title ?? '(untitled)', course: course.code, reason: issue });
        continue;
      }
      const next = toItem(a, course, opts);
      const submitted = isSubmitted(a);
      const at = parseHaloDate(a.submittedAt, tz, opts.bareAs) ?? payload.exportedAt;
      const score = a.status === 'PUBLISHED' ? a.score : null;
      const match = findMatch(
        local.filter((i) => !taken.has(i.id)),
        next,
        tz,
      );
      if (!match) {
        diff.added.push({ key: next.id, item: next, halo: a, course, submitted });
        if (submitted) diff.submitted.push({ key: `s:${next.id}`, id: next.id, title: next.title, course, at, score, isNew: true });
        continue;
      }
      taken.add(match.id);
      const merged = mergeItem(match, next, course, now);
      const changes = changesBetween(match, merged);
      const entry: ChangedEntry = { key: match.id, existing: match, next: merged, halo: a, course, changes };
      if (changes.length) diff.changed.push(entry);
      else if (differs(match, merged)) diff.unchanged.push(entry);
      if (submitted && match.status !== 'done') diff.submitted.push({ key: `s:${match.id}`, id: match.id, title: merged.title, course, at, score, isNew: false });
    }
    for (const i of local) {
      if (taken.has(i.id)) continue;
      if (i.haloId) diff.missing.push({ key: i.id, existing: i, course, suggestRemove: i.status === 'todo' });
      else diff.untouched.push(i);
    }
  }
  return diff;
}
