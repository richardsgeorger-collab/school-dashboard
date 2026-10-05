import { BADGES, badgeMoment, type BadgeId } from './badges';
import { bestDayMoment, classMilestoneMoment, CLEAR_MOMENT, doneLine, fasterMoment, gradeUpBody, gradedMoment, gradeUpMoment, streakMoment, syncMoment, termMoment, topicMoment, weekMoment, type JoyEvent } from './joy';
import { haloDoneLine, type JoySnap } from './extSnapshot';
import { wrapLine } from './wrap';

/**
 * Admin's Celebrations preview (2026-10-02). Each moment is a list of what to show, with sample data; nothing in
 * here reads or writes the planner, the account, storage or the network. The panel plays them through a sink that
 * can only show things (a toast, a burst, a ring, a level, a card, a line of push text), so a preview cannot give
 * XP, a streak, a badge or a "shown once" flag, or send a push. preview.test.ts holds it to that.
 */
export interface PreviewSink {
  /** A toast, card and/or confetti through the real JoyHost (the Celebrations switch is ignored). */
  say(e: JoyEvent): void;
  /** The check-off burst, where the button is. */
  burst(): void;
  /** The Now ring filling, then clear. */
  ring(): void;
  /** The top-bar halo at this level's step, and the level-up overlay (closing itself when `auto`). */
  level(n: number, overlay: boolean, auto: boolean): void;
  /** The Monday card, shown in the preview. */
  wrap(): void;
  /** The extension's confetti and card, over this page. */
  haloCard(text: string): void;
  /** What a push would say. Never sent. */
  push(title: string, body: string): void;
}

export interface Moment {
  id: string;
  group: string;
  label: string;
  /** What it shows, after the click. Returns about how long it takes, for Play all's pause. */
  play(s: PreviewSink, o: { auto: boolean }): number;
  /** Left out of Play all (a single level; the sweep covers them). */
  skipInAll?: boolean;
}

const TOAST_MS = 3600;
const CODE = 'CHM-113L';
const NAME = 'Introductory Chemistry Lab';

/** The extension card's sample: 22 of 200 points done, then this one's 50 → 36%. Same function the extension mirrors. */
export const SAMPLE_SNAP: JoySnap = { v: 1, celebrate: true, items: { 'sample-1': [50, '0', 0] }, classes: { '0': [CODE, 22, 200] } };
export const HALO_CARD_LINE = haloDoneLine(SAMPLE_SNAP, 'sample-1') as string;
export const SAMPLE_WRAP_LINE = wrapLine({ weekStart: '2026-09-21', weekEnd: '2026-09-27', turnedIn: 9, points: 620, best: true }, 'Last week') as string;
const GRADE_UP = { courseId: 'sample', code: 'CHM-113', percent: 91 };
const GRADE_LETTER = { courseId: 'sample', code: 'BIO-181', percent: 93, letter: 'A' };

const say = (e: JoyEvent, auto: boolean): JoyEvent => ({ ...e, preview: true, ...(e.card && auto ? { hold: 3200 } : {}) });
const toast = (id: string, group: string, label: string, e: () => JoyEvent): Moment => ({ id, group, label, play: (s, o) => (s.say(say(e(), o.auto)), TOAST_MS) });

export const MOMENTS: Moment[] = [
  { id: 'checkoff', group: 'Check-off', label: 'Check-off burst', play: (s, o) => (s.burst(), s.say(say({ text: doneLine(50, CODE, 34, 3), big: true }, o.auto)), TOAST_MS) },
  toast('sync', 'Sync', 'Sync celebration', () => syncMoment(3)),
  ...([25, 50, 75, 100] as const).map((m) => toast(`class-${m}`, 'Class milestones', m === 100 ? '100% · You finished' : `${m}%`, () => classMilestoneMoment(CODE, NAME, m, 640))),
  { id: 'ring', group: 'Now', label: 'Ring fills · clear for today', play: (s) => (s.ring(), 1400 + TOAST_MS) },
  ...[3, 7, 14, 30].map((d) => toast(`streak-${d}`, 'Streaks', `${d} days`, () => streakMoment(d))),
  ...[1, 2, 3, 4, 5, 6, 7, 8].map((n): Moment => ({ id: `level-${n}`, group: 'Level up', label: `Level ${n}`, skipInAll: true, play: (s, o) => (s.level(n, n > 1, o.auto), o.auto ? 1300 : 400) })),
  { id: 'levels', group: 'Level up', label: 'All 8 levels', play: (s) => { for (let n = 1; n <= 8; n++) setTimeout(() => s.level(n, n > 1, true), (n - 1) * 1400); return 8 * 1400; } },
  ...BADGES.map((b: BadgeId) => toast(`badge-${b}`, 'Badges', b === 'early_bird' ? 'Early bird' : b === 'no_late_week' ? 'No late work this week' : b === 'heavy_week' ? 'Survived a heavy week' : 'Clean sweep', () => badgeMoment(b))),
  { id: 'grade-up', group: 'Grades', label: 'Grade up + push', play: (s, o) => (s.say(say(gradeUpMoment(GRADE_UP), o.auto)), s.push('Grade up', gradeUpBody([GRADE_UP])), TOAST_MS) },
  { id: 'grade-letter', group: 'Grades', label: 'Grade up to a new letter', play: (s, o) => (s.say(say(gradeUpMoment(GRADE_LETTER), o.auto)), s.push('Grade up', gradeUpBody([GRADE_LETTER])), TOAST_MS) },
  toast('graded', 'Grades', 'Graded well', () => gradedMoment({ id: 'sample', label: 'Lab 3', score: 47, points: 50 })),
  toast('full-marks', 'Grades', 'Full marks', () => gradedMoment({ id: 'sample', label: 'Lab 3', score: 50, points: 50 })),
  toast('faster', 'Check-off', 'Faster than planned', () => fasterMoment(30, 60) as JoyEvent),
  ...[10, 25, 50, 100].map((n) => toast(`term-${n}`, 'This term', `${n} turned in`, () => termMoment(n))),
  toast('best-day', 'Records', 'Best day yet', () => bestDayMoment(6)),
  toast('week-cleared', 'The week', 'Week cleared', () => weekMoment(1)),
  toast('topic', 'Topics', 'Topic cleared', () => topicMoment('CHM-113', 'Topic 4')),
  { id: 'monday', group: 'The week', label: 'Monday "Last week" card', play: (s) => (s.wrap(), 3000) },
  { id: 'halo', group: 'Extension', label: 'Confetti on Halo', play: (s) => (s.haloCard(HALO_CARD_LINE), 4500) },
];

export const CLEAR = CLEAR_MOMENT;

/** Runs moments one after another with a pause; stops when `stopped()` says so. */
export async function playAll(sink: PreviewSink, stopped: () => boolean, wait: (ms: number) => Promise<void>, pause = 700, only: Moment[] = MOMENTS): Promise<void> {
  for (const m of only) {
    if (m.skipInAll) continue;
    if (stopped()) return;
    const ms = m.play(sink, { auto: true });
    await wait(ms + pause);
  }
}
