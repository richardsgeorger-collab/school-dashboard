import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';

// The extension's own rules for Halo+ on Halo (extension/halo-model.js, a plain script), run as the extension runs them.
const ctx: { globalThis?: unknown; HaloPlusModel?: Record<string, (...a: unknown[]) => unknown> } = {};
ctx.globalThis = ctx;
runInNewContext(readFileSync('extension/halo-model.js', 'utf8'), ctx);
const M = ctx.HaloPlusModel as unknown as {
  merge: (s: unknown, l: unknown, server?: unknown) => View;
  pill: (v: View, now: number) => { tone: string; text: string; parts?: { tone: string; text: string }[] };
  peek: (v: View, now: number) => { text: string; tone: string; key: string } | null;
  hoverList: (v: View, now: number) => { groups: { head: string; rows: { title: string; code: string; when: string; pts: number }[] }[]; todayDone: boolean; part: string | null };
  classLine: (v: View, c: unknown, now: number) => { tone: string; text: string }[];
  classByCode: (v: View, t: string) => { key: string } | null;
  caught: (v: View, i: unknown, now: number) => { line: string; more: string[] } | null;
  badge: (v: View, now: number) => { text: string; red: boolean; tomorrow?: boolean } | null;
  baseline: (v: View) => unknown;
  notable: (v: View, base: unknown, now: number, flagged: string[]) => { kind: string; text: string } | null;
  nextAfter: (v: View, now: number, id: string) => { text: string } | null;
  stale: (v: View, now: number) => string | null;
  compactLive: (p: unknown) => unknown;
  link: (o: string, t: unknown, via: string) => string;
  doneFrom: (server: unknown, marks: unknown) => { v: 1; done: string[] } | null;
  haloHref: (v: View, i: unknown) => string;
  week: (v: View, now: number) => { groups: { head: string; rows: WeekRow[] }[]; todayDone: boolean; count: number; near: { tone: string; text: string }; part: string | null };
};
interface WeekRow {
  key: string;
  id: string | null;
  title: string;
  code: string;
  color: string | null;
  time: string;
  pts: number;
  late: boolean;
  extra: string[];
  href: string;
  canCheck: boolean;
}
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
  pw: null,
  classes: [
    { id: 'chm', code: 'CHM-113', cc: 'CHM-113-WF700A', slug: 'CHM-113-WF700A-20260908', name: 'General Chemistry I', g: 88.5, col: '#2E8B57' },
    { id: 'lab', code: 'CHM-113L', cc: 'CHM-113L-M600A', slug: 'CHM-113L-M600A-20260908', name: 'General Chemistry I - Lab', g: 86 },
    { id: 'eng', code: 'ENG-105', cc: 'ENG-105-ONL4', slug: 'ENG-105-ONL4-20260914', name: 'English Composition I', g: 91 },
  ],
  items,
  ...extra,
});
const item = (id: string, c: string, dueH: number, more: Record<string, unknown> = {}) => ({ id, h: `h-${id}`, c, t: `Item ${id}`, due: at(dueH), hd: at(dueH), pts: 10, ty: 'homework', done: 0, x: 0, ...more });
// What George saw on real Halo (2026-10-22): a participation post overdue, Quiz #2 tomorrow.
const part = (id: string, dueH: number) => item(id, 'chm', dueH, { t: 'Chem Participation W7 Day 1', ht: 'Week 7, Day 1 Participation', ty: 'discussion', pts: 0, pa: 1 });
const quiz = item('q2', 'chm', 22, { t: 'Chem Quiz 2', ht: 'Quiz #2', ty: 'quiz', pts: 50 });

describe('participation never drives urgency', () => {
  it('an overdue participation post: no red pill, no badge, not next up; one quiet line in the hover list', () => {
    const v = M.merge(snap([part('p1', -11), quiz], { pw: 3 }), null);
    expect(M.pill(v, NOW).text).toBe("✓ Today's done · 1 due tomorrow");
    expect(M.badge(v, NOW)).toEqual({ text: '1', red: false, tomorrow: true });
    expect(M.peek(v, NOW)?.text).toBe("Today's done. Tomorrow: Quiz #2 · 50 pts");
    expect(M.hoverList(v, NOW).part).toBe('Participation: 3 posts left this week');
  });
  it('known by its title too (Halo files day posts as discussions)', () => {
    const v = M.merge(snap([item('d', 'chm', 2, { ht: 'Week 8, Day 2 Participation', pts: 5 })]), null);
    expect(M.pill(v, NOW).tone).toBe('green');
  });
});

describe('the pill', () => {
  it('calm, gold, red, green', () => {
    expect(M.pill(M.merge(snap([item('a', 'chm', 60)]), null), NOW)).toEqual({ tone: 'green', text: '✓ All caught up' });
    expect(M.pill(M.merge(snap([item('a', 'chm', 8), item('b', 'eng', 9)]), null), NOW)).toEqual({ tone: 'gold', text: '2 due today' });
    expect(M.pill(M.merge(snap([item('a', 'chm', 2, { ht: 'Lab 4 Prelab Quiz' })]), null), NOW)).toEqual({ tone: 'red', text: 'Due in 2h: Lab 4 Prelab Quiz' });
    expect(M.pill(M.merge(snap([item('a', 'chm', -3), item('b', 'eng', 30)]), null), NOW)).toEqual({ tone: 'red', text: '1 overdue' });
    expect(M.pill(M.merge(snap([item('a', 'chm', 80)]), null), NOW)).toEqual({ tone: 'green', text: '✓ All caught up' });
  });
  it('ungraded work and old overdue work (over two days) never turn it red', () => {
    expect(M.pill(M.merge(snap([item('a', 'chm', 1, { pts: 0 })]), null), NOW).tone).toBe('green');
    expect(M.pill(M.merge(snap([item('a', 'chm', -60)]), null), NOW).tone).toBe('green');
  });
});

// George on real Halo, Sat Oct 24: "✓ All done today", "Nothing due today", with First Draft of Op-Ed (30 pts) and
// Self-Review and Reflection (25 pts) due tomorrow.
describe('today done, graded work tomorrow', () => {
  const draft = item('d', 'eng', 26, { ht: 'First Draft of Op-Ed', pts: 30 });
  const self = item('s', 'eng', 27, { ht: 'Self-Review and Reflection', pts: 25 });
  const v = M.merge(snap([draft, self, item('done', 'chm', 5, { done: 1 }), part('p', 26)], { pw: 2 }), null);
  it('the pill: a green check and a gold count', () => {
    expect(M.pill(v, NOW)).toEqual({
      tone: 'green',
      text: "✓ Today's done · 2 due tomorrow",
      parts: [
        { tone: 'green', text: "✓ Today's done" },
        { tone: 'gold', text: '2 due tomorrow' },
      ],
    });
  });
  it('the hover list: Today all done, then Tomorrow (title, class, points), then participation', () => {
    const l = M.hoverList(v, NOW);
    expect(l.todayDone).toBe(true);
    expect(l.groups.map((g) => g.head)).toEqual(['Tomorrow']);
    expect(l.groups[0].rows.map((r) => [r.title, r.code, r.pts])).toEqual([
      ['First Draft of Op-Ed', 'ENG-105', 30],
      ['Self-Review and Reflection', 'ENG-105', 25],
    ]);
    expect(l.part).toBe('Participation: 2 posts left this week');
  });
  it('the peek and the badge say tomorrow too', () => {
    expect(M.peek(v, NOW)?.text).toBe("Today's done. Tomorrow: First Draft of Op-Ed · 30 pts · +1 more");
    expect(M.badge(v, NOW)).toEqual({ text: '2', red: false, tomorrow: true });
  });
  it('work still due today wins; nothing today or tomorrow is all caught up', () => {
    const today = M.merge(snap([draft, item('t', 'chm', 6)]), null);
    expect(M.pill(today, NOW)).toEqual({ tone: 'gold', text: '1 due today' });
    expect(M.hoverList(today, NOW).todayDone).toBe(false);
    expect(M.badge(today, NOW)).toEqual({ text: '1', red: false });
    const later = M.merge(snap([item('l', 'eng', 60)]), null);
    expect(M.pill(later, NOW).text).toBe('✓ All caught up');
    expect(M.badge(later, NOW)).toBeNull();
  });
});

describe('the hover list', () => {
  it('at most 3 rows, under Overdue, Today, Tomorrow, Next', () => {
    const v = M.merge(snap([item('o', 'chm', -2), item('t1', 'eng', 5), item('t2', 'lab', 6), item('m', 'chm', 26), item('n', 'eng', 80)]), null);
    const l = M.hoverList(v, NOW);
    expect(l.groups.map((g) => g.head)).toEqual(['Overdue', 'Today']);
    expect(l.groups.flatMap((g) => g.rows)).toHaveLength(3);
    expect(l.groups[0].rows[0]).toMatchObject({ title: 'Item o', code: 'CHM-113', when: 'overdue', pts: 10 });
    expect(l.part).toBeNull();
  });
});

describe('re-peeks: only what matters, never on first run', () => {
  it('nothing on first run, and nothing when the same deadline comes from the other source (06:59:59Z vs 06:59:00.000Z)', () => {
    const halo = { v: 1, at: at(0), classes: [{ slug: 'CHM-113-WF700A-20260908', cc: 'CHM-113-WF700A', code: 'CHM-113', name: 'x', g: 88.5, a: [['h-q2', 'Quiz #2', '2026-10-23T15:00:59Z', 50, 'QUIZ', 0, null]] }] };
    const fromSnap = M.merge(snap([quiz]), null);
    const fromBoth = M.merge(snap([{ ...quiz, due: '2026-10-23T15:00:00.000Z', hd: '2026-10-23T15:00:00.000Z' }]), halo);
    expect(M.notable(fromSnap, null, NOW, [])).toBeNull();
    expect(M.notable(fromBoth, M.baseline(fromSnap), NOW, [])).toBeNull();
  });
  it('a graded date moved, a new requirement on 20+ points, graded work due within 3 hours', () => {
    const before = M.merge(snap([quiz, item('lab', 'lab', 50, { pts: 30 }), item('dq', 'eng', 50, { pts: 5 })]), null);
    const base = M.baseline(before);
    const moved = M.merge(snap([{ ...quiz, due: at(46), hd: at(46) }]), null);
    expect(M.notable(moved, base, NOW, [])?.text).toMatch(/^Moved: Quiz #2 is now due on [A-Z][a-z]{2}$/);
    const req = M.merge(snap([quiz, item('lab', 'lab', 50, { pts: 30, x: 1, xb: ['Bring goggles'] }), item('dq', 'eng', 50, { pts: 5, x: 1 })]), null);
    expect(M.notable(req, base, NOW, [])?.text).toBe('New for Item lab: Bring goggles');
    const small = M.merge(snap([quiz, item('dq', 'eng', 50, { pts: 5, x: 1, xb: ['Bring a printed copy'] })]), null);
    expect(M.notable(small, base, NOW, [])).toBeNull();
    const soon = M.merge(snap([{ ...quiz, due: at(2), hd: at(2) }]), null);
    expect(M.notable(soon, M.baseline(soon), NOW, [])?.kind).toBe('soon');
    expect(M.notable(soon, M.baseline(soon), NOW, ['h-q2'])).toBeNull();
  });
  it('after a submission: "Nice. Next up", leaving out what was handed in', () => {
    const v = M.merge(snap([item('a', 'chm', 8), quiz]), null);
    expect(M.nextAfter(v, NOW, 'h-a')?.text).toBe("Nice. Today's done. Tomorrow: Quiz #2 · 50 pts");
    const later = M.merge(snap([item('a', 'chm', 8), item('b', 'eng', 60, { ht: 'Essay 2', pts: 100 })]), null);
    expect(M.nextAfter(later, NOW, 'h-a')?.text).toMatch(/^Nice\. Next up: Essay 2 · [A-Z][a-z]{2} · 100 pts$/);
  });
});

describe('class lines, the assignment box, the badge', () => {
  it('finds the class behind Halo\'s stage badge ("Topic 7CHM-113-WF700A"), never the lab for the lecture', () => {
    const v = M.merge(snap([]), null);
    expect(M.classByCode(v, 'Topic 7CHM-113-WF700A')?.key).toBe('chm');
    expect(M.classByCode(v, 'CurrentCHM-113L-M600A')?.key).toBe('lab');
    expect(M.classByCode(v, 'eng-105-onl4')?.key).toBe('eng');
  });
  it('gray by default, red for graded overdue, gold per assignment with extra requirements; participation left out', () => {
    const v = M.merge(snap([item('a', 'chm', 30, { x: 4, xb: ['Bring goggles'] }), item('b', 'chm', -5), part('p', -3), item('c', 'eng', 400), item('r', 'eng', 30, { x: 1, xs: ['Review chapter 3'] })]), null);
    expect(M.classLine(v, v.classes[0], NOW)).toEqual([
      { tone: 'red', text: '1 overdue' },
      { tone: 'plain', text: '1 this week' },
      { tone: 'gold', text: '1 extra step' },
    ]);
    // A reading reminder is not an extra requirement worth gold.
    expect(M.classLine(v, v.classes[2], NOW)).toEqual([{ tone: 'plain', text: '1 this week' }]);
  });
  it('the assignment-page line: one line, the rest inline; only for a move, something to bring, a deliverable', () => {
    const v = M.merge(snap([item('a', 'lab', 30, { xb: ['Bring lab coat', 'Goggles', 'Closed-toe shoes', 'Submit the data table as one PDF', 'Bring a calculator'] }), item('b', 'chm', 30, { x: 2, xs: ['Review chapter 3'] }), item('m', 'chm', 50, { m: at(26) })]), null);
    const c = M.caught(v, v.items[0], NOW);
    expect(c?.line).toBe('Bring lab coat · Goggles · Closed-toe shoes');
    expect(c?.more).toEqual(['Submit the data table as one PDF', 'Bring a calculator']);
    expect(M.caught(v, v.items[1], NOW)).toBeNull();
    expect(M.caught(v, v.items[2], NOW)?.line).toMatch(/^Due date moved to [A-Z][a-z]{2}, [A-Z][a-z]{2} \d+ \(was [A-Z][a-z]{2}, [A-Z][a-z]{2} \d+\)$/);
  });
  it('the toolbar badge: graded work due today, red when overdue or soon', () => {
    expect(M.badge(M.merge(snap([item('a', 'chm', 8), item('b', 'eng', 9)]), null), NOW)).toEqual({ text: '2', red: false });
    expect(M.badge(M.merge(snap([item('a', 'chm', 1)]), null), NOW)).toEqual({ text: '1', red: true });
    expect(M.badge(M.merge(snap([item('l', 'chm', 60)]), null), NOW)).toBeNull();
  });
  it('says "as of" only for data more than a day old', () => {
    expect(M.stale(M.merge(snap([]), null), NOW)).toBeNull();
    expect(M.stale(M.merge(snap([], { syncedAt: at(-30) }), null), NOW)).toMatch(/^as of (yesterday|[A-Z][a-z]{2} \d+,) /);
  });
  it('links into Halo+ say they came from Halo', () => {
    expect(M.link('https://haloplus.app', { courseId: 'chm', id: 'a' }, 'card')).toBe('https://haloplus.app/#/class?c=chm&i=a&from=halo&via=card');
    expect(M.link('https://haloplus.app', null, 'pill')).toBe('https://haloplus.app/#/now?from=halo&via=pill');
  });
});

describe('done in Halo+ is done; no Halo submission goes quiet', () => {
  it('the account says done (any device): never overdue in the pill, the list, the badge or the class line', () => {
    const late = item('q', 'chm', -3, { ht: 'Quiz #2', ty: 'quiz', pts: 50 });
    const v = M.merge(snap([late]), null, { v: 1, done: ['h-q'] });
    expect(M.pill(v, NOW).tone).toBe('green');
    expect(M.badge(v, NOW)).toBeNull();
    expect(M.classLine(v, v.classes[0], NOW)).toEqual([{ tone: 'plain', text: 'Nothing this week' }]);
  });
  it('done in the snapshot beats Halo saying OVERDUE (an in-class quiz not graded yet)', () => {
    const halo = { v: 1, at: at(0), classes: [{ slug: 'CHM-113-WF700A-20260908', cc: 'CHM-113-WF700A', code: 'CHM-113', name: 'x', g: 90, a: [['h-q', 'Quiz #2', at(-3), 50, 'ASSIGNMENT', 0, null, 1]] }] };
    const v = M.merge(snap([item('q', 'chm', -3, { ht: 'Quiz #2', pts: 50, done: 1 })], { syncedAt: at(-5) }), halo);
    expect(M.pill(v, NOW).tone).toBe('green');
  });
  it('an in-class quiz or an outside tool past its date: not overdue, not counted, not listed; a grade later is done', () => {
    const halo = { v: 1, at: at(0), classes: [{ slug: 'CHM-113-WF700A-20260908', cc: 'CHM-113-WF700A', code: 'CHM-113', name: 'x', g: 90, a: [['h-ex', 'Exam 1', at(-2), 100, 'ASSIGNMENT', 0, null, 1], ['h-aleks', 'Topic 4 Homework', at(-1), 10, 'LTI', 0, null, 1], ['h-drop', 'Lab Report', at(-1), 30, 'ASSIGNMENT', 0, null, 0]] }] };
    const v = M.merge(snap([]), halo);
    expect(M.pill(v, NOW)).toEqual({ tone: 'red', text: '1 overdue' });
    expect(M.hoverList(v, NOW).groups.flatMap((g) => g.rows.map((r) => r.title))).toEqual(['Lab Report']);
    expect(M.badge(v, NOW)?.text).toBe('1');
    expect(M.classLine(v, v.classes[0], NOW)[0]).toEqual({ tone: 'red', text: '1 overdue' });
  });
});

// "This week" on Halo's Student Home (George, 2026-10-24).
describe('this week', () => {
  const v = M.merge(
    snap(
      [
        item('late', 'chm', -5, { ht: 'Lab Report 3', pts: 30 }),
        item('now', 'eng', 5, { ht: 'Peer Review', pts: 20, xb: ['Bring a printed copy'], xs: ['Bring a printed copy'], u: 'unit-7', hy: 'ASSIGNMENT' }),
        item('tmr', 'eng', 26, { ht: 'First Draft of Op-Ed', pts: 30, xs: ['Review chapter 3 first'] }),
        item('thu', 'chm', 74, { ht: 'Quiz #3', pts: 50, hy: 'QUIZ' }),
        item('far', 'chm', 24 * 9, { ht: 'Exam 2', pts: 150 }),
        item('zero', 'lab', 30, { ht: 'Prelab reading', pts: 0 }),
        part('p', 30),
      ],
      { pw: 3 },
    ),
    null,
  );
  it('groups graded work: Overdue, Today, Tomorrow, Later this week; nothing past six days, no ungraded, no participation', () => {
    const w = M.week(v, NOW);
    expect(w.groups.map((g) => [g.head, g.rows.map((r) => r.title)])).toEqual([
      ['Overdue', ['Lab Report 3']],
      ['Today', ['Peer Review']],
      ['Tomorrow', ['First Draft of Op-Ed']],
      ['Later this week', ['Quiz #3']],
    ]);
    expect(w.count).toBe(4);
    expect(w.near).toEqual({ tone: 'red', text: '1 overdue' });
    expect(w.todayDone).toBe(false);
    expect(w.part).toBe('Participation: 3 posts left this week');
  });
  it('each row: code, class color, time, points, what Halo+ caught, where it opens on Halo', () => {
    const rows = M.week(v, NOW).groups.flatMap((g) => g.rows);
    const [late, now, tmr, thu] = rows;
    expect(tmr.extra).toEqual([]);
    expect(late).toMatchObject({ code: 'CHM-113', color: '#2E8B57', time: 'Today 5 AM', pts: 30, late: true, canCheck: true });
    expect(now).toMatchObject({ code: 'ENG-105', color: null, time: '3 PM', extra: ['Bring a printed copy'], href: 'https://halo.gcu.edu/courses/ENG-105-ONL4-20260914/course-units/unit-7' });
    expect(thu.time).toBe('Sun 12 PM');
    expect(thu.href).toBe('https://halo.gcu.edu/quiz/h-thu');
  });
  it('today clear: todayDone, and a check-off on this computer counts at once', () => {
    const marks = M.doneFrom({ v: 1, done: ['h-late'] }, { 'h-now': '2026-10-22T17:00:00Z' });
    expect(marks?.done).toEqual(['h-late', 'h-now']);
    const w = M.week(M.merge(snap([item('late', 'chm', -5, { pts: 30 }), item('now', 'eng', 5, { pts: 20 }), item('tmr', 'eng', 26)]), null, marks), NOW);
    expect(w.todayDone).toBe(true);
    expect(w.groups.map((g) => g.head)).toEqual(['Tomorrow']);
    expect(w.near).toEqual({ tone: 'plain', text: '1 tomorrow' });
    expect(M.doneFrom(null, null)).toBeNull();
  });
  it('work only Halo has (not in Halo+ yet) opens on Halo but has no check box', () => {
    const halo = { v: 1, at: at(0), classes: [{ slug: 'CHM-113-WF700A-20260908', cc: 'CHM-113-WF700A', code: 'CHM-113', name: 'x', g: 90, a: [['h-new', 'Topic 8 Homework', at(30), 10, 'ASSIGNMENT', 0, 'u8', 0]] }] };
    const r = M.week(M.merge(snap([]), halo), NOW).groups[0].rows[0];
    expect(r).toMatchObject({ title: 'Topic 8 Homework', canCheck: false, href: 'https://halo.gcu.edu/courses/CHM-113-WF700A-20260908/course-units/u8' });
  });
});
