import { dateOf } from '../domain/dates';
import { rankItems } from '../domain/now';
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
  items: HaloSnapItem[];
  classes: HaloSnapClass[];
}

const DAY = 86_400_000;

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
    if (isWorkDone(i)) return dateOf(i.dueAt, tz) === today;
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
    };
  });
  const top = rankItems(work.filter((i) => !isWorkDone(i)), input.schedule, now, tz)[0]?.id ?? null;
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
    items: items.sort((a, b) => a.due.localeCompare(b.due)),
    classes: input.courses.map((c) => ({ id: c.id, code: c.code, cc: classCodeOf(c.haloSlugId), slug: c.haloSlugId ?? '', name: c.name, g: c.haloGrade?.percent ?? null })),
  };
}
