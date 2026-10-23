import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';

// The extension's own rules for Halo+ on Halo (extension/halo-model.js, a plain script), run as the extension runs them.
const ctx: { globalThis?: unknown; HaloPlusModel?: Record<string, (...a: unknown[]) => unknown> } = {};
ctx.globalThis = ctx;
runInNewContext(readFileSync('extension/halo-model.js', 'utf8'), ctx);
const M = ctx.HaloPlusModel as unknown as {
  merge: (s: unknown, l: unknown) => View;
  pill: (v: View, now: number) => { tone: string; text: string; pulse: boolean };
  card: (v: View, now: number) => { title: string; tone: string; top: { label: string; when: string } | null; hidden: number };
  classLine: (v: View, c: unknown, now: number) => { tone: string; text: string }[];
  classByCode: (v: View, t: string) => { key: string } | null;
  caught: (v: View, i: unknown, now: number) => { title: string; list: string[]; moved: string | null } | null;
  badge: (v: View, now: number) => { text: string; red: boolean } | null;
  fingerprint: (v: View) => unknown;
  changes: (v: View, seen: unknown, now: number) => { total: number; added: number; moved: number; extra: number; grades: string[] };
  changesLine: (c: unknown) => string;
  nextAfter: (v: View, now: number, id: string) => { label: string } | null;
  stale: (v: View, now: number) => string | null;
  compactLive: (p: unknown) => unknown;
  link: (o: string, t: unknown, via: string) => string;
};
interface View {
  items: { h: string | null; t: string; due: string; done: number; x: number }[];
  classes: { key: string; code: string; g: number | null }[];
  syncedAt: string | null;
}

const TZ = 'America/Phoenix';
// Wednesday Oct 22, 2026, 10:00 AM in Phoenix (17:00 UTC).
const NOW = Date.parse('2026-10-22T17:00:00Z');
const at = (h: number) => new Date(NOW + h * 3_600_000).toISOString();
const snap = (items: unknown[], extra: Record<string, unknown> = {}) => ({
  v: 1,
  at: at(-1),
  syncedAt: at(-2),
  plan: 'sync',
  show: true,
  showAt: null,
  tz: TZ,
  top: null,
  hidden: 0,
  classes: [
    { id: 'chm', code: 'CHM-113', cc: 'CHM-113-WF700A', slug: 'CHM-113-WF700A-20260908', name: 'General Chemistry I', g: 88.5 },
    { id: 'eng', code: 'ENG-105', cc: 'ENG-105-ONL4', slug: 'ENG-105-ONL4-20260914', name: 'English Composition I', g: 91 },
  ],
  items,
  ...extra,
});
const item = (id: string, c: string, dueH: number, more: Record<string, unknown> = {}) => ({ id, h: `h-${id}`, c, t: `Item ${id}`, due: at(dueH), hd: at(dueH), pts: 10, ty: 'homework', done: 0, x: 0, ...more });

describe('the pill', () => {
  it('green when nothing is left today, gold when work is due today, red when overdue or due within 3 hours', () => {
    expect(M.pill(M.merge(snap([item('a', 'chm', 30)]), null), NOW)).toEqual({ tone: 'green', text: '✓ All done today', pulse: false });
    expect(M.pill(M.merge(snap([item('a', 'chm', 8), item('b', 'eng', 9)]), null), NOW)).toEqual({ tone: 'gold', text: '2 due today', pulse: false });
    expect(M.pill(M.merge(snap([item('a', 'chm', 2)]), null), NOW)).toEqual({ tone: 'red', text: 'Due in 2h', pulse: true });
    expect(M.pill(M.merge(snap([item('a', 'chm', 0.5)]), null), NOW).text).toBe('Due in 30m');
    expect(M.pill(M.merge(snap([item('a', 'chm', -3), item('b', 'eng', 2)]), null), NOW)).toEqual({ tone: 'red', text: '1 overdue', pulse: true });
  });
  it('work done today does not count, and old overdue work (over two days) lets it go green', () => {
    expect(M.pill(M.merge(snap([item('a', 'chm', 8, { done: 1 })]), null), NOW).tone).toBe('green');
    expect(M.pill(M.merge(snap([item('a', 'chm', -60)]), null), NOW).tone).toBe('green');
  });
});

describe('the daily card', () => {
  it('"N due today" with the do-now item, and what announcements hid', () => {
    const v = M.merge(snap([item('a', 'chm', 8), item('b', 'eng', 30)], { top: 'a', hidden: 3 }), null);
    const c = M.card(v, NOW);
    expect(c.title).toBe('1 due today');
    expect(c.top?.label).toBe('Item a');
    expect(c.hidden).toBe(3);
  });
  it('"Nothing due today. Next: X on Thu" when today is clear', () => {
    const v = M.merge(snap([item('b', 'eng', 40)]), null);
    expect(M.card(v, NOW).title).toMatch(/^Nothing due today\. Next: Item b (tomorrow|on [A-Z][a-z]{2})$/);
  });
  it('after a submission, the next thing, leaving out what was just handed in', () => {
    const v = M.merge(snap([item('a', 'chm', 8), item('b', 'eng', 30)], { top: 'a' }), null);
    expect(M.nextAfter(v, NOW, 'h-a')?.label).toBe('Item b');
  });
  it('says "as of" only for data more than a day old', () => {
    expect(M.stale(M.merge(snap([]), null), NOW)).toBeNull();
    expect(M.stale(M.merge(snap([], { syncedAt: at(-30) }), null), NOW)).toMatch(/^as of (yesterday|[A-Z][a-z]{2} \d+,) /);
  });
});

describe('class lines, the assignment box, the badge', () => {
  it('finds a class by the code on Halo\'s own card, and says what is due this week, overdue, extra', () => {
    const v = M.merge(snap([item('a', 'chm', 30, { x: 1 }), item('b', 'chm', -5), item('c', 'eng', 400)]), null);
    const chm = M.classByCode(v, 'CHM-113-WF700A');
    expect(chm?.key).toBe('chm');
    expect(M.classLine(v, chm, NOW)).toEqual([
      { tone: 'red', text: '1 overdue' },
      { tone: 'plain', text: '1 due this week' },
      { tone: 'gold', text: '1 extra requirement' },
    ]);
    expect(M.classLine(v, M.classByCode(v, 'eng-105-onl4'), NOW)).toEqual([{ tone: 'plain', text: 'Nothing due this week' }]);
  });
  it('the box only when announcements added something or moved the date', () => {
    const v = M.merge(snap([item('a', 'chm', 30, { x: 2, xs: ['Use APA format', 'Three peer-reviewed sources'] }), item('b', 'chm', 30)]), null);
    expect(M.caught(v, v.items[0], NOW)).toMatchObject({ title: 'Halo+ caught 2 extra requirements for this', list: ['Use APA format', 'Three peer-reviewed sources'] });
    expect(M.caught(v, v.items[1], NOW)).toBeNull();
    const moved = M.merge(snap([item('m', 'chm', 50, { m: at(2) })]), null);
    expect(M.caught(moved, moved.items[0], NOW)?.moved).toMatch(/^Due date moved to [A-Z][a-z]{2}, [A-Z][a-z]{2} \d+ \(was [A-Z][a-z]{2}, [A-Z][a-z]{2} \d+\), from an announcement\.$/);
  });
  it('the toolbar badge: today\'s count, red when overdue or soon, nothing when nothing is due', () => {
    expect(M.badge(M.merge(snap([item('a', 'chm', 8), item('b', 'eng', 9)]), null), NOW)).toEqual({ text: '2', red: false });
    expect(M.badge(M.merge(snap([item('a', 'chm', 1)]), null), NOW)).toEqual({ text: '1', red: true });
    expect(M.badge(M.merge(snap([item('a', 'chm', 30)]), null), NOW)).toBeNull();
  });
});

describe('what is new, and Halo\'s own reading between visits to Halo+', () => {
  it('notices a new assignment, a moved date, a new requirement and a new grade, and nothing on the first look', () => {
    const before = M.merge(snap([item('a', 'chm', 30), item('b', 'eng', 50)]), null);
    expect(M.changes(before, null, NOW).total).toBe(0);
    const seen = M.fingerprint(before);
    const after = M.merge(snap([item('a', 'chm', 54), item('b', 'eng', 50, { x: 1 }), item('c', 'eng', 70)], { classes: [{ id: 'chm', code: 'CHM-113', cc: 'CHM-113-WF700A', slug: 'CHM-113-WF700A-20260908', name: 'x', g: 90 }, { id: 'eng', code: 'ENG-105', cc: 'ENG-105-ONL4', slug: 'ENG-105-ONL4-20260914', name: 'y', g: 91 }] }), null);
    const ch = M.changes(after, seen, NOW);
    expect(ch).toMatchObject({ added: 1, moved: 1, extra: 1, grades: ['CHM-113'], total: 4 });
    expect(M.changesLine(ch)).toBe('1 new assignment · 1 date moved · 1 new requirement · new grade in CHM-113');
  });
  it('lays Halo\'s latest reading over Halo+: new work, a date Halo moved, handed in; a date an announcement moved stays', () => {
    const s = snap([item('a', 'chm', 30), item('b', 'chm', 50, { m: at(26), hd: at(26) })]);
    const live = M.compactLive({
      exportedAt: at(-0.5),
      classes: [
        {
          slugId: 'CHM-113-WF700A-20260908',
          classCode: 'CHM-113-WF700A',
          courseCode: 'CHM-113',
          name: 'General Chemistry I',
          finalGrade: { finalPoints: 45, maxPoints: 50 },
          assessments: [
            { id: 'h-a', title: 'Topic 5 Homework', dueDate: at(30), points: 10, type: 'ASSIGNMENT', submittedAt: at(-0.6), score: null, status: 'SUBMITTED' },
            { id: 'h-b', title: 'Quiz 2', dueDate: at(26), points: 50, type: 'QUIZ', status: null, submittedAt: null, score: null },
            { id: 'h-new', title: 'Lab 6 Prelab', dueDate: at(70), points: 5, type: 'ASSIGNMENT', status: null, submittedAt: null, score: null },
            { id: 'h-part', title: 'Participation', dueDate: at(70), points: 5, type: 'PARTICIPATION' },
          ],
        },
      ],
    });
    const v = M.merge(s, live);
    expect(v.items.find((i) => i.h === 'h-a')?.done).toBe(1);
    // Halo still says Thursday 26h: the announcement's later date stands.
    expect(v.items.find((i) => i.h === 'h-b')?.due).toBe(at(50));
    expect(v.items.find((i) => i.h === 'h-new')?.t).toBe('Lab 6 Prelab');
    expect(v.items.some((i) => i.h === 'h-part')).toBe(false);
    expect(v.classes.find((c) => c.key === 'chm')?.g).toBe(90);
  });
  it('links into Halo+ say they came from Halo', () => {
    expect(M.link('https://haloplus.app', { courseId: 'chm', id: 'a' }, 'card')).toBe('https://haloplus.app/#/class?c=chm&i=a&from=halo&via=card');
    expect(M.link('https://haloplus.app', null, 'pill')).toBe('https://haloplus.app/#/now?from=halo&via=pill');
  });
});
