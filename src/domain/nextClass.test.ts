import { describe, expect, it } from 'vitest';
import { nextClassPrep, nextMeeting } from './nextClass';
import { computeSchedule } from './schedule';
import { DEFAULT_FLAGS, DEFAULT_SETTINGS, type Course, type Item } from './types';

const TZ = 'America/Phoenix';
const TERM = { start: '2026-09-08', end: '2026-12-20' };
let n = 0;
function item(over: Partial<Item>): Item {
  n += 1;
  return {
    id: over.id ?? `i${n}`,
    courseId: 'esg',
    title: `Item ${n}`,
    label: `Eng Math Review ${n}`,
    labelOverridden: false,
    type: 'homework',
    points: 25,
    opensAt: null,
    dueAt: '2026-09-13T23:59:00-07:00',
    estimatedMinutes: 120,
    estimateOverridden: false,
    startByOverride: null,
    status: 'todo',
    completedAt: null,
    score: null,
    notes: '',
    topic: null,
    flags: { ...DEFAULT_FLAGS },
    source: 'parsed',
    award: null,
    updatedAt: '',
    ...over,
  };
}
const course = (id: string, code: string, meetings: Course['meetings'], online = false): Course => ({
  id,
  code,
  name: code,
  color: '#000',
  credits: 3,
  instructors: [],
  meetings,
  online,
  termStart: TERM.start,
  termEnd: TERM.end,
  updatedAt: '',
});
const esg = course('esg', 'ESG-162', [{ day: 2, start: '07:00', end: '08:15' }, { day: 4, start: '07:00', end: '08:15' }]);
const chm = course('chm', 'CHM-113', [{ day: 3, start: '07:00', end: '08:15' }, { day: 5, start: '07:00', end: '08:15' }]);
const lab = course('lab', 'CHM-113L', [{ day: 1, start: '18:00', end: '20:50' }]);
const unv = course('unv', 'UNV-106', [], true);
const courses = [esg, chm, lab, unv];

describe('nextMeeting', () => {
  it('finds the next meeting after now across courses, skipping online ones', () => {
    // Wed Sep 9 12:00: CHM met at 7 this morning; next is ESG Thu 7:00
    const m = nextMeeting(courses, '2026-09-09T12:00:00-07:00', TZ)!;
    expect(m.course.code).toBe('ESG-162');
    expect(m.day).toBe('2026-09-10');
    expect(m.startAt).toBe('2026-09-10T07:00:00-07:00');
  });
  it('returns a meeting later today when one is still ahead', () => {
    const m = nextMeeting(courses, '2026-09-09T06:00:00-07:00', TZ)!;
    expect(m.course.code).toBe('CHM-113');
    expect(m.day).toBe('2026-09-09');
  });
  it('treats a meeting in progress as current, not next', () => {
    const m = nextMeeting(courses, '2026-09-09T07:30:00-07:00', TZ)!;
    expect(m.course.code).toBe('ESG-162');
  });
  it('returns null outside the term or with no meetings', () => {
    expect(nextMeeting([unv], '2026-09-09T12:00:00-07:00', TZ)).toBeNull();
    expect(nextMeeting(courses, '2026-12-21T12:00:00-07:00', TZ)).toBeNull();
  });
});

describe('nextClassPrep', () => {
  const NOW = '2026-09-09T12:00:00-07:00';
  const TODAY = '2026-09-09';
  const meeting = nextMeeting(courses, NOW, TZ)!; // ESG Thu Sep 10 07:00
  const prep = (items: Item[], nudges: { key: string; itemId: string; day: string; label: string; minutes: number }[] = []) =>
    nextClassPrep(meeting, items, computeSchedule(items, DEFAULT_SETTINGS, TODAY, TERM, NOW), nudges, TODAY, TZ);

  it('says nothing to prep when that class has nothing due soon', () => {
    const far = item({ dueAt: '2026-09-27T23:59:00-07:00' });
    const other = item({ courseId: 'chm', dueAt: '2026-09-10T23:59:00-07:00' });
    expect(prep([far, other])).toEqual({ text: 'Nothing to prep.', item: null, nudge: null, inferred: false });
  });

  it('names an item due shortly after the class and suggests starting', () => {
    const rev = item({ id: 'rev', label: 'Eng Math Review 1', dueAt: '2026-09-13T23:59:00-07:00', estimatedMinutes: 120 });
    const r = prep([rev]);
    expect(r.item?.id).toBe('rev');
    expect(r.text).toBe('Eng Math Review 1 is due Sunday — ~2h. Worth starting tonight.');
  });

  it('flags an in-class item as prep for that meeting', () => {
    const quiz = item({ id: 'q', label: 'Eng Math Quiz 1', type: 'quiz', dueAt: '2026-09-10T08:00:00-07:00', estimatedMinutes: 120, flags: { ...DEFAULT_FLAGS, inClass: true } });
    expect(prep([quiz]).text).toBe('Eng Math Quiz 1 is in class — ~2h of prep tonight.');
  });

  it('flags something due before the class', () => {
    const hw = item({ id: 'hw', label: 'Eng Math HW 1', dueAt: '2026-09-09T23:59:00-07:00', estimatedMinutes: 40 });
    expect(prep([hw]).text).toBe('Eng Math HW 1 is due tonight — ~40m.');
  });

  it('prefers a pre-lab nudge tied to the meeting and marks it inferred', () => {
    const labMeeting = nextMeeting([lab], '2026-09-19T12:00:00-07:00', TZ)!; // Mon Sep 21 18:00
    const labItem = item({ id: 'L', courseId: 'lab', type: 'lab', label: 'Chem Lab Emissions', dueAt: '2026-09-25T23:59:00-07:00', estimatedMinutes: 100 });
    const r = nextClassPrep(labMeeting, [labItem], computeSchedule([labItem], DEFAULT_SETTINGS, '2026-09-19', TERM, '2026-09-19T12:00:00-07:00'), [{ key: 'prelab:L', itemId: 'L', day: '2026-09-19', label: 'Pre-lab prep for Chem Lab Emissions', minutes: 45 }], '2026-09-19', TZ);
    expect(r.inferred).toBe(true);
    expect(r.nudge?.key).toBe('prelab:L');
    expect(r.text).toBe("Pre-lab prep for Chem Lab Emissions — ~45m before Monday's lab.");
  });

  it('ignores participation and done items', () => {
    const part = item({ type: 'participation', dueAt: '2026-09-10T23:59:00-07:00' });
    const done = item({ status: 'done', dueAt: '2026-09-10T23:59:00-07:00' });
    expect(prep([part, done]).text).toBe('Nothing to prep.');
  });
});
