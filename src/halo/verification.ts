import { dateOf, diffDays } from '../domain/dates';
import { classWords } from '../domain/pace';
import type { Course, DateStr, HaloCheckRecord, Item } from '../domain/types';

export const MAX_CHECKS = 120;
export const STALE_DAYS = 10;
/** A week without any check anywhere, and the line on Now turns into the nudge. */
export const NUDGE_DAYS = 7;

export function checkDue(list: HaloCheckRecord[] | undefined, today: DateStr, tz: string): boolean {
  const last = [...(list ?? [])].sort((a, b) => a.at.localeCompare(b.at)).at(-1);
  if (!last) return true;
  return diffDays(dateOf(last.at, tz), today) >= NUDGE_DAYS;
}

export function recordCheck(list: HaloCheckRecord[] | undefined, rec: HaloCheckRecord): HaloCheckRecord[] {
  return [...(list ?? []), rec].slice(-MAX_CHECKS);
}

export const checksFor = (list: HaloCheckRecord[] | undefined, courseId: string): HaloCheckRecord[] => (list ?? []).filter((c) => c.courseId === courseId);
export const lastCheckFor = (list: HaloCheckRecord[] | undefined, courseId: string): HaloCheckRecord | null => checksFor(list, courseId).at(-1) ?? null;

/** Trailing run of clean checks, for one class or across everything. */
export function cleanStreak(list: HaloCheckRecord[] | undefined, courseId?: string): number {
  let n = 0;
  for (const c of [...(courseId ? checksFor(list, courseId) : (list ?? []))].reverse()) {
    if (!c.clean) break;
    n++;
  }
  return n;
}

export type VerifyState = 'never' | 'partial' | 'findings' | 'clean';

export interface ClassVerification {
  course: Course;
  word: string;
  last: HaloCheckRecord | null;
  days: number | null;
  state: VerifyState;
  stale: boolean;
  streak: number;
}

const RANK: Record<VerifyState, number> = { never: 0, partial: 1, clean: 2, findings: 2 };

/** Where each class stands, weakest first: never checked, then partial, then the oldest. */
export function classVerifications(list: HaloCheckRecord[] | undefined, courses: Course[], items: Item[], today: DateStr, tz: string): ClassVerification[] {
  const words = classWords(courses, items);
  const out = courses.map((course) => {
    const last = lastCheckFor(list, course.id);
    const days = last ? Math.max(0, diffDays(dateOf(last.at, tz), today)) : null;
    const state: VerifyState = !last ? 'never' : last.partial ? 'partial' : last.clean ? 'clean' : 'findings';
    return { course, word: words.get(course.id) ?? course.code, last, days, state, stale: days === null || days > STALE_DAYS, streak: cleanStreak(list, course.id) };
  });
  return out.sort((a, b) => RANK[a.state] - RANK[b.state] || (b.days ?? Infinity) - (a.days ?? Infinity));
}

export interface VerificationLine {
  text: string;
  /** quiet when every class is recent and complete, amber when the weakest is never, partial, or past ten days. */
  level: 'quiet' | 'amber';
}

const when = (days: number | null) => (days === null ? 'never' : days <= 0 ? 'today' : days === 1 ? 'yesterday' : `${days} days ago`);
const skippedNote = (r: HaloCheckRecord | null) => {
  const n = r?.skipped?.length ?? 0;
  if (n) return `, ${n} page${n === 1 ? '' : 's'} skipped`;
  if (r?.coverage && r.coverage.visited < r.coverage.planned) return `, ${r.coverage.visited} of ${r.coverage.planned} pages`;
  return '';
};
const describe = (v: ClassVerification) => {
  switch (v.state) {
    case 'never':
      return `${v.word} never checked`;
    case 'partial':
      return `${v.word} partial ${when(v.days)}${skippedNote(v.last)}`;
    case 'findings':
      return `${v.word} verified ${when(v.days)} (${v.last!.findings} finding${v.last!.findings === 1 ? '' : 's'}, reviewed)`;
    default:
      return `${v.word} verified ${when(v.days)}`;
  }
};

/** The one line on Now: the most recent check and the weakest class, never an average. */
export function verificationLine(list: HaloCheckRecord[] | undefined, courses: Course[], items: Item[], today: DateStr, tz: string): VerificationLine {
  const vs = classVerifications(list, courses, items, today, tz);
  if (vs.length === 0) return { text: 'No classes yet.', level: 'quiet' };
  const checked = vs.filter((v) => v.last);
  if (checked.length === 0) return { text: 'No class verified against Halo yet.', level: 'amber' };
  const weakest = vs[0];
  const recent = [...checked].sort((a, b) => (a.days ?? 0) - (b.days ?? 0) || b.last!.at.localeCompare(a.last!.at))[0];
  const amber = weakest.state === 'never' || weakest.state === 'partial' || weakest.stale;
  if (!amber) {
    const oldest = Math.max(...checked.map((v) => v.days ?? 0));
    if (vs.length === 1) return { text: `${describe(recent)} — ${recent.state === 'clean' ? 'clean.' : 'reviewed.'}`, level: 'quiet' };
    return { text: `All ${vs.length} classes verified ${oldest <= 0 ? 'today' : `within ${oldest} day${oldest === 1 ? '' : 's'}`}.`, level: 'quiet' };
  }
  if (recent.course.id === weakest.course.id) return { text: `${describe(weakest)}.`, level: 'amber' };
  return { text: `${describe(recent)} · ${describe(weakest)}`, level: 'amber' };
}
