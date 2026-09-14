import { dateOf, diffDays } from '../domain/dates';
import type { DateStr, HaloCheckRecord } from '../domain/types';

export const MAX_CHECKS = 30;
export const STALE_DAYS = 10;

export function recordCheck(list: HaloCheckRecord[] | undefined, rec: HaloCheckRecord): HaloCheckRecord[] {
  return [...(list ?? []), rec].slice(-MAX_CHECKS);
}

/** Trailing run of clean checks. */
export function cleanStreak(list: HaloCheckRecord[] | undefined): number {
  let n = 0;
  for (const c of [...(list ?? [])].reverse()) {
    if (!c.clean) break;
    n++;
  }
  return n;
}

export interface VerificationLine {
  text: string;
  /** quiet when recent, amber past ten days or never. */
  level: 'quiet' | 'amber';
}

/** The one line on Now: when Halo was last checked and how it went. */
export function verificationLine(list: HaloCheckRecord[] | undefined, today: DateStr, tz: string): VerificationLine {
  const last = list?.at(-1);
  if (!last) return { text: 'Not yet verified against Halo.', level: 'amber' };
  const days = diffDays(dateOf(last.at, tz), today);
  const when = days <= 0 ? 'today' : days === 1 ? 'yesterday' : `${days} days ago`;
  const how = last.clean ? 'clean.' : `${last.findings} finding${last.findings === 1 ? '' : 's'}, reviewed.`;
  return { text: `Verified against Halo ${when} — ${how}`, level: days > STALE_DAYS ? 'amber' : 'quiet' };
}
