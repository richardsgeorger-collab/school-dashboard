import { dateOf, fmtDate } from '../../domain/dates';
import type { Course, Item, Requirement } from '../../domain/types';

/**
 * Page 1 of the end of the free week (George, 2026-10-01): "Here's what Halo+ did for you", told as a few lines about
 * real things in the student's own week, the most impressive first. Pure, so every claim is tested.
 *
 * The rules: only claim what the data proves. "Only put in announcements" is said only when the assignment's own
 * description and brief do not already say it; "you knew before it mattered" only when the move was caught before
 * the old date; "on time for everything" only when every item due this week so far was handed in by its due time.
 * Never that the student would have missed something otherwise. A light week still gets something true and kind.
 */
export interface StoryInput {
  items: Item[];
  courses: Course[];
  /** The week: the free trial's start and end (or the admin preview's last 7 days). */
  since: string;
  until: string;
  now: string;
  tz: string;
  /** The server's counts for the week (my_trial_recap), with this device's as a floor. */
  recap: { asked: number; practice: number; read: number };
}

/** One line: text around an optional number that counts up, and up to two real examples under it. */
export interface StoryLine {
  key: string;
  score: number;
  before: string;
  n?: number;
  after: string;
  examples?: string[];
}

const STOP = new Set(['this', 'that', 'with', 'your', 'from', 'have', 'will', 'must', 'each', 'into', 'about', 'their', 'there', 'they', 'what', 'when', 'which', 'should', 'make', 'sure', 'post', 'class', 'week', 'before', 'after', 'least', 'more', 'than', 'only', 'also', 'need', 'needs', 'using', 'used', 'both', 'other']);
const words = (s: string): string[] => (s.toLowerCase().match(/[a-z0-9]{4,}/g) ?? []).filter((w) => !STOP.has(w));

/**
 * Whether the assignment itself already says this requirement: half or more of its meaningful words appear in the
 * assignment's description, title or brief. Conservative on purpose: when in doubt, it was in the assignment.
 */
export function inAssignment(req: Pick<Requirement, 'text'>, item: Pick<Item, 'notes' | 'title' | 'brief'>): boolean {
  const own = new Set(words([item.notes, item.title, ...(item.brief?.asks ?? [])].join(' ')));
  const w = [...new Set(words(req.text))];
  if (w.length === 0) return true;
  return w.filter((x) => own.has(x)).length / w.length >= 0.5;
}

const DAY = '(mon|tues?|wed(nes)?|thu(rs)?|fri|sat(ur)?|sun)(day)?|today|tonight|tomorrow|midnight|noon|\\d{1,2}(:\\d{2})?\\s?(am|pm)|\\d{1,2}/\\d{1,2}';
const DEADLINE = new RegExp(`\\b(by|before|due|until|no later than)\\b[^.]*\\b(${DAY})\\b|\\bbefore (lab|class|the exam|the quiz|you (submit|arrive))\\b`, 'i');
const RULE_WORDS = /^(avoid|do not|don't|don’t|never|always|no |cite|use |all )/i;

/**
 * How good a requirement is as an example (George, 2026-10-01): one with a deadline, a grade on it, or a thing to
 * do ("reply to 2 classmates by Sunday", "sign the lab safety waiver before lab") beats a standing class rule ("cite
 * AI content", "avoid Grammarly"). Above zero is an action; zero or below is a rule, shown only when nothing better.
 */
export function exampleRank(req: Pick<Requirement, 'text' | 'dueAt' | 'gradedOn' | 'scope'>): number {
  let r = 0;
  if (req.dueAt) r += 4;
  if (DEADLINE.test(req.text)) r += 3;
  if (req.scope === 'instance') r += 2;
  if (req.gradedOn && req.scope !== 'rule' && req.scope !== 'reference') r += 1;
  if (req.scope === 'rule' || req.scope === 'reference') r -= 5;
  else if (!req.scope && !req.dueAt && RULE_WORDS.test(req.text.trim())) r -= 3;
  return r;
}

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);
const listOf = (xs: string[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);

/** Things only an announcement said, put on the right assignment, since a moment: the count and up to three examples. */
export function announcementCatches(items: Item[], courses: Course[], since: string, until: string): { n: number; examples: string[] } {
  const inWeek = (at: string | null | undefined) => !!at && at >= since && at <= until;
  const code = (i: Item) => courses.find((c) => c.id === i.courseId)?.code ?? '';
  const found: { item: Item; req: Requirement }[] = [];
  for (const item of items) for (const req of item.requirements ?? []) if (req.source?.kind === 'announcement' && inWeek(req.addedAt) && !inAssignment(req, item)) found.push({ item, req });
  const ranked = found.map((f, i) => ({ f, i, r: exampleRank(f.req) })).sort((a, b) => b.r - a.r || a.i - b.i);
  const actions = ranked.filter((x) => x.r > 0);
  return { n: found.length, examples: (actions.length ? actions : ranked).slice(0, 3).map(({ f }) => `${code(f.item) ? `${code(f.item)}: ` : ''}${f.req.text.replace(/\.$/, '')}`) };
}

export const MAX_LINES = 4;

export function storyLines(input: StoryInput): StoryLine[] {
  const { items, courses, since, until, now, tz, recap } = input;
  const inWeek = (at: string | null | undefined) => !!at && at >= since && at <= until;
  const code = (i: Item) => courses.find((c) => c.id === i.courseId)?.code ?? '';
  const name = (i: Item) => (i.label || i.title).trim();
  const lines: StoryLine[] = [];

  // Things only an announcement said, put on the right assignment.
  const found: { item: Item; req: Requirement; only: boolean }[] = [];
  for (const item of items) for (const req of item.requirements ?? []) if (req.source?.kind === 'announcement' && inWeek(req.addedAt)) found.push({ item, req, only: !inAssignment(req, item) });
  const only = found.filter((f) => f.only);
  // Actions first; rules only when there is nothing better, and never padding out a real action.
  const shown = (fs: typeof found) => {
    const ranked = fs.map((f, i) => ({ f, i, r: exampleRank(f.req) })).sort((a, b) => b.r - a.r || a.i - b.i);
    const actions = ranked.filter((x) => x.r > 0);
    return (actions.length ? actions : ranked).slice(0, 2).map(({ f }) => `${code(f.item) ? `${code(f.item)}: ` : ''}${f.req.text.replace(/\.$/, '')}`);
  };
  if (only.length > 0) lines.push({ key: 'only', score: 95 + only.length, before: '', n: only.length, after: ` ${plural(only.length, 'thing your professors only put in an announcement', 'things your professors only put in announcements')}, Halo+ caught:`, examples: shown(only) });
  else if (found.length > 0) lines.push({ key: 'found', score: 70 + found.length, before: 'Halo+ put ', n: found.length, after: ` ${plural(found.length, 'instruction', 'instructions')} from announcements on the right assignment:`, examples: shown(found) });

  // A date an announcement moved.
  const moved = items.filter((i) => inWeek(i.dateChange?.at)).sort((a, b) => (b.dateChange!.at < a.dateChange!.at ? -1 : 1));
  if (moved.length > 0) {
    const m = moved[0];
    const from = dateOf(m.dateChange!.from, tz);
    const to = dateOf(m.dueAt, tz);
    const early = m.dateChange!.at < m.dateChange!.from && m.dateChange!.at < m.dueAt;
    const more = moved.length > 1 ? ` (and ${moved.length - 1} more ${plural(moved.length - 1, 'date', 'dates')})` : '';
    if (from !== to) lines.push({ key: 'moved', score: 88, before: `Your ${code(m) ? `${code(m)} ` : ''}${name(m)} moved from ${fmtDate(from)} to ${fmtDate(to)}${more}.`, after: early ? ' You knew before it mattered.' : '' });
  }

  // On time for everything due this week so far: handed in (Halo's own submission time when there is one) by the due time.
  const due = items.filter((i) => i.dueAt >= since && i.dueAt <= now && i.dueAt <= until);
  const handedIn = (i: Item) => {
    const at = i.halo?.submittedAt ?? i.completedAt;
    return i.status === 'done' && !!at && at <= i.dueAt && !i.haloLate;
  };
  if (due.length >= 2 && due.every(handedIn)) lines.push({ key: 'ontime', score: 80, before: 'On time for all ', n: due.length, after: ' things due this week.' });

  // Checked off.
  const checked = items.filter((i) => i.status === 'done' && inWeek(i.completedAt)).length;
  if (checked > 0) lines.push({ key: 'checked', score: 52 + Math.min(checked, 30), before: 'You checked off ', n: checked, after: ` ${plural(checked, 'assignment', 'assignments')} this week.` });

  // Practice, named when the test is known.
  const practiced = items.filter((i) => inWeek(i.practicedAt));
  if (practiced.length > 0) lines.push({ key: 'practice', score: 66, before: `Built practice for your ${listOf(practiced.slice(0, 2).map((i) => `${code(i) ? `${code(i)} ` : ''}${name(i)}`))}${practiced.length > 2 ? ` and ${practiced.length - 2} more` : ''}.`, after: '' });
  else if (recap.practice > 0) lines.push({ key: 'practice', score: 58, before: 'Built ', n: recap.practice, after: ` ${plural(recap.practice, 'study plan or practice set', 'study plans and practice sets')} from your own class material.` });

  if (recap.asked > 0) lines.push({ key: 'asked', score: 50 + Math.min(recap.asked, 20), before: 'Answered ', n: recap.asked, after: ` ${plural(recap.asked, 'question', 'questions')} about your classes.` });
  if (recap.read > 0) lines.push({ key: 'read', score: 45 + Math.min(recap.read, 10), before: 'Read ', n: recap.read, after: ` ${plural(recap.read, 'announcement', 'announcements')} for you, so you didn't have to dig.` });

  const synced = courses.filter((c) => c.haloSlugId).length;
  const fromHalo = items.filter((i) => i.source === 'halo').length;
  if (synced > 0 && fromHalo > 0) lines.push({ key: 'synced', score: 30, before: `Pulled all ${synced} of your classes and `, n: fromHalo, after: ` ${plural(fromHalo, 'assignment', 'assignments')} out of Halo into one place.` });

  lines.sort((a, b) => b.score - a.score);
  // Four at most, so the rating below them shows without scrolling on a laptop (George, 2026-10-01).
  if (lines.length > 0) return lines.slice(0, MAX_LINES);

  // A light week: still about them, still true.
  const classes = courses.length;
  return classes > 0
    ? [
        { key: 'light-classes', score: 1, before: 'Your ', n: classes, after: ` ${plural(classes, 'class lives', 'classes live')} in one place now.` },
        { key: 'light-next', score: 0, before: 'A quiet week. When the work picks up, Halo+ is already set up for it.', after: '' },
      ]
    : [{ key: 'light-start', score: 0, before: 'You took the first step this week. Sync Halo once and every due date lands in one place.', after: '' }];
}
