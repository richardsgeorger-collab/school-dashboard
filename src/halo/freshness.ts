import { dateOf, diffDays } from '../domain/dates';
import type { Course, DateStr, HaloPull, Settings } from '../domain/types';
import type { HaloExport } from './types';

/**
 * One click is the whole ritual, so the app has to know what that click actually brought back. A class with no pull
 * is not a class with nothing due, and it never gets to look like one.
 */
export const STALE_DAYS = 2;

const list = (xs: string[]) => (xs.length <= 1 ? xs.join('') : xs.length === 2 ? `${xs[0]} and ${xs[1]}` : `${xs.slice(0, -1).join(', ')}, and ${xs.at(-1)}`);

export type PullKind = keyof HaloPull;
export const PULL_WORDS: Record<PullKind, string> = { assessments: 'assignments', grades: 'grades', announcements: 'announcements', rubrics: 'rubrics', feedback: 'instructor feedback', resources: 'class resources' };

/** What the export carried, per class, recorded as of `now`. Only what actually arrived is stamped. */
export function pullsFrom(payload: HaloExport, courseIdOf: (classId: string, courseCode: string) => string | null, previous: Record<string, HaloPull> | undefined, now: string): Record<string, HaloPull> {
  const out: Record<string, HaloPull> = { ...(previous ?? {}) };
  for (const c of payload.classes) {
    const id = courseIdOf(c.id, c.courseCode);
    if (!id) continue;
    const prev = out[id] ?? {};
    out[id] = {
      assessments: c.assessments.length > 0 ? now : (prev.assessments ?? null),
      // A class can genuinely have no grades yet, so the pull itself is what is stamped.
      grades: c.assessments.some((a) => a.score !== null || a.status !== null) ? now : (prev.grades ?? null),
      // Undefined means the bookmark did not ask; an empty array means it asked and there were none.
      announcements: c.announcements !== undefined ? now : (prev.announcements ?? null),
      rubrics: c.assessments.some((a) => a.rubric !== undefined) ? now : (prev.rubrics ?? null),
      feedback: c.assessments.some((a) => a.feedback !== undefined) ? now : (prev.feedback ?? null),
      resources: c.resources !== undefined ? now : (prev.resources ?? null),
    };
  }
  return out;
}

export interface Staleness {
  /** Classes never pulled at all. */
  never: Course[];
  /** Per kind, the classes whose newest pull of it is older than the bar. */
  stale: { kind: PullKind; courses: Course[]; days: number }[];
}

export function staleness(courses: Course[], settings: Pick<Settings, 'haloPulls' | 'timezone'>, today: DateStr, bar = STALE_DAYS): Staleness {
  const pulls = settings.haloPulls ?? {};
  const never: Course[] = [];
  const byKind = new Map<PullKind, { courses: Course[]; days: number }>();
  for (const c of courses) {
    const p = pulls[c.id];
    if (!p || (!p.assessments && !p.grades && !p.announcements)) {
      never.push(c);
      continue;
    }
    for (const kind of ['assessments', 'grades', 'announcements', 'rubrics', 'feedback', 'resources'] as PullKind[]) {
      const at = p[kind];
      const days = at ? diffDays(dateOf(at, settings.timezone), today) : Infinity;
      if (days <= bar) continue;
      const row = byKind.get(kind) ?? { courses: [], days: 0 };
      row.courses.push(c);
      row.days = Math.max(row.days, Number.isFinite(days) ? days : 0);
      byKind.set(kind, row);
    }
  }
  return { never, stale: [...byKind.entries()].map(([kind, v]) => ({ kind, ...v })) };
}


/** One quiet line naming what is out of date, or null when everything was pulled recently. */
export function stalenessLine(s: Staleness, total: number): string | null {
  if (s.never.length === total && total > 0) return 'No class has been synced from Halo yet, so this is only what was imported.';
  if (s.never.length > 0) return `${list(s.never.map((c) => c.code))} ${s.never.length === 1 ? 'has' : 'have'} never been synced from Halo, so nothing here is the whole picture for ${s.never.length === 1 ? 'it' : 'them'}.`;
  if (s.stale.length === 0) return null;
  const worst = [...s.stale].sort((a, b) => b.days - a.days)[0];
  const others = s.stale.length - 1;
  return `${PULL_WORDS[worst.kind].charAt(0).toUpperCase()}${PULL_WORDS[worst.kind].slice(1)} for ${list(worst.courses.map((c) => c.code))} are ${worst.days} days old${others > 0 ? `, and ${others} other kind${others === 1 ? '' : 's'} of data too` : ''}.`;
}

/**
 * What this pull could not read, in one sentence. The sync succeeding is not the same as the sync being complete,
 * and a class whose announcements call failed must not be presented as a class with no announcements.
 */
export function problemLine(payload: Pick<HaloExport, 'problems'>): string | null {
  const ps = payload.problems ?? [];
  if (ps.length === 0) return null;
  const byKind = new Map<string, Set<string>>();
  for (const p of ps) {
    const set = byKind.get(p.kind) ?? new Set<string>();
    if (p.klass) set.add(p.klass);
    byKind.set(p.kind, set);
  }
  const parts = [...byKind.entries()].map(([kind, courses]) => (courses.size === 0 ? kind : `${kind} for ${list([...courses].sort())}`));
  return `Halo would not give up ${list(parts)}. Everything else came through, and this is still missing rather than empty.`;
}

/**
 * A bookmarklet is a URL frozen in the bookmarks bar the moment it was saved. Deploying new code does not update it,
 * so an old bookmark quietly pulls the three queries it knew about and the payload simply has no room for the rest.
 * That is indistinguishable from eleven failures unless the build is stamped, which is why it is.
 */
export function staleBookmarkLine(payload: Pick<HaloExport, 'build' | 'pulls'>, current: string): string | null {
  if (payload.build === current) return null;
  const known = payload.pulls?.length ?? 0;
  const had = payload.build ? `built ${payload.build}` : 'saved before builds were stamped';
  return `This came from an older copy of the Halo bookmark, ${had}. It pulled ${known > 0 ? `only ${known} kinds of data` : 'assignments and grades only'}. Open Settings, Halo and drag the bookmark to your bar again to replace it, then sync once more.`;
}


export interface ProblemGroup {
  /** The distinct failure: one operation, one status, one set of messages. */
  op: string | null;
  status: number | null;
  kind: string;
  errors: string[];
  sent: string | null;
  missingField: string | null;
  /** Course codes that hit it. Empty when the call was not per class. */
  courses: string[];
}

/**
 * The same failure across six classes is one problem, not six. Grouped by what Halo actually said, because
 * "Cannot query field X" and "Variable $Y of required type" need different fixes and the summary line hides which.
 */
export function problemGroups(payload: Pick<HaloExport, 'problems'>): ProblemGroup[] {
  const out = new Map<string, ProblemGroup>();
  for (const p of payload.problems ?? []) {
    const errors = p.errors?.length ? p.errors : [p.message];
    const key = [p.op ?? '', p.status ?? '', p.kind, errors.join('|'), p.missingField ?? ''].join(' ');
    const row = out.get(key) ?? { op: p.op ?? null, status: p.status ?? null, kind: p.kind, errors, sent: p.sent ?? null, missingField: p.missingField ?? null, courses: [] };
    if (p.klass && !row.courses.includes(p.klass)) row.courses.push(p.klass);
    out.set(key, row);
  }
  return [...out.values()].map((r) => ({ ...r, courses: r.courses.sort() }));
}
