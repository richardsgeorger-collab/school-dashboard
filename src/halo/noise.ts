/** Agent narration and tool chatter: lines that carry no finding and no coverage fact. */
const NARRATION =
  /^(used claude in chrome|clicked|navigated|scrolled|reading|opening|opened|checking|checked|looking|let me|i'll|i will|i'm|i am|i (have|audited|opened|read|checked|visited|went|found|listed|expanded|scrolled|see|confirmed)|now (i|let|checking|moving|on)|next,?|moving (on|to)|starting|done with|finished|here (is|are)|this class|okay|ok,|good[,.]|great[,.]|all (of the|the) (pages|topics)|nothing (new|else|different) (here|on this page|in this)|no (new|other) (items|findings|differences)|that('s| is) (all|it|everything|the last)|continuing|proceeding|the (page|class) (loaded|shows)|expanding|visiting|going to|compiling|summary:?$)/i;
/** Narration that is noise whatever else it mentions. */
const STRONG = /^(used claude in chrome|no (new|other) (items|findings|differences|due-date)|nothing else\b|moving (on|to)\b|starting phase|that('s| is) the last|opened halo|your planner (has|had) no items|the (one|two|three|things?) that (actually )?matters?|everything else,?|compiling|summary of (what|findings)|here('s| is) (what|the))/i;
/** Something a finding line would carry: a date, a point value, or a score. Narration that carries one is kept as possible content. */
export const CONTENT = /\b\d{1,2}\/\d{1,2}(\/\d{2,4})?\b|\d{4}-\d{2}-\d{2}|\b\d+(\.\d+)?\s*(pts?|points?)\b|\b\d+(\.\d+)?\s*\/\s*\d+(\.\d+)?\b|\b(due|overdue|late|missing|unsubmitted)\b/i;
/** A page name from a coverage plan. */
export const PAGE_NAME =
  /^[-•*]?\s*(\d+(-\d+)?\.\s*)?(topic|module|week|unit|gradebook|grades?|announcements?|syllabus|course (materials|resources|home)|class (home|calendar|policies|questions|resources)|classroom policies|full class calendar|resources|home(page)?|calendar|library|mission statement|doctrinal statement|student (success center|ai resources)|learning support|institution resources|discussion forums?|assignments?|quizzes|files|people|attendance|groups)\b/i;

export const isNoiseLine = (line: string): boolean => {
  const l = line.trim();
  if (!l || /^[-=_*#~.\s]+$/.test(l)) return true;
  if (/\(\d+ actions?\)/i.test(l)) return true;
  if (CONTENT.test(l)) return false;
  if (STRONG.test(l)) return true;
  return NARRATION.test(l);
};

export const isPageNameLine = (line: string): boolean => PAGE_NAME.test(line.trim()) && line.trim().length < 200 && !/\|/.test(line);

/** A coverage fact in any wording: a class's visited-of-planned count, or a note about the whitelisted skips. */
export const isCoverageLine = (line: string): boolean => /\bvisited\s+\d+\s+(of|\/)\s+\d+/i.test(line) || /^(coverage|visited|stopped|final coverage|all match|end of findings|skipped|not visited)\b/i.test(line.trim()) || (/\bskipped\b/i.test(line) && /\b(generic|institution resources|university-wide)\b/i.test(line));
