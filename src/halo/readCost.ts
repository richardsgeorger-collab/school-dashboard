/**
 * What reading announcements costs. One post is a short prompt against a cached prefix, so a sync is usually cents;
 * a first run over a whole term's backlog is not, and a number the student sees only afterwards is no use.
 */

/** Measured from real runs: roughly this per post, all in. */
export const COST_PER_POST = 0.006;

/** Above this many posts, say the estimate and ask before spending. */
export const CONFIRM_ABOVE = 25;

export const estimateCost = (posts: number): number => posts * COST_PER_POST;

/** Dollars, at the precision a student cares about. */
export function money(n: number): string {
  if (n <= 0) return '$0.00';
  if (n < 0.01) return 'under a cent';
  return `$${n.toFixed(2)}`;
}

export const needsConfirming = (posts: number): boolean => posts > CONFIRM_ABOVE;

/** The sentence shown before a large run. */
export const confirmLine = (posts: number): string =>
  `${posts} announcements have never been read for requirements. Reading them costs about ${money(estimateCost(posts))}.`;

export interface ReadGuard {
  ask: boolean;
  line: string;
}

/**
 * Whether to stop and ask before reading. Two tripwires: a large run by count, and a run that would read more than
 * half of everything on file. The second is the one that catches a lost ledger, because a healthy sync only ever
 * reads what is new. The sentence says how many were never read and how many changed, so a run that looks like a
 * backlog but is really a re-read cannot pass as one.
 */
export function readGuard(args: { todo: number; onFile: number; fresh: number; edited: number }): ReadGuard {
  const { todo, onFile, fresh, edited } = args;
  const most = onFile >= 6 && todo > onFile / 2;
  const big = todo > CONFIRM_ABOVE;
  if (!most && !big) return { ask: false, line: '' };
  const why = [fresh ? `${fresh} never read` : '', edited ? `${edited} changed since they were read` : ''].filter(Boolean).join(', ');
  const share = most ? ` That is ${todo} of the ${onFile} on file, more than half, which a normal sync never needs.` : '';
  return { ask: true, line: `About to read ${todo} announcement${todo === 1 ? '' : 's'} (${why}), about ${money(estimateCost(todo))}.${share}` };
}
