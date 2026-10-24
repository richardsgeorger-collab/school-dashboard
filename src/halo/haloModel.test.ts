import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';

// The extension's own rules for Halo+ on Halo (extension/halo-model.js, a plain script), run as the extension runs them.
const ctx: { globalThis?: unknown; HaloPlusModel?: Record<string, (...a: unknown[]) => unknown> } = {};
ctx.globalThis = ctx;
runInNewContext(readFileSync('extension/halo-model.js', 'utf8'), ctx);
const M = ctx.HaloPlusModel as unknown as {
  merge: (s: unknown, l: unknown) => View;
  pill: (v: View, now: number) => { tone: string; text: string };
  peek: (v: View, now: number) => { text: string; tone: string; key: string } | null;
  hoverList: (v: View, now: number) => { groups: { head: string; rows: { title: string; code: string; when: string; pts: number }[] }[]; part: string | null };
  classLine: (v: View, c: unknown, now: number) => { tone: string; text: string }[];
  classByCode: (v: View, t: string) => { key: string } | null;
  caught: (v: View, i: unknown, now: number) => { title: string; list: string[]; moved: string | null } | null;
  badge: (v: View, now: number) => { text: string; red: boolean } | null;
  baseline: (v: View) => unknown;
  notable: (v: View, base: unknown, now: number, flagged: string[]) => { kind: string; text: string } | null;
  nextAfter: (v: View, now: number, id: string) => { text: string } | null;
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
  pw: null,
  classes: [
    { id: 'chm', code: 'CHM-113', cc: 'CHM-113-WF700A', slug: 'CHM-113-WF700A-20260908', name: 'General Chemistry I', g: 88.5 },
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
    expect(M.pill(v, NOW)).toEqual({ tone: 'calm', text: 'Next: Quiz #2 tomorrow' });
    expect(M.badge(v, NOW)).toBeNull();
    expect(M.peek(v, NOW)?.text).toBe('Next up: Quiz #2 · tomorrow · 50 pts');
    expect(M.hoverList(v, NOW).part).toBe('Participation: 3 posts left this week');
  });
  it('known by its title too (Halo files day posts as discussions)', () => {
    const v = M.merge(snap([item('d', 'chm', 2, { ht: 'Week 8, Day 2 Participation', pts: 5 })]), null);
    expect(M.pill(v, NOW).tone).toBe('green');
  });
});

describe('the pill', () => {
  it('calm, gold, red, green', () => {
    expect(M.pill(M.merge(snap([quiz]), null), NOW).tone).toBe('calm');
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
    const req = M.merge(snap([quiz, item('lab', 'lab', 50, { pts: 30, x: 1, xs: ['Bring goggles'] }), item('dq', 'eng', 50, { pts: 5, x: 1 })]), null);
    expect(M.notable(req, base, NOW, [])?.text).toBe('New for Item lab: Bring goggles');
    const small = M.merge(snap([quiz, item('dq', 'eng', 50, { pts: 5, x: 1 })]), null);
    expect(M.notable(small, base, NOW, [])).toBeNull();
    const soon = M.merge(snap([{ ...quiz, due: at(2), hd: at(2) }]), null);
    expect(M.notable(soon, M.baseline(soon), NOW, [])?.kind).toBe('soon');
    expect(M.notable(soon, M.baseline(soon), NOW, ['h-q2'])).toBeNull();
  });
  it('after a submission: "Nice. Next up", leaving out what was handed in', () => {
    const v = M.merge(snap([item('a', 'chm', 8), quiz]), null);
    expect(M.nextAfter(v, NOW, 'h-a')?.text).toBe('Nice. Next up: Quiz #2 · tomorrow · 50 pts');
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
    const v = M.merge(snap([item('a', 'chm', 30, { x: 4 }), item('b', 'chm', -5), part('p', -3), item('c', 'eng', 400)]), null);
    expect(M.classLine(v, v.classes[0], NOW)).toEqual([
      { tone: 'red', text: '1 overdue' },
      { tone: 'plain', text: '1 due this week' },
      { tone: 'gold', text: '1 with extra requirements' },
    ]);
    expect(M.classLine(v, v.classes[2], NOW)).toEqual([{ tone: 'plain', text: 'Nothing due this week' }]);
  });
  it('the box only when announcements added something or moved the date', () => {
    const v = M.merge(snap([item('a', 'chm', 30, { x: 2, xs: ['Use APA format', 'Three peer-reviewed sources'] }), item('b', 'chm', 30)]), null);
    expect(M.caught(v, v.items[0], NOW)).toMatchObject({ title: 'Halo+ caught 2 extra requirements for this', list: ['Use APA format', 'Three peer-reviewed sources'] });
    expect(M.caught(v, v.items[1], NOW)).toBeNull();
  });
  it('the toolbar badge: graded work due today, red when overdue or soon', () => {
    expect(M.badge(M.merge(snap([item('a', 'chm', 8), item('b', 'eng', 9)]), null), NOW)).toEqual({ text: '2', red: false });
    expect(M.badge(M.merge(snap([item('a', 'chm', 1)]), null), NOW)).toEqual({ text: '1', red: true });
    expect(M.badge(M.merge(snap([quiz]), null), NOW)).toBeNull();
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
