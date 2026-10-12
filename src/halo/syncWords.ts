import { dateOf, diffDays, fmtDate, fmtTime } from '../domain/dates';
import type { DateStr } from '../domain/types';

/**
 * When the last sync landed, the way a person says it (George, 2026-10-11): "just now", "5 min ago", "today 9:12 AM",
 * "yesterday 12:48 PM", "Oct 9 12:48 PM". Pure; the caller ticks `now` so it stays true while the page is open.
 */
export function relTime(at: string, now: number, tz: string, today: DateStr): string {
  const t = Date.parse(at);
  if (!Number.isFinite(t)) return '';
  const mins = Math.floor((now - t) / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const k = diffDays(dateOf(at, tz), today);
  if (k <= 0) return `today ${fmtTime(at, tz)}`;
  if (k === 1) return `yesterday ${fmtTime(at, tz)}`;
  return `${fmtDate(dateOf(at, tz), 'short')} ${fmtTime(at, tz)}`;
}

/** Why a Sync now did not land, in plain words, with the next step. Kinds are the extension's (0.6.5). */
export function failWords(kind: string | null, why: string | null): { text: string; halo: boolean } {
  switch (kind) {
    case 'logged-out':
      return { text: "Halo isn't logged in on this computer. Log in at halo.gcu.edu, then try again.", halo: true };
    case 'move':
      return { text: 'This Halo account is linked to another Halo+ account. Use the Move prompt on this page to bring it here.', halo: false };
    case 'foreign':
      return { text: why ? `${why.replace(/\.$/, '')}.` : 'This Halo account belongs to another Halo+ account.', halo: false };
    case 'stalled':
      return { text: 'Halo stopped answering partway through. Try again in a minute.', halo: false };
    case 'no-classes':
      return { text: 'Halo showed no classes. Open Halo to check your classes are there, then try again.', halo: true };
    case 'offline':
      return { text: "No connection right now, so the sync couldn't reach your account. It goes in when you're back online, or try again.", halo: false };
    case 'no-key':
      return { text: "The extension doesn't know your account yet. Keep this page open a moment, then try again.", halo: false };
    default: {
      // The extension's own sentence, trimmed to the reason: "Read Halo at 4:52 PM, but it did not reach your account: X. It is kept here; …"
      const core = why ? why.replace(/^Read Halo at [^,]+, but (it did not reach your account: )?/, '').replace(/\s*It is kept here[^]*$/, '').replace(/\.$/, '').trim() : '';
      return { text: core ? `The sync didn't reach your account: ${core}. Try again.` : "The sync didn't reach your account. Try again.", halo: false };
    }
  }
}

/** A Sync now that heard nothing for this long has failed, whatever else is true. */
export const SYNC_TIMEOUT_MS = 120_000;
