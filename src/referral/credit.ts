import { dateOf, fmtDate } from '../domain/dates';

/** A queued or running reward window, as my_referrals returns it. */
export interface CreditGrant {
  tier: string;
  starts: string;
  ends: string;
  source: string;
}

export interface PlusCredit {
  start: string;
  end: string;
  days: number;
  running: boolean;
  /** What it waits for: the free week, Max from a friend link, a paid plan that is ending, or nothing. */
  after: 'trial' | 'gift' | 'paid' | null;
  /** Whose invite it came from: this student was invited, invited others, or both. */
  from: 'invited' | 'inviting' | 'both';
}

const near = (a: string | null | undefined, b: string, ms = 36 * 3_600_000) => !!a && Math.abs(Date.parse(a) - Date.parse(b)) < ms;

/**
 * The student's Plus credit from invites as one stretch (George, 2026-09-30): every 30-day block that follows the
 * last one without a gap counts, so two friends read as 60 days, never as the first 30 alone.
 */
export function plusCredit(grants: CreditGrant[], p: { trialEndsAt: string | null; rewardTier: string | null; rewardUntil: string | null }, now: string): PlusCredit | null {
  const plus = grants.filter((g) => g.tier === 'plus' && Date.parse(g.ends) > Date.parse(now)).sort((a, b) => a.starts.localeCompare(b.starts));
  if (plus.length === 0) return null;
  const chain = [plus[0]];
  for (const g of plus.slice(1)) {
    if (Date.parse(g.starts) - Date.parse(chain[chain.length - 1].ends) > 60_000) break;
    chain.push(g);
  }
  const start = chain[0].starts;
  const end = chain[chain.length - 1].ends;
  const running = Date.parse(start) <= Date.parse(now);
  const invited = chain.some((g) => g.source === 'referral:invitee');
  const inviting = chain.some((g) => g.source !== 'referral:invitee');
  const days = Math.round((Date.parse(end) - Date.parse(running ? now : start)) / 86_400_000);
  const after = running ? null : near(p.trialEndsAt, start) ? 'trial' : p.rewardTier === 'max' && near(p.rewardUntil, start) ? 'gift' : Date.parse(start) - Date.parse(now) > 3_600_000 ? 'paid' : null;
  return { start, end, days, running, after, from: invited && inviting ? 'both' : invited ? 'invited' : 'inviting' };
}

const WHY = { trial: 'when your Max week ends', gift: 'when your free Max ends', paid: 'when your paid plan ends' } as const;

/** "Plus credit: 30 days, starts Oct 7 when your Max week ends." One line, the same on You and in the trial sheet. */
export function creditLine(c: PlusCredit, tz: string): string {
  const day = (iso: string) => fmtDate(dateOf(iso, tz), 'short');
  if (c.running) return `Plus credit: on now, ${c.days} day${c.days === 1 ? '' : 's'} left, until ${day(c.end)}.`;
  const why = c.after ? ` ${WHY[c.after]}` : '';
  return `Plus credit: ${c.days} days, starts ${day(c.start)}${why}${c.days > 31 ? `, through ${day(c.end)}` : ''}.`;
}

/** Where it came from, for the line under it. */
export function creditSource(c: PlusCredit): string {
  return c.from === 'invited' ? "From your friend's invite." : c.from === 'inviting' ? 'For the friends you invited.' : "From your friend's invite and the friends you invited.";
}
