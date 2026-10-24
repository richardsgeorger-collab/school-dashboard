import { dateOf } from '../domain/dates';
import { rankItems } from '../domain/now';
import { isParticipation } from '../domain/participation';
import { participationThisWeek } from '../domain/participationWeek';
import { noHaloSubmission } from '../domain/submission';
import type { Schedule } from '../domain/schedule';
import { shortLine } from '../domain/shortLine';
import type { Course, Item, Settings } from '../domain/types';
import { isWorkDone } from '../joy/joy';

/**
 * What the Halo+ extension shows on Halo's own pages (George, 2026-10-22): the daily card, the pill, a line under each
 * class card, and what announcements added to an assignment. The page writes it to localStorage; the extension's
 * Halo+ script carries it to the extension, and its Halo script reads it there, on the student's own computer only.
 * The extension lays its own latest reading of Halo over it (extension/halo-model.js), so it stays current between
 * visits to Halo+. Short keys: it is stored on every change.
 */
export const HALO_SNAP_SLOT = 'school-dashboard:halo-snap';

export interface HaloSnapItem {
  /** Halo+'s item id. */
  id: string;
  /** Halo's assessment id (courseClassAssessmentId), when it came from Halo. */
  h: string | null;
  /** Halo+'s course id. */
  c: string;
  /** Halo+'s label ("Chem Quiz 2"). */
  t: string;
  /** Halo's own title, to find it on Halo's pages. */
  ht?: string;
  due: string;
  /** Halo's own due date (before any move an announcement made), to tell a Halo change from an announcement's. */
  hd?: string;
  pts: number;
  ty: string;
  done: 0 | 1;
  /** Requirements announcements added that are not done yet, and up to three of them in short. */
  x: number;
  xs?: string[];
  /** The due date before an announcement moved it. */
  m?: string;
  /** Participation (a day's post, a weekly check-in): never drives urgency on Halo's pages (2026-10-23). */
  pa?: 1;
  /** No submission in Halo (an outside tool's set, in-person work): quiet once its date passes (2026-10-24). */
  ns?: 1;
  /** What the assignment-page line may say (2026-10-24): things to bring or have, a new graded deliverable. */
  xb?: string[];
  /** Halo's topic (course unit) the assignment sits on, and Halo's own type ("QUIZ"): where "open in Halo" goes. */
  u?: string;
  hy?: string;
}

export interface HaloSnapClass {
  id: string;
  code: string;
  /** Halo's class code ("CHM-113-WF700A"): what Halo's own class cards show. */
  cc: string;
  slug: string;
  name: string;
  /** Halo's class grade, percent. */
  g: number | null;
  /** The class's color in Halo+ (the dot beside its code). */
  col?: string;
}

export interface HaloSnap {
  v: 1;
  at: string;
  syncedAt: string | null;
  /** 'free' when this plan has no Halo sync: the extension shows the pill only. */
  plan: 'sync' | 'free';
  show: boolean;
  showAt: string | null;
  tz: string;
  /** Now's do-now item. */
  top: string | null;
  /** Things announcements added that the assignments do not say, on work still open. */
  hidden: number;
  /** Participation posts left this week, as Now says it ("Participation this week: 3 left"); null when none is due. */
  pw: number | null;
  items: HaloSnapItem[];
  classes: HaloSnapClass[];
}

const DAY = 86_400_000;

/** Something to bring or have on hand: gear, a tool, materials. */
const BRING = /\b(bring|wear|have (?:your|a|an)|goggles|lab coat|closed[- ]toe|shoes|calculator|laptop|notebook|textbook|materials?|supplies|kit|charger|headphones|ID card|student ID|printed|hard copy|pencil|pen)\b/i;
/** A new thing to hand in or do for credit. */
const DELIVER = /\b(submit|upload|turn in|hand in|post|write|complete|attach|include|prepare|present|record|sign)\b/i;
/** Never worth a line on Halo's page by itself. */
const SOFT = /\b(review|re-?read|read|reading|study|watch|look over|remember|reminder|don'?t forget|be sure|keep in mind|check (?:out|your)|practice)\b/i;

/**
 * The few announcement requirements worth a line on the assignment's own Halo page (George, 2026-10-24): what to
 * bring or have, and a new graded deliverable. Never "review the readings" or a general reminder.
 */
export function boxWorthy(reqs: { text: string; gradedOn: boolean; scope?: string }[]): string[] {
  const out: string[] = [];
  for (const r of reqs) {
    const t = r.text.trim();
    const bring = BRING.test(t);
    const deliver = r.gradedOn && r.scope !== 'reference' && r.scope !== 'rule' && DELIVER.test(t) && !SOFT.test(t);
    if (bring || deliver) out.push(shortLine(t));
  }
  return out.slice(0, 6);
}

/** Halo's class code from its slug: "CHM-113-WF700A-20260908" → "CHM-113-WF700A". */
export const classCodeOf = (slug: string | null | undefined): string => (slug ?? '').replace(/-\d{8}$/, '');

export function haloSnap(input: { courses: Course[]; items: Item[]; settings: Settings; schedule: Schedule; canSync: boolean; now?: string }): HaloSnap {
  const now = input.now ?? new Date().toISOString();
  const tz = input.settings.timezone;
  const t = Date.parse(now);
  const today = dateOf(now, tz);
  const live = new Set(input.courses.map((c) => c.id));
  const work = input.items.filter((i) => live.has(i.courseId) && i.type !== 'participation' && i.dueAt);
  const keep = work.filter((i) => {
    const due = Date.parse(i.dueAt);
    // Done work in the window too (2026-10-24): it tells the extension "done" over its own Halo reading, which says
    // OVERDUE for an in-class quiz Halo has not graded yet.
    return due >= t - 3 * DAY && due <= t + 21 * DAY;
  });
  let hidden = 0;
  const items: HaloSnapItem[] = keep.map((i) => {
    const extras = (i.requirements ?? []).filter((r) => r.source?.kind === 'announcement' && !r.done);
    const open = !isWorkDone(i);
    if (open) hidden += extras.length + (i.origin?.kind === 'announcement' ? 1 : 0);
    const moved = i.dateChange && Date.parse(i.dateChange.at) > t - 14 * DAY ? i.dateChange.from : undefined;
    return {
      id: i.id,
      h: i.haloId ?? null,
      c: i.courseId,
      t: i.label || i.title,
      ...(i.title && i.title !== i.label ? { ht: i.title } : {}),
      due: new Date(i.dueAt).toISOString(),
      ...(i.source === 'halo' ? { hd: new Date(moved ?? i.dueAt).toISOString() } : {}),
      pts: i.points || 0,
      ty: i.type,
      done: open ? 0 : 1,
      x: open ? extras.length : 0,
      ...(open && extras.length ? { xs: extras.slice(0, 3).map((r) => shortLine(r.text)) } : {}),
      ...(moved ? { m: new Date(moved).toISOString() } : {}),
      ...(isParticipation(i) ? { pa: 1 as const } : {}),
      ...(noHaloSubmission(i) ? { ns: 1 as const } : {}),
      ...(open && boxWorthy(extras).length ? { xb: boxWorthy(extras) } : {}),
      ...(i.haloUnitId ? { u: i.haloUnitId } : {}),
      ...(i.haloType ? { hy: i.haloType } : {}),
    };
  });
  // Halo+'s do-now pick among graded work: participation never leads on Halo's pages.
  const top = rankItems(work.filter((i) => !isWorkDone(i) && !isParticipation(i) && (i.points || 0) > 0), input.schedule, now, tz)[0]?.id ?? null;
  const week = participationThisWeek(input.items.filter((i) => live.has(i.courseId)), input.courses, today, tz, now);
  return {
    v: 1,
    at: now,
    syncedAt: input.settings.lastPull?.at ?? null,
    plan: input.canSync ? 'sync' : 'free',
    show: input.settings.haloOnHalo !== false,
    showAt: input.settings.stamps?.haloOnHalo ?? null,
    tz,
    top,
    hidden,
    pw: week.length ? week.reduce((n, e) => n + e.left, 0) : null,
    items: items.sort((a, b) => a.due.localeCompare(b.due)),
    classes: input.courses.map((c) => ({ id: c.id, code: c.code, cc: classCodeOf(c.haloSlugId), slug: c.haloSlugId ?? '', name: c.name, g: c.haloGrade?.percent ?? null, ...(c.color ? { col: c.color } : {}) })),
  };
}
