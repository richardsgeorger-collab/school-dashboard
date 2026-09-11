import { dateOf } from '../domain/dates';
import { estimateMinutes } from '../domain/estimate';
import { shortLabel } from '../domain/labels';
import type { AppData, Course, Item } from '../domain/types';
import { assessmentIssue, findCourse, hasZone, isSubmitted, normTitle, oddDueTime, parseHaloDate, toCourse, toItem, type BareDateMode, type SyncSource } from './normalize';
import type { HaloAssessment, HaloClass, HaloExport } from './types';

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
  /** Clock time when the due time looks like a zone misread. */
  oddTime: string | null;
}
export interface ChangedEntry {
  key: string;
  existing: Item;
  next: Item;
  halo: HaloAssessment;
  course: Course;
  changes: FieldChange[];
  oddTime: string | null;
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
  /** A few raw due strings, for the trust line. */
  rawDates: string[];
  /** One raw due string next to how it was read, for the trust line. */
  sample: { raw: string; dueAt: string } | null;
  bareDates: boolean;
  /** Items whose due time ends in :59 at an hour other than 11 PM. */
  zoneSuspects: { key: string; title: string; time: string }[];
  /** One sentence when the suspects say the zone reading is probably wrong. */
  zoneWarning: string | null;
}
export interface DiffOptions {
  tz: string;
  now: string;
  includeZeroPoint?: boolean;
  bareAs?: BareDateMode;
  source?: SyncSource;
  /** ICS: the class each export group maps to (may be a course not yet saved). Default: match by Halo link or code. */
  resolveCourse?: (c: HaloClass) => Course | undefined;
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
  const byKey = candidates.find((i) => (next.haloId && i.haloId === next.haloId) || (next.icsUid && (i.icsUid === next.icsUid || i.haloId === next.icsUid)));
  if (byKey) return byKey;
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
export function mergeItem(existing: Item, next: Item, course: Course, now: string, source: SyncSource = 'halo'): Item {
  const points = next.points > 0 ? next.points : existing.points;
  const merged: Item = {
    ...existing,
    title: next.title,
    label: existing.labelOverridden ? existing.label : shortLabel({ title: next.title, courseCode: course.code, type: existing.type }),
    haloId: next.haloId ?? existing.haloId ?? null,
    icsUid: next.icsUid ?? existing.icsUid ?? null,
    url: next.url ?? existing.url ?? null,
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
    source: existing.source === 'manual' ? 'manual' : source,
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
    sample: null,
    bareDates: false,
    zoneSuspects: [],
    zoneWarning: null,
  };
  const courses = [...data.courses];
  let created = 0;
  for (const c of payload.classes) {
    if (c.stage && SKIP_STAGES.has(c.stage)) continue;
    const source = opts.source ?? 'halo';
    const existing = opts.resolveCourse ? opts.resolveCourse(c) : findCourse(courses, c);
    const known = !!existing && data.courses.some((x) => x.id === existing.id);
    const course = toCourse(c, existing, { tz, now, index: data.courses.length + created, stampHalo: source === 'halo' });
    if (existing && known) {
      if (source === 'halo') {
        diff.courses.linked.push(course);
        courses[courses.indexOf(existing)] = course;
      }
    } else if (existing) {
      diff.courses.created.push(course);
      courses.push(course);
      created++;
    } else {
      diff.courses.created.push(course);
      courses.push(course);
      created++;
    }
    const local = data.items.filter((i) => i.courseId === course.id);
    const taken = new Set<string>();
    for (const a of c.assessments ?? []) {
      const raw = a.rawDue ?? a.dueDate;
      if (raw && diff.rawDates.length < 3 && !diff.rawDates.includes(raw)) diff.rawDates.push(raw);
      if (a.dueDate && !hasZone(a.dueDate)) diff.bareDates = true;
      const issue = assessmentIssue(a, opts);
      if (issue) {
        diff.skipped.push({ title: a.title ?? '(untitled)', course: course.code, reason: issue });
        continue;
      }
      const next = toItem(a, course, opts);
      if (!diff.sample && raw) diff.sample = { raw, dueAt: next.dueAt };
      const submitted = isSubmitted(a);
      const at = parseHaloDate(a.submittedAt, tz, opts.bareAs) ?? payload.exportedAt;
      const score = a.status === 'PUBLISHED' ? a.score : null;
      const match = findMatch(
        local.filter((i) => !taken.has(i.id)),
        next,
        tz,
      );
      if (!match) {
        diff.added.push({ key: next.id, item: next, halo: a, course, submitted, oddTime: oddDueTime(next.dueAt, tz) });
        if (submitted) diff.submitted.push({ key: `s:${next.id}`, id: next.id, title: next.title, course, at, score, isNew: true });
        continue;
      }
      taken.add(match.id);
      const merged = mergeItem(match, next, course, now, source);
      const changes = changesBetween(match, merged);
      const entry: ChangedEntry = { key: match.id, existing: match, next: merged, halo: a, course, changes, oddTime: oddDueTime(merged.dueAt, tz) };
      if (changes.length) diff.changed.push(entry);
      else if (differs(match, merged)) diff.unchanged.push(entry);
      if (submitted && match.status !== 'done') diff.submitted.push({ key: `s:${match.id}`, id: match.id, title: merged.title, course, at, score, isNew: false });
    }
    // Only items this path itself brought in can be "no longer in" its export.
    for (const i of local) {
      if (taken.has(i.id)) continue;
      const linkedHere = source === 'ics' ? !!i.icsUid : !!i.haloId;
      if (linkedHere) diff.missing.push({ key: i.id, existing: i, course, suggestRemove: i.status === 'todo' });
      else diff.untouched.push(i);
    }
  }
  for (const e of diff.added) if (e.oddTime) diff.zoneSuspects.push({ key: e.key, title: e.item.label, time: e.oddTime });
  for (const e of [...diff.changed, ...diff.unchanged]) if (e.oddTime) diff.zoneSuspects.push({ key: e.key, title: e.existing.label, time: e.oddTime });
  diff.zoneWarning = zoneWarningFor(diff.zoneSuspects, diff.bareDates);
  return diff;
}

/** The most common odd clock time, phrased as a warning, or null when nothing looks off. */
export function zoneWarningFor(suspects: { time: string }[], bareDates: boolean): string | null {
  if (suspects.length === 0) return null;
  const counts = new Map<string, number>();
  for (const s of suspects) counts.set(s.time, (counts.get(s.time) ?? 0) + 1);
  const [time, n] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  const what = `${n} due time${n === 1 ? '' : 's'} land${n === 1 ? 's' : ''} at ${time}.`;
  const why = ' Halo deadlines are 11:59 PM, so the time zone reading is probably wrong.';
  const fix = bareDates ? ' Flip the reading above and check again before applying.' : ' Do not apply until this is understood.';
  return what + why + fix;
}
