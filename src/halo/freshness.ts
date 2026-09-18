import { dateOf, diffDays } from '../domain/dates';
import type { Course, DateStr, HaloPull, Settings } from '../domain/types';
import type { HaloExport } from './types';

/**
 * One click is the whole ritual, so the app has to know what that click actually brought back. A class with no pull
 * is not a class with nothing due, and it never gets to look like one.
 */
export const STALE_DAYS = 2;

export type PullKind = keyof HaloPull;
export const PULL_WORDS: Record<PullKind, string> = { assessments: 'assignments', grades: 'grades', announcements: 'announcements' };

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
    for (const kind of ['assessments', 'grades', 'announcements'] as PullKind[]) {
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

const list = (xs: string[]) => (xs.length <= 1 ? xs.join('') : xs.length === 2 ? `${xs[0]} and ${xs[1]}` : `${xs.slice(0, -1).join(', ')}, and ${xs.at(-1)}`);

/** One quiet line naming what is out of date, or null when everything was pulled recently. */
export function stalenessLine(s: Staleness, total: number): string | null {
  if (s.never.length === total && total > 0) return 'No class has been synced from Halo yet, so this is only what was imported.';
  if (s.never.length > 0) return `${list(s.never.map((c) => c.code))} ${s.never.length === 1 ? 'has' : 'have'} never been synced from Halo, so nothing here is the whole picture for ${s.never.length === 1 ? 'it' : 'them'}.`;
  if (s.stale.length === 0) return null;
  const worst = [...s.stale].sort((a, b) => b.days - a.days)[0];
  const others = s.stale.length - 1;
  return `${PULL_WORDS[worst.kind].charAt(0).toUpperCase()}${PULL_WORDS[worst.kind].slice(1)} for ${list(worst.courses.map((c) => c.code))} are ${worst.days} days old${others > 0 ? `, and ${others} other kind${others === 1 ? '' : 's'} of data too` : ''}.`;
}
