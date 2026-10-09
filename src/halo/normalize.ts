import { PALETTE } from '../data/courseDefaults';
import { repairSetup, setupFromHalo } from './section';
import { classifyItem } from '../domain/classify';
import { dateOf, makeIso, zonedParts } from '../domain/dates';
import { estimateMinutes } from '../domain/estimate';
import { stableId } from '../domain/ids';
import { shortLabel } from '../domain/labels';
import type { Course, Item, ItemFlags, ItemType } from '../domain/types';
import type { HaloAssessment, HaloClass, HaloFinalGrade } from './types';

/** How to read a Halo date string that carries no time zone. */
export type BareDateMode = 'utc' | 'local';

const pad = (n: number) => String(n).padStart(2, '0');
const ZONED = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})$/;
const BARE = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?$/;
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/** Re-express an instant as ISO with the offset of `tz`, minute precision, like every other dueAt in the app. */
function rezone(iso: string, tz: string): string {
  const p = zonedParts(iso, tz);
  return makeIso(`${p.y}-${pad(p.m)}-${pad(p.d)}`, `${pad(p.hh)}:${pad(p.mm)}`, tz);
}

/**
 * Halo date string → ISO in `tz`. Zoned strings are exact. Strings without a zone are read as UTC,
 * which is how Halo's backend writes them, unless `bareAs` says local. Unparseable → null.
 */
export function parseHaloDate(s: string | null | undefined, tz: string, bareAs: BareDateMode = 'utc'): string | null {
  if (!s) return null;
  const t = String(s).trim();
  if (DATE_ONLY.test(t)) return makeIso(t, '23:59', tz);
  const bare = BARE.exec(t);
  if (bare) {
    if (bareAs === 'local') return makeIso(bare[1], `${bare[2]}:${bare[3]}`, tz);
    return rezone(`${bare[1]}T${bare[2]}:${bare[3]}:${bare[4] ?? '00'}Z`, tz);
  }
  if (ZONED.test(t)) return rezone(t, tz);
  const ms = Date.parse(t);
  return Number.isNaN(ms) ? null : rezone(new Date(ms).toISOString(), tz);
}

export const hasZone = (s: string | null | undefined): boolean => !!s && ZONED.test(String(s).trim());

/** "CHM-113L" and "chm 113l" are the same class. */
export const normCode = (code: string): string => (code ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');

/** The class part of a code, section dropped: "ENG-105-ONL4" and "ENG 105 (TR101)" both key to ENG105. */
export function courseKey(code: string): string {
  const m = /([A-Z]{2,4})\s*-?\s*(\d{3}[A-Z]?)/i.exec(code ?? '');
  return m ? `${m[1]}${m[2]}`.toUpperCase() : normCode(code);
}

/** The planner class a code or name refers to, section suffixes ignored, name as a last resort. */
export function resolveCourse<T extends { id: string; code: string; name: string }>(text: string, courses: T[]): T | null {
  const key = courseKey(text);
  if (key) {
    const hit = courses.find((c) => courseKey(c.code) === key);
    if (hit) return hit;
  }
  const t = (text ?? '').trim().toLowerCase();
  if (t.length < 4) return null;
  return courses.find((c) => c.name.toLowerCase() === t) ?? courses.find((c) => t.includes(c.name.toLowerCase()) || c.name.toLowerCase().includes(t)) ?? null;
}

export const normTitle = (t: string): string =>
  decodeEntities(t ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'" };
function decodeEntities(s: string): string {
  return s.replace(/&(#?\w+);/g, (m, e: string) => ENTITIES[e] ?? (e.startsWith('#') ? String.fromCharCode(Number(e.slice(1))) || m : m));
}

/** Halo's class grade as stored on the course: its letter, its points, and the percent the way Halo computes it. */
export function haloGradeFrom(f: HaloFinalGrade | null, at: string): Course['haloGrade'] {
  if (!f) return null;
  const pts = typeof f.points === 'number' && Number.isFinite(f.points) ? f.points : null;
  const max = typeof f.maxPoints === 'number' && Number.isFinite(f.maxPoints) ? f.maxPoints : null;
  const letter = typeof f.letter === 'string' && f.letter.trim() ? f.letter.trim() : null;
  const percent = pts !== null && max !== null && max > 0 ? (pts / max) * 100 : null;
  if (letter === null && percent === null) return null;
  return { letter, points: pts, maxPoints: max, percent, at };
}

/** Halo descriptions are HTML. Keep the words, drop the markup. */
export function stripHtml(html: string | null | undefined, max = 2000): string {
  if (!html) return '';
  const text = decodeEntities(
    html
      .replace(/<br\s*\/?>|<\/(?:p|div|li|h\d|tr)>/gi, '\n')
      .replace(/<[^>]+>/g, ''),
  )
    .replace(/[ \t]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/** Halo's coarse type plus the title rules already used for syllabi. */
export function haloType(a: HaloAssessment, courseCode: string): ItemType {
  const byTitle = classifyItem(a.title ?? '', courseCode);
  switch (a.type) {
    case 'PARTICIPATION':
      return 'participation';
    case 'DISCUSSION_QUESTION':
      return 'discussion';
    case 'QUIZ':
      return byTitle === 'exam' ? 'exam' : 'quiz';
    case 'LTI':
      return byTitle === 'other' ? 'homework' : byTitle;
    default:
      return byTitle;
  }
}

export function haloFlags(a: HaloAssessment): ItemFlags {
  const tags = a.tags ?? [];
  return {
    inClass: !!a.inPerson || tags.includes('IN_PERSON'),
    group: !!a.isGroupEnabled,
    lopesWrite: !!a.requiresLopesWrite,
    timed: tags.includes('TIMED'),
    practice: tags.includes('PRACTICE') || /practice/i.test(a.title ?? ''),
  };
}

/** Deterministic, so a re-sync after a delete lands on the same id. */
export const haloItemId = (haloId: string): string => stableId(`halo|${haloId}`);

const SUBMITTED = new Set(['SUBMITTED', 'PUBLISHED']);
/** Halo considers it turned in. LATE only counts when a submission exists. */
export function isSubmitted(a: HaloAssessment): boolean {
  if (!a.status) return false;
  if (SUBMITTED.has(a.status)) return true;
  return a.status === 'LATE' && !!a.submittedAt;
}

export type SyncSource = 'halo' | 'ics';

export interface ToItemOptions {
  tz: string;
  now: string;
  bareAs?: BareDateMode;
  includeZeroPoint?: boolean;
  /** Which path the payload came from; decides the identity field and the source tag. */
  source?: SyncSource;
}

/** Why an assessment can't become an item, or null when it can. */
export function assessmentIssue(a: HaloAssessment, opts: ToItemOptions): string | null {
  if (!a.title?.trim()) return 'no title';
  if (!parseHaloDate(a.dueDate, opts.tz, opts.bareAs)) return 'no due date';
  // A day's participation post or a discussion with no points of its own still counts: it feeds the week's graded
  // participation, and Halo marks it overdue when it is missed (2026-10-04: CHM-113's "Week 4, Day 2 Participation",
  // two days overdue in Halo, never reached Halo+). Other zero-point work stays out unless asked for.
  if (!opts.includeZeroPoint && !(Number(a.points) > 0) && a.type !== 'DISCUSSION_QUESTION' && a.type !== 'PARTICIPATION') return 'worth 0 points';
  return null;
}

export function toItem(a: HaloAssessment, course: Course, opts: ToItemOptions): Item {
  const title = a.title.trim();
  const type = haloType(a, course.code);
  const dueAt = parseHaloDate(a.dueDate, opts.tz, opts.bareAs)!;
  const opensAt = parseHaloDate(a.startDate, opts.tz, opts.bareAs);
  const points = Number(a.points) > 0 ? Number(a.points) : 0;
  const source = opts.source ?? 'halo';
  return {
    id: source === 'ics' ? stableId(`ics|${a.id}`) : haloItemId(a.id),
    courseId: course.id,
    title,
    label: shortLabel({ title, courseCode: course.code, type }),
    labelOverridden: false,
    type,
    points,
    opensAt,
    dueAt,
    estimatedMinutes: estimateMinutes({ title, type, points, courseCode: course.code }),
    estimateOverridden: false,
    startByOverride: null,
    status: 'todo',
    completedAt: null,
    score: null,
    notes: stripHtml(a.description),
    topic: a.unit ?? null,
    ...(a.attachments?.length ? { attachments: a.attachments.map((f) => ({ id: f.id, resourceId: f.resourceId ?? null, title: f.title })) } : {}),
    flags: course.online ? { ...haloFlags(a), inClass: false } : haloFlags(a),
    source,
    haloId: source === 'halo' ? a.id : null,
    haloUnitId: source === 'halo' ? (a.unitId ?? null) : null,
    haloType: source === 'halo' ? a.type || null : null,
    icsUid: source === 'ics' ? a.id : null,
    url: a.url ?? null,
    award: null,
    updatedAt: opts.now,
  };
}

/**
 * The planner class a Halo class belongs to: the one linked to it, else the one with its course code, else the one
 * whose code is its class code with the section dropped (ENG-105-ONL4 is ENG-105; CHM-113L-M600A is CHM-113L). A lab
 * is never its lecture: until 2026-09-30 a class could also match any course its class code merely started with, and
 * CHM-113L folded into CHM-113 on every account with a lab.
 *
 * A link is trusted unless the linked class carries a different course code AND another class in the same export
 * carries the linked class's code exactly: that is a lab merged into its lecture by the old rule, and the lecture is
 * the rightful owner, so the lab goes on to get a class of its own.
 */
export function findCourse(courses: Course[], c: HaloClass, others: readonly HaloClass[] = []): Course | undefined {
  const code = normCode(c.courseCode);
  const linked = courses.find((x) => x.haloClassId && x.haloClassId === c.id);
  if (linked) {
    const linkedCode = normCode(linked.code);
    const owner = code && linkedCode !== code && others.some((o) => o.id !== c.id && normCode(o.courseCode) === linkedCode);
    if (!owner) return linked;
  }
  const exact = code ? courses.find((x) => normCode(x.code) === code) : undefined;
  if (exact) return exact;
  const key = courseKey(c.courseCode || c.classCode);
  return key ? courses.find((x) => courseKey(x.code) === key) : undefined;
}

export function toCourse(c: HaloClass, existing: Course | undefined, opts: { tz: string; now: string; index: number; stampHalo?: boolean }): Course {
  const stamp = opts.stampHalo !== false;
  // Strings from the bookmark; an older or foreign export may send objects or junk, and a name is still a name.
  const names = (Array.isArray(c.instructors) ? c.instructors : [])
    .map((n: unknown) => (typeof n === 'string' ? n : n && typeof n === 'object' && typeof (n as { name?: unknown }).name === 'string' ? (n as { name: string }).name : ''))
    .map((n) => n.trim())
    .filter(Boolean);
  if (existing) {
    if (!stamp) return existing;
    const instructors = existing.instructors.length === 0 && names.length ? names.map((name) => ({ name, email: '' })) : existing.instructors;
    // Class-level facts from Halo. A run where that call failed carries nothing rather than an empty list, so what is
    // already known survives instead of being wiped.
    return {
      ...existing,
      ...repairSetup(existing, c),
      haloSlugId: c.slugId,
      haloClassId: c.id,
      instructors,
      ...(c.gradeScale?.length ? { gradeScale: c.gradeScale } : {}),
      ...(c.holidays?.length ? { holidays: c.holidays } : {}),
      ...(c.participation ? { participation: c.participation } : {}),
      ...(c.finalGrade !== undefined ? { haloGrade: haloGradeFrom(c.finalGrade, opts.now) } : {}),
      updatedAt: opts.now,
    };
  }
  const code = c.courseCode?.trim() || c.classCode?.trim() || 'CLASS';
  const setup = setupFromHalo(c);
  const today = dateOf(opts.now, opts.tz);
  const termStart = dateOf(parseHaloDate(c.startDate, opts.tz) ?? opts.now, opts.tz) || today;
  const termEnd = c.endDate ? dateOf(parseHaloDate(c.endDate, opts.tz) ?? opts.now, opts.tz) : termStart;
  return {
    id: stableId(`course|halo|${c.id}`),
    code,
    name: c.name?.trim() || code,
    color: PALETTE[opts.index % PALETTE.length],
    credits: c.credits ?? 3,
    instructors: names.map((name) => ({ name, email: '' })),
    meetings: setup.meetings,
    online: setup.online,
    meetingsFrom: setup.meetingsFrom,
    haloSlugId: stamp ? c.slugId : null,
    haloClassId: stamp ? c.id : null,
    ...(c.gradeScale?.length ? { gradeScale: c.gradeScale } : {}),
    ...(c.holidays?.length ? { holidays: c.holidays } : {}),
    ...(c.participation ? { participation: c.participation } : {}),
    ...(c.finalGrade !== undefined ? { haloGrade: haloGradeFrom(c.finalGrade, opts.now) } : {}),
    termStart,
    termEnd,
    updatedAt: opts.now,
  };
}

/**
 * Halo deadlines are nearly always 11:59 PM. A due time ending in :59 at any other hour
 * (4:59 PM, 6:59 AM) is the fingerprint of a time-zone misread, not a real deadline.
 * Returns the odd clock time, or null when the time looks normal.
 */
export function oddDueTime(iso: string, tz: string): string | null {
  const p = zonedParts(iso, tz);
  if (p.mm !== 59 || p.hh === 23) return null;
  const h12 = p.hh % 12 === 0 ? 12 : p.hh % 12;
  return `${h12}:59 ${p.hh < 12 ? 'AM' : 'PM'}`;
}
