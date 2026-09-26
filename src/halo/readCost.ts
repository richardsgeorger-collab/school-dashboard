/**
 * What reading announcements costs. One post is a short prompt against a cached prefix, so a sync is usually cents;
 * a first run over a whole term's backlog is not, and a number the student sees only afterwards is no use.
 */

/** Measured from real runs: roughly this per post, all in. */
export const COST_PER_POST = 0.006;

/**
 * Above this many posts, say the estimate and ask before spending. High on purpose: a whole term's backlog is
 * fifty or sixty posts, about thirty cents, and a rule that stopped at that size stopped every first sync.
 */
export const CONFIRM_ABOVE = 150;

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
 * Whether to stop and ask before reading. One tripwire: a run that would cost real money (over about a dollar).
 *
 * There used to be a second one, "more than half of what is on file", meant to catch a lost ledger. Real data
 * showed what it did instead: a student's first sync carried 58 posts, 56 unread, so every sync stopped at the
 * question, the question lived inside a review sheet that was closed, and not one announcement was ever read
 * (the server-side usage log for the account was empty). The ledger is now healed and fail-closed elsewhere, and
 * a full re-read of a term costs thirty cents, so the sentence stays and the tripwire goes.
 */
export const ASK_ABOVE_USD = 1;

export function readGuard(args: { todo: number; onFile: number; fresh: number; edited: number }): ReadGuard {
  const { todo, fresh, edited } = args;
  const cost = estimateCost(todo);
  if (cost <= ASK_ABOVE_USD && todo <= CONFIRM_ABOVE) return { ask: false, line: '' };
  const why = [fresh ? `${fresh} never read` : '', edited ? `${edited} changed since they were read` : ''].filter(Boolean).join(', ');
  return { ask: true, line: `About to read ${todo} announcement${todo === 1 ? '' : 's'} (${why}), about ${money(cost)}.` };
}
