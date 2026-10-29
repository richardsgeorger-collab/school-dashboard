import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';

// The rules behind Halo+ on Halo's pages (extension/onhalo/logic.js, a plain script), run as the extension runs them.
// Every rule is tested on the cases where it must show nothing, as much as on the ones where it shows something.
const ctx: { globalThis?: unknown; HaloPlusOnLogic?: unknown; URL?: unknown; Intl?: unknown; Date?: unknown } = { URL, Intl, Date };
ctx.globalThis = ctx;
runInNewContext(readFileSync('extension/onhalo/logic.js', 'utf8'), ctx);
type Fb = { id: string; title: string; type: string; comment?: string };
type Row = { kind: string; title: string; cc?: string; topic?: string; href: string; due?: string | null };
const L = ctx.HaloPlusOnLogic as {
  search: (rows: Row[], q: string, now: number, limit?: number) => Row[];
  earlierMatch: (cur: Fb, cands: Fb[]) => Fb | null;
  participationDays: (t: string) => number | null;
  preloadOk: (o: { visible: boolean; saveData: boolean; effectiveType: string | null; battery: { charging: boolean; level: number } | null }) => boolean;
  haloDateTime: (t: string, tz: string) => number | null;
  haloFormat: (t: number, tz: string, kind?: string) => string;
  classColor: (slug: string, code: string, start: string | null) => { name: string; hex: string; css: string };
  hrefFor: (slug: string, a: Record<string, unknown>) => string | null;
  buildIndex: (p: unknown, at?: string) => { classes: { slug: string; col: string; part: unknown }[]; rows: Row[] };
  offerDraft: (d: { text: string; at: string } | null, box: string, now: number, own: string[]) => boolean;
  pruneDrafts: (all: Record<string, { text: string; at: string }>, now: number) => Record<string, { text: string; at: string }>;
  participationLine: (dates: string[], start: string, end: string, need: number, tz: string, perDay?: number) => string | null;
  dayOf: (at: string | number, tz: string) => string | null;
  dueIn: (due: string, now: number, tz: string) => string | null;
  findUrls: (t: string) => { start: number; end: number; href: string; text: string }[];
  countWords: (t: string) => number;
  wordMinimum: (t: string, kind?: 'post' | 'reply') => number | null;
  requiredType: (t: string) => { key: string; exts: string[] } | null;
  wrongType: (name: string, req: { key: string; exts: string[] } | null) => boolean;
};
const PHX = 'America/Phoenix';
const at = (s: string) => Date.parse(s);

describe('dueIn: how long until a due date (feature 5)', () => {
  const now = at('2026-10-27T15:00:00-07:00'); // Tue 3 PM in Phoenix
  it('minutes, hours, tomorrow, days', () => {
    expect(L.dueIn('2026-10-27T15:40:00-07:00', now, PHX)).toBe('in 40m');
    expect(L.dueIn('2026-10-27T20:12:00-07:00', now, PHX)).toBe('in 5h');
    expect(L.dueIn('2026-10-27T23:59:00-07:00', now, PHX)).toBe('in 8h');
    expect(L.dueIn('2026-10-28T23:59:00-07:00', now, PHX)).toBe('tomorrow');
    expect(L.dueIn('2026-10-30T23:59:00-07:00', now, PHX)).toBe('in 3 days');
    expect(L.dueIn('2026-11-02T23:59:00-07:00', now, PHX)).toBe('in 6 days');
  });
  it('nothing for past due, too far out, or anything unreadable', () => {
    expect(L.dueIn('2026-10-27T14:59:00-07:00', now, PHX)).toBeNull();
    expect(L.dueIn('2026-10-27T15:00:00-07:00', now, PHX)).toBeNull();
    expect(L.dueIn('2026-11-03T23:59:00-07:00', now, PHX)).toBeNull();
    expect(L.dueIn('not a date', now, PHX)).toBeNull();
    expect(L.dueIn('2026-10-28T23:59:00-07:00', Number.NaN, PHX)).toBeNull();
    expect(L.dueIn('2026-10-28T23:59:00-07:00', now, 'Not/AZone')).toBeNull();
  });
  it('just before midnight, something due at 1 AM is "in 2h", not "tomorrow"', () => {
    const late = at('2026-10-27T23:00:00-07:00');
    expect(L.dueIn('2026-10-28T01:00:00-07:00', late, PHX)).toBe('in 2h');
  });
  it("tomorrow is the student's tomorrow, in their own time zone", () => {
    // 11:30 PM in New York is 8:30 PM in Phoenix: the same instant, a different "tomorrow".
    const n = at('2026-10-28T03:30:00Z');
    expect(L.dueIn('2026-10-29T03:30:00Z', n, 'America/New_York')).toBe('tomorrow');
    expect(L.dueIn('2026-10-29T03:30:00Z', n, PHX)).toBe('tomorrow');
    // 1 AM Thursday in New York is 10 PM Wednesday in Phoenix.
    expect(L.dueIn('2026-10-29T05:00:00Z', n, 'America/New_York')).toBe('in 2 days');
    expect(L.dueIn('2026-10-29T05:00:00Z', n, PHX)).toBe('tomorrow');
  });
});

describe('findUrls: only real addresses become links (feature 28)', () => {
  it('finds http, https and www addresses, without the sentence punctuation after them', () => {
    const t = 'See https://www.gcu.edu/library. Or www.apa.org, and (https://owl.purdue.edu/owl/apa).';
    const u = L.findUrls(t);
    expect(u.map((x) => x.text)).toEqual(['https://www.gcu.edu/library', 'www.apa.org', 'https://owl.purdue.edu/owl/apa']);
    expect(u[1].href).toBe('https://www.apa.org/');
    expect(t.slice(u[0].start, u[0].end)).toBe('https://www.gcu.edu/library');
  });
  it('keeps a bracket the address opened, and query strings', () => {
    expect(L.findUrls('https://en.wikipedia.org/wiki/Stoichiometry_(chemistry) is useful')[0].text).toBe('https://en.wikipedia.org/wiki/Stoichiometry_(chemistry)');
    expect(L.findUrls('Zoom: https://gcu.zoom.us/j/123456?pwd=abc!')[0].text).toBe('https://gcu.zoom.us/j/123456?pwd=abc');
  });
  it('leaves alone what is not a real address', () => {
    expect(L.findUrls('Due 10.28.2026 at 11:59 p.m. in Room 3.4')).toEqual([]);
    expect(L.findUrls('email me at prof@gcu.edu or see Ch. 3.2')).toEqual([]);
    expect(L.findUrls('javascript:alert(1) and ftp://files.example.com')).toEqual([]);
    expect(L.findUrls('http://localhost:3000 and https://user:pw@evil.com')).toEqual([]);
    expect(L.findUrls('www. is not a site, nor is https://.com')).toEqual([]);
  });
});

describe('countWords and wordMinimum (feature 19)', () => {
  it('counts words like a reader', () => {
    expect(L.countWords('')).toBe(0);
    expect(L.countWords('  ')).toBe(0);
    expect(L.countWords("It's a well-known fact: 3.5 moles, e.g. 22.4 L.")).toBe(9);
    expect(L.countWords('One two — three')).toBe(3);
  });
  it('reads a clearly stated minimum', () => {
    expect(L.wordMinimum('Your initial post should be at least 250 words.')).toBe(250);
    expect(L.wordMinimum('Write a minimum of 150 words and cite one source.')).toBe(150);
    expect(L.wordMinimum('Posts must be 200–300 words.')).toBe(200);
    expect(L.wordMinimum('Respond in 150 to 200 words.')).toBe(150);
    expect(L.wordMinimum('Respond to the prompt in at least 200 words.', 'reply')).toBe(200);
    expect(L.wordMinimum('No fewer than 300 words.')).toBe(300);
    expect(L.wordMinimum('150 word minimum.')).toBe(150);
  });
  it('picks the number for the box: the initial post or a reply', () => {
    const t = 'Initial post: at least 250 words. Replies to classmates: a minimum of 100 words each.';
    expect(L.wordMinimum(t, 'post')).toBe(250);
    expect(L.wordMinimum(t, 'reply')).toBe(100);
  });
  it('nothing when there is none, or it is not clear', () => {
    expect(L.wordMinimum('Answer the question thoughtfully and cite your sources.')).toBeNull();
    expect(L.wordMinimum('Read pages 150-200 of the text.')).toBeNull();
    expect(L.wordMinimum('Use at least 3 sources.')).toBeNull();
    expect(L.wordMinimum('Write at least 250 words. Some sections need at least 300 words.')).toBeNull();
    expect(L.wordMinimum('The paper is 1,500 words.')).toBeNull();
  });
});

describe('requiredType and wrongType (feature 8)', () => {
  it('one type, asked for', () => {
    const r = L.requiredType('Submit your essay as a Microsoft Word document.');
    expect(r?.key).toBe('docx');
    expect(L.wrongType('essay.pdf', r)).toBe(true);
    expect(L.wrongType('essay.docx', r)).toBe(false);
    expect(L.wrongType('essay.DOC', r)).toBe(false);
    expect(L.requiredType('Upload the lab report as a PDF.')?.key).toBe('pdf');
  });
  it('nothing when two types are allowed, a type is only mentioned, or the file has no extension', () => {
    expect(L.requiredType('Submit as a Word document or PDF.')).toBeNull();
    expect(L.requiredType('Use the PowerPoint from Topic 2 to study. Submit your answers below.')).toBeNull();
    expect(L.requiredType('Read the PDF in the resources before class.')).toBeNull();
    expect(L.requiredType('Complete the worksheet.')).toBeNull();
    expect(L.wrongType('essay', { key: 'docx', exts: ['docx', 'doc'] })).toBe(false);
    expect(L.wrongType('essay.pdf', null)).toBe(false);
  });
});

describe('search: finding things across classes (feature 0)', () => {
  const now = at('2026-10-27T15:00:00-07:00');
  const rows: Row[] = [
    { kind: 'quiz', title: 'Topic 3 Quiz', cc: 'CHM-113-WF700A', topic: 'Topic 3: Stoichiometry', href: '/quiz/q3', due: '2026-10-29T23:59:00-07:00' },
    { kind: 'quiz', title: 'Topic 30 Quiz', cc: 'CHM-113-WF700A', topic: 'Topic 30', href: '/quiz/q30', due: null },
    { kind: 'discussion', title: 'Topic 3 DQ 1', cc: 'ENG-105-O500', topic: 'Topic 3: Argument', href: '/courses/eng/forums/discussion/f1', due: '2026-10-28T23:59:00-07:00' },
    { kind: 'assignment', title: 'Lab Report: Titration', cc: 'CHM-113L-WF701A', topic: 'Topic 3: Acids', href: '/courses/lab/course-units/u3', due: '2026-10-31T23:59:00-07:00' },
    { kind: 'file', title: 'Titration worksheet.pdf', cc: 'CHM-113L-WF701A', topic: 'Topic 3: Acids', href: '/courses/lab/course-units/u3/resources/r9', due: null },
    { kind: 'topic', title: 'Topic 3: Stoichiometry', cc: 'CHM-113-WF700A', href: '/courses/chm/course-units/u3' },
    { kind: 'announcement', title: 'Quiz moved to Friday', cc: 'CHM-113-WF700A', href: '/courses/chm/announcements', due: null },
  ];
  it('"topic 3 quiz" finds the Topic 3 quiz first, and never Topic 30', () => {
    const r = L.search(rows, 'topic 3 quiz', now);
    expect(r[0].href).toBe('/quiz/q3');
    expect(r.map((x) => x.href)).not.toContain('/quiz/q30');
  });
  it('finds by kind, topic and class too', () => {
    expect(L.search(rows, 'titration', now).map((x) => x.kind)).toEqual(['assignment', 'file']);
    expect(L.search(rows, 'dq', now)[0].title).toBe('Topic 3 DQ 1');
    expect(L.search(rows, 'eng 105', now)[0].title).toBe('Topic 3 DQ 1');
    expect(L.search(rows, 'stoich', now)[0].kind).toBe('topic');
  });
  it('nothing for an empty query, a word that is nowhere, or rows without an address', () => {
    expect(L.search(rows, '', now)).toEqual([]);
    expect(L.search(rows, '   ', now)).toEqual([]);
    expect(L.search(rows, 'topic 3 zebra', now)).toEqual([]);
    expect(L.search([{ kind: 'quiz', title: 'Topic 3 Quiz', href: '' }], 'quiz', now)).toEqual([]);
  });
  it('at most eight', () => {
    const many = Array.from({ length: 20 }, (_, k) => ({ kind: 'assignment', title: `Reading ${k + 1}`, href: `/r/${k}` }));
    expect(L.search(many, 'reading', now)).toHaveLength(8);
  });
});

describe('earlierMatch: last feedback from the same assignment a week before (feature 23)', () => {
  const dq = (id: string, title: string, comment = 'Good use of the reading; cite the page next time.', type = 'DISCUSSION') => ({ id, title, type, comment });
  it('Topic 6 DQ 2 for Topic 7 DQ 2, the most recent one with a comment', () => {
    const cands = [dq('a', 'Topic 5 DQ 2'), dq('b', 'Topic 6 DQ 2'), dq('c', 'Topic 6 DQ 1'), dq('d', 'Topic 8 DQ 2')];
    expect(L.earlierMatch(dq('x', 'Topic 7 DQ 2'), cands)?.id).toBe('b');
    expect(L.earlierMatch(dq('x', 'Week 4 Reflection', '', 'ASSIGNMENT'), [dq('w3', 'Week 3 Reflection', 'Nice', 'ASSIGNMENT')])?.id).toBe('w3');
  });
  it('skips an earlier one with no comment, to the one before it', () => {
    expect(L.earlierMatch(dq('x', 'Topic 7 DQ 2'), [dq('a', 'Topic 5 DQ 2'), dq('b', 'Topic 6 DQ 2', '  ')])?.id).toBe('a');
  });
  it("a discussion's weekly subject does not matter; an assignment's does", () => {
    const D = 'DISCUSSION_QUESTION';
    const c = 'Good use of the reading.';
    expect(L.earlierMatch(dq('x', 'Topic 3 DQ 1: Listening', '', D), [dq('a', 'Topic 2 DQ 1: Memory', c, D), dq('b', 'Topic 2 DQ 2: Sleep', c, D)])?.id).toBe('a');
    const as = (id: string, title: string) => ({ id, title, type: 'ASSIGNMENT', comment: 'Strong thesis.' });
    expect(L.earlierMatch(as('x', 'Topic 6 Assignment: Case Study'), [as('a', 'Topic 5 Assignment: Literature Review')])).toBeNull();
    expect(L.earlierMatch(as('x', 'Week 4 Reflection'), [as('a', 'Week 3 Reflection')])?.id).toBe('a');
  });
  it('nothing when the match is not clear', () => {
    // No topic number in the title.
    expect(L.earlierMatch(dq('x', 'Benchmark - Gospel Essentials'), [dq('a', 'Benchmark - Gospel Essentials')])).toBeNull();
    // Another type, another DQ number, a later topic, only the number.
    expect(L.earlierMatch(dq('x', 'Topic 7 DQ 2'), [dq('a', 'Topic 6 DQ 2', 'ok', 'ASSIGNMENT')])).toBeNull();
    expect(L.earlierMatch(dq('x', 'Topic 7 DQ 2'), [dq('a', 'Topic 6 DQ 1')])).toBeNull();
    expect(L.earlierMatch(dq('x', 'Topic 7 DQ 2'), [dq('a', 'Topic 8 DQ 2')])).toBeNull();
    expect(L.earlierMatch(dq('x', 'Topic 7'), [dq('a', 'Topic 6')])).toBeNull();
    // Two different assignments with the same earlier title.
    expect(L.earlierMatch(dq('x', 'Topic 7 DQ 2'), [dq('a', 'Topic 6 DQ 2'), dq('b', 'Topic 6 DQ 2')])).toBeNull();
    expect(L.earlierMatch(dq('x', 'Topic 7 DQ 2'), [])).toBeNull();
  });
});

describe('participation: the rule and the week (feature 9)', () => {
  it('reads a clearly stated number of separate days', () => {
    expect(L.participationDays('Participation: post on at least three (3) separate days each topic.')).toBe(3);
    expect(L.participationDays('Students must participate in the discussion forum on 4 different days.')).toBe(4);
    expect(L.participationDays('Post substantive replies on two distinct days per week.')).toBe(2);
  });
  it('nothing when no rule is stated, it is not about posting, or two numbers disagree', () => {
    expect(L.participationDays('Participation is 10% of your grade.')).toBeNull();
    expect(L.participationDays('Labs meet on two separate days.')).toBeNull();
    expect(L.participationDays('Post on three separate days. Online students post on four separate days.')).toBeNull();
    expect(L.participationDays('')).toBeNull();
  });
  const start = '2026-10-22T00:00:00-07:00'; // Thu
  const end = '2026-10-29T00:00:00-07:00'; // next Thu
  it('the days posted this week, in the student\'s time zone, and what is left', () => {
    expect(L.participationLine(['2026-10-26T10:00:00-07:00', '2026-10-28T21:00:00-07:00', '2026-10-26T18:00:00-07:00'], start, end, 3, PHX)).toBe('This week: posted Mon, Wed · 1 more day needed');
    expect(L.participationLine(['2026-10-22T09:00:00-07:00', '2026-10-24T09:00:00-07:00', '2026-10-27T09:00:00-07:00'], start, end, 3, PHX)).toBe('This week: posted Thu, Sat, Tue ✓');
    expect(L.participationLine([], start, end, 3, PHX)).toBe('This week: no posts yet · 3 days needed');
    // A post last week does not count.
    expect(L.participationLine(['2026-10-21T23:30:00-07:00'], start, end, 2, PHX)).toBe('This week: no posts yet · 2 days needed');
  });
  it('when the class asks for more than one post a day, a day counts once it has them', () => {
    const twoMon = ['2026-10-26T09:00:00-07:00', '2026-10-26T15:00:00-07:00'];
    expect(L.participationLine([...twoMon, '2026-10-27T10:00:00-07:00'], start, end, 2, PHX, 2)).toBe('This week: posted Mon · 1 more day needed · Tue: 1 of 2 posts');
    expect(L.participationLine(['2026-10-27T10:00:00-07:00'], start, end, 2, PHX, 2)).toBe('This week: no full days yet · 2 days needed · Tue: 1 of 2 posts');
  });
  it('nothing when a date or the week is unreadable', () => {
    expect(L.participationLine(['garbage'], start, end, 3, PHX)).toBeNull();
    expect(L.participationLine([], end, start, 3, PHX)).toBeNull();
    expect(L.participationLine([], start, end, 0, PHX)).toBeNull();
  });
});

describe('drafts: offered once, only when the box is empty and the post did not go through (feature 18)', () => {
  const now = at('2026-10-27T15:00:00-07:00');
  const draft = { text: 'Stoichiometry matters because every reaction in the lab depends on the ratios we balance first.', at: '2026-10-27T14:50:00-07:00' };
  it('offers a recent draft for an empty box', () => {
    expect(L.offerDraft(draft, '', now, [])).toBe(true);
    expect(L.offerDraft(draft, '\u00a0 ', now, [])).toBe(true);
  });
  it('not when the box has text, the draft is tiny or old, or the post is already there', () => {
    expect(L.offerDraft(draft, 'I started again', now, [])).toBe(false);
    expect(L.offerDraft({ text: 'ok', at: draft.at }, '', now, [])).toBe(false);
    expect(L.offerDraft({ ...draft, at: '2026-09-20T10:00:00-07:00' }, '', now, [])).toBe(false);
    expect(L.offerDraft(draft, '', now, [`  ${draft.text}  `])).toBe(false);
    expect(L.offerDraft(draft, '', now, [`${draft.text} And one more line added before posting.`])).toBe(false);
    expect(L.offerDraft(null, '', now, [])).toBe(false);
  });
  it('keeps the newest 40 from the last 30 days', () => {
    const all: Record<string, { text: string; at: string }> = {};
    for (let k = 0; k < 50; k++) all[`k${k}`] = { text: 'three words here', at: new Date(now - k * 3_600_000).toISOString() };
    all.old = { text: 'three words here', at: '2026-09-01T00:00:00Z' };
    const kept = L.pruneDrafts(all, now);
    expect(Object.keys(kept)).toHaveLength(40);
    expect(kept.k0).toBeTruthy();
    expect(kept.old).toBeUndefined();
    expect(kept.k49).toBeUndefined();
  });
});

describe("Halo's own dates, in Halo's zone", () => {
  it('reads "Nov 1, 2026, 11:59 PM" as Phoenix time, and writes it back the same', () => {
    const t = L.haloDateTime('Nov 1, 2026, 11:59 PM', PHX);
    expect(new Date(t as number).toISOString()).toBe('2026-11-02T06:59:00.000Z');
    expect(L.haloFormat(t as number, PHX)).toBe('Nov 1, 2026, 11:59 PM');
    expect(L.haloFormat(t as number, PHX, 'day')).toBe('Sun 11:59 PM');
    expect(L.haloFormat(t as number, PHX, 'short')).toBe('Nov 1, 11:59 PM');
    expect(L.haloDateTime('Oct 26, 2026, 12:05 AM', PHX)).toBe(Date.parse('2026-10-26T07:05:00Z'));
    expect(L.haloDateTime('Oct 26, 2026, 12:05 PM', PHX)).toBe(Date.parse('2026-10-26T19:05:00Z'));
  });
  it('nothing for anything that is not exactly a Halo date', () => {
    for (const bad of ['', 'Nov 1, 2026', 'Nov 1, 2026, 11:59', 'November 1, 2026, 11:59 PM', 'Feb 30, 2026, 1:00 PM', 'Nov 1, 2026, 13:00 PM', '-', 'Due Nov 1, 2026, 11:59 PM'])
      expect(L.haloDateTime(bad, PHX)).toBeNull();
    expect(L.haloDateTime('Nov 1, 2026, 11:59 PM', '')).toBeNull();
    // A time that does not exist in a zone with daylight saving.
    expect(L.haloDateTime('Mar 8, 2026, 2:30 AM', 'America/New_York')).toBeNull();
  });
});

describe("Halo's class colours", () => {
  it('the same hash and palette as Halo', () => {
    // Checked against Halo's own function (research B): "CHM-113-O500" is colour 26.
    expect(L.classColor('CHM-113-O500', 'CHM-113', '2026-09-08').name).toBe('LightAqua');
    expect(L.classColor('CHM-113-O500', 'CHM-113', '2026-09-08').css).toBe('var(--lms-colorClassCardLightAqua, #73cedf)');
    // Classes from before 2025-08-28 use the first 11 colours, hashed on the class code.
    expect(['Pink', 'Purple', 'Indigo', 'Blue', 'Cyan', 'Teal', 'Green', 'Lime', 'Orange', 'DeepOrange', 'Brown']).toContain(L.classColor('X', 'ENG-105', '2024-01-08').name);
  });
});

describe('the index on this computer, and where things open on Halo', () => {
  const payload = {
    exportedAt: '2026-10-27T20:00:00Z',
    classes: [
      {
        id: 'cls-1', slugId: 'CHM-113-O500-20260908', classCode: 'CHM-113-O500', courseCode: 'CHM-113', name: 'General Chemistry', startDate: '2026-09-08',
        participation: { days: 3, posts: 1 },
        discussions: [{ forumId: 'forum-9', contextId: 'dq-1', title: 'Topic 3 DQ 1' }],
        assessments: [
          { id: 'as-1', title: 'Topic 3 Lab Report', type: 'ASSIGNMENT', unit: 'Topic 3: Stoichiometry', unitId: 'u3', unitSequence: 3, dueDate: '2026-10-30T06:59:00Z', attachments: [{ id: 'att', resourceId: 'res-1', title: 'Lab template.docx' }] },
          { id: 'q-1', title: 'Topic 3 Quiz', type: 'QUIZ', unit: 'Topic 3: Stoichiometry', unitId: 'u3' },
          { id: 'dq-1', title: 'Topic 3 DQ 1', type: 'DISCUSSION_QUESTION', unit: 'Topic 3: Stoichiometry', unitId: 'u3' },
          { id: 'dq-2', title: 'Topic 3 DQ 2', type: 'DISCUSSION_QUESTION', unit: 'Topic 3: Stoichiometry', unitId: 'u3' },
          { id: 'g-1', title: 'Group Project', type: 'ASSIGNMENT', unitId: 'u3', isGroupEnabled: true },
          { id: 'lti-1', title: 'Publisher Homework', type: 'LTI', unitId: 'u3' },
        ],
        announcements: [{ id: 'p-1', title: 'Quiz moved', publishedAt: '2026-10-26T18:00:00Z', resources: [{ id: 'r-ann', name: 'Slides.pdf', kind: 'FILE' }, { id: 'r-url', name: 'Link', kind: 'URL' }] }],
        resources: [{ id: 'ccr-1', title: 'Week 3', unit: 'Topic 3: Stoichiometry', files: [{ id: 'file-1', name: 'Periodic table.pdf', kind: 'FILE' }] }],
      },
    ],
  };
  const idx = L.buildIndex(payload);
  const href = (title: string) => idx.rows.find((r) => r.title === title)?.href ?? null;
  it("Halo's own addresses, and none where Halo+ cannot be sure", () => {
    expect(href('Topic 3 Lab Report')).toBe('/courses/CHM-113-O500-20260908/course-units/u3#assignment-submission/as-1');
    expect(href('Topic 3 Quiz')).toBe('/quiz/q-1?slugId=CHM-113-O500-20260908');
    expect(href('Topic 3 DQ 1')).toBe('/courses/CHM-113-O500-20260908/forums/discussion/forum-9');
    expect(href('Topic 3 DQ 2')).toBeNull();
    expect(href('Group Project')).toBe('/courses/CHM-113-O500-20260908/groups?assessmentId=g-1');
    expect(href('Publisher Homework')).toBeNull();
    expect(href('Topic 3: Stoichiometry')).toBe('/courses/CHM-113-O500-20260908/course-units/u3');
    expect(href('Quiz moved')).toBe('/courses/CHM-113-O500-20260908/announcements?pId=p-1');
    expect(href('Slides.pdf')).toBe('/resource/r-ann');
    expect(href('Link')).toBeNull();
    expect(href('Lab template.docx')).toBe('/resource/res-1');
    expect(href('Periodic table.pdf')).toBe('/resource/ccr-1?nestedResourceId=file-1');
  });
  it('the class: colour, participation rule', () => {
    // Halo hashes the whole slug, date and all.
    expect(idx.classes[0].col).toBe(L.classColor('CHM-113-O500-20260908', 'CHM-113-O500', '2026-09-08').css);
    expect(idx.classes[0].part).toEqual({ days: 3, posts: 1 });
  });
  it('an empty or broken sync gives an empty index', () => {
    expect(L.buildIndex(null).rows).toEqual([]);
    expect(L.buildIndex({ classes: [null, { slugId: '' }] }).classes).toEqual([]);
  });
});

describe('fetching ahead only when it costs nothing (feature 13)', () => {
  const base = { visible: true, saveData: false, effectiveType: '4g', battery: null };
  it('a desktop in front, on a fast connection', () => {
    expect(L.preloadOk(base)).toBe(true);
    expect(L.preloadOk({ ...base, effectiveType: null })).toBe(true);
    expect(L.preloadOk({ ...base, battery: { charging: true, level: 0.1 } })).toBe(true);
    expect(L.preloadOk({ ...base, battery: { charging: false, level: 0.8 } })).toBe(true);
    // A machine with no battery that reports 0% "not charging".
    expect(L.preloadOk({ ...base, battery: { charging: false, level: 0 } })).toBe(true);
  });
  it('never in the background, with data saver, on a slow connection, or on a low battery', () => {
    expect(L.preloadOk({ ...base, visible: false })).toBe(false);
    expect(L.preloadOk({ ...base, saveData: true })).toBe(false);
    expect(L.preloadOk({ ...base, effectiveType: '3g' })).toBe(false);
    expect(L.preloadOk({ ...base, effectiveType: 'slow-2g' })).toBe(false);
    expect(L.preloadOk({ ...base, battery: { charging: false, level: 0.19 } })).toBe(false);
  });
});

describe('the calendar: each item on its due day, as Halo dates it (feature 1, 0.12.1)', () => {
  type Item = { id: string; code: string; short: string; time: string; done: boolean; quiet: boolean; over: boolean; graded: boolean; part: boolean };
  type Day = { items: Item[]; part: Item[]; hol: string[] };
  const C = L as unknown as {
    calendarDays: (index: unknown, live: Record<string, Map<string, { dueDate: string | null; status: string | null }> | null>, tz: string, now: number, o?: { doneIds?: Set<string>; quietIds?: Set<string> }) => Map<string, Day>;
    chipTitle: (t: string) => string;
  };
  const PHX = 'America/Phoenix';
  const index = {
    classes: [
      { slug: 'CHM-113-A', code: 'CHM-113', cc: 'CHM-113-MW900A', col: '#e91e63', hol: [{ t: 'Fall Break', s: '2026-11-26T07:00:00Z', n: 2 }] },
      { slug: 'PSY-102-B', code: 'PSY-102', cc: 'PSY-102-O500', col: '#2196f3', hol: [{ t: 'Fall Break', s: '2026-11-26T07:00:00Z', n: 2 }] },
    ],
    rows: [
      { c: 0, kind: 'quiz', id: 'exam1', title: 'Exam 1', href: '/quiz/exam1', cdue: '2026-10-31T06:59:00Z', pts: 100 },
      { c: 0, kind: 'assignment', id: 'hw3', title: 'Topic 3 Homework: Stoichiometry and Limiting Reagents', href: '/x', cdue: '2026-10-31T06:59:00Z', pts: 20 },
      { c: 0, kind: 'assignment', id: 'survey', title: 'Course Survey', href: '/s', cdue: '2026-10-30T16:00:00Z', pts: 0 },
      { c: 0, kind: 'participation', id: 'p1', title: 'Topic 3 Participation', href: '/p', cdue: '2026-10-31T06:59:00Z', pts: 10 },
      { c: 0, kind: 'lti', id: 'lab', title: 'In-lab practical', href: null, cdue: '2026-10-28T20:00:00Z', pts: 15, ns: 1 },
      { c: 0, kind: 'assignment', id: 'midnight', title: 'Reading Notes', href: '/m', cdue: '2026-11-02T07:00:00Z', pts: 5 },
      { c: 0, kind: 'announcement', id: 'a1', title: 'Welcome', href: '/a' },
      { c: 1, kind: 'discussion', id: 'dq', title: 'Topic 3 DQ 1: Memory', href: '/d', cdue: '2026-10-30T06:59:00Z', pts: 10 },
    ],
  };
  const live = (over: Record<string, { dueDate: string | null; status: string | null }> = {}) => ({
    'CHM-113-A': new Map(['exam1', 'hw3', 'survey', 'p1', 'lab', 'midnight'].map((id) => [id, over[id] ?? { dueDate: null, status: 'ACTIVE' }])),
    'PSY-102-B': new Map([['dq', over.dq ?? { dueDate: null, status: 'ACTIVE' }]]),
  });
  const now = Date.parse('2026-10-29T19:00:00Z'); // Thu Oct 29, 12:00 PM in Phoenix
  it('on its due day only, in Halo’s school zone, with Halo’s time', () => {
    const d = C.calendarDays(index, live(), PHX, now);
    expect(d.get('2026-10-30')!.items.map((i) => `${i.code} · ${i.short} · ${i.time}`)).toEqual(['CHM-113 · Exam 1 · 11:59 PM', 'CHM-113 · Topic 3 Homework · 11:59 PM', 'CHM-113 · Course Survey · 9:00 AM']);
    expect(d.get('2026-10-29')!.items.map((i) => i.code)).toEqual(['PSY-102']);
    expect(d.has('2026-10-31')).toBe(false);
  });
  it('an item due at midnight is on the day Halo shows ("Nov 2, 2026, 12:00 AM")', () => {
    const d = C.calendarDays(index, live(), PHX, now);
    expect(d.get('2026-11-02')!.items.map((i) => [i.id, i.time])).toEqual([['midnight', '12:00 AM']]);
    expect(d.get('2026-11-01')).toBeUndefined();
  });
  it('a date Halo moved for this student is on its new day; the class’s date is not used', () => {
    const d = C.calendarDays(index, live({ exam1: { dueDate: '2026-11-03T06:59:00Z', status: 'ACTIVE' } }), PHX, now);
    expect(d.get('2026-10-30')!.items.some((i) => i.id === 'exam1')).toBe(false);
    expect(d.get('2026-11-02')!.items.some((i) => i.id === 'exam1')).toBe(true);
  });
  it('a class Halo did not answer for is left out, not guessed', () => {
    const d = C.calendarDays(index, { 'CHM-113-A': live()['CHM-113-A'], 'PSY-102-B': null }, PHX, now);
    expect([...d.values()].flatMap((x) => x.items).some((i) => i.code === 'PSY-102')).toBe(false);
  });
  it('graded work first, then by time; participation on its own line, never overdue', () => {
    const later = Date.parse('2026-11-01T12:00:00Z');
    const d = C.calendarDays(index, live(), PHX, later);
    const fri = d.get('2026-10-30')!;
    expect(fri.items.map((i) => i.id)).toEqual(['exam1', 'hw3', 'survey']);
    expect(fri.part.map((i) => i.id)).toEqual(['p1']);
    expect(fri.part[0].over).toBe(false);
    expect(fri.items[0].over).toBe(true);
  });
  it('done: Halo’s own status or a Halo+ check-off; no submission in Halo and past: quiet, not overdue', () => {
    const d = C.calendarDays(index, live({ exam1: { dueDate: null, status: 'SUBMITTED' } }), PHX, Date.parse('2026-11-01T12:00:00Z'), { doneIds: new Set(['hw3']) });
    const fri = d.get('2026-10-30')!;
    expect(fri.items.filter((i) => i.done).map((i) => i.id)).toEqual(['exam1', 'hw3']);
    const lab = d.get('2026-10-28')!.items[0];
    expect([lab.quiet, lab.over, lab.done]).toEqual([true, false, false]);
  });
  it('the same holiday from two classes is one line a day', () => {
    const d = C.calendarDays(index, live(), PHX, now);
    expect(d.get('2026-11-26')!.hol).toEqual(['Fall Break']);
    expect(d.get('2026-11-27')!.hol).toEqual(['Fall Break']);
    expect(d.get('2026-11-28')).toBeUndefined();
  });
  it('a long title is cut at its colon; a short one is kept', () => {
    expect(C.chipTitle('Topic 3 Homework: Stoichiometry and Limiting Reagents')).toBe('Topic 3 Homework');
    expect(C.chipTitle('Exam 1: Ch 1-4')).toBe('Exam 1: Ch 1-4');
    expect(C.chipTitle('A really long title without any colon at all here')).toBe('A really long title without any colon at all here');
  });
  it('nothing without Halo’s zone or an index', () => {
    expect(C.calendarDays(index, live(), '', now).size).toBe(0);
    expect(C.calendarDays(null, live(), PHX, now).size).toBe(0);
  });
});

describe('each class in its card’s colour, the bold version (feature 1, 0.12.2)', () => {
  const C = L as unknown as { boldColor: (c: string, dark?: boolean) => string | null };
  it('a pale pastel stripe becomes a clear version of its own hue on a light page', () => {
    expect(C.boldColor('#c0a5ff')).toBe('rgb(97, 44, 221)');
    expect(C.boldColor('rgb(190, 228, 250)')).toBe('rgb(44, 156, 221)');
  });
  it('a strong colour stays as Halo drew it; a grayish one stays grayish', () => {
    expect(C.boldColor('#522398')).toBe('rgb(82, 35, 152)');
    expect(C.boldColor('#e91e63')).toBe('rgb(233, 30, 99)');
    expect(C.boldColor('#d5cdc9')).toBe('rgb(148, 128, 117)');
  });
  it('under a dark theme, a very deep colour is lifted so it shows; a light one stays', () => {
    expect(C.boldColor('#522398', true)).toBe('rgb(146, 97, 219)');
    expect(C.boldColor('#c0a5ff', true)).toBe('rgb(192, 165, 255)');
  });
  it('nothing for what is not a colour', () => {
    expect(C.boldColor('var(--x)')).toBeNull();
    expect(C.boldColor('')).toBeNull();
  });
});

describe('the class card’s NEXT: up to three things, exactly as Halo has them (0.12.5; participation posts since 0.12.6)', () => {
  type N = { id: string; when: string; why?: string; href: string };
  const C = L as unknown as { cardNext: (index: unknown, k: number, live: Map<string, { dueDate: string | null; status: string | null }> | null, now: number, tz: string, o?: { doneIds?: Set<string> }) => N[] | null };
  const PHX = 'America/Phoenix';
  const now = Date.parse('2026-10-28T19:00:00Z'); // Wed Oct 28, 12:00 PM in Phoenix
  const at = (d: number, h: number) => new Date(Date.parse('2026-10-28T07:00:00Z') + d * 864e5 + h * 36e5).toISOString(); // Phoenix midnight + d days + h
  const rows = [
    { c: 0, kind: 'assignment', id: 'late', title: 'Late one', href: '/a', cdue: at(-1, 23), start: at(-7, 0) },
    { c: 0, kind: 'quiz', id: 'q', title: 'Quiz 2', href: '/q', cdue: at(2, 23.98), start: at(-3, 0) },
    { c: 0, kind: 'assignment', id: 'hw', title: 'Homework 3.3', href: '/hw', cdue: at(0, 23.98), start: at(-3, 0) },
    { c: 0, kind: 'discussion', id: 'dq', title: 'Topic 3 DQ 1', href: '/dq', cdue: at(1, 12), start: at(-2, 0) },
    { c: 0, kind: 'assignment', id: 'later', title: 'Project 2', href: '/p2', cdue: at(9, 23.98), start: at(5, 0) },
    { c: 0, kind: 'assignment', id: 'exam', title: 'Exam 1', href: '/ex', cdue: at(2, 9), start: at(-3, 0), ns: 1, inp: 1 },
    { c: 0, kind: 'assignment', id: 'done', title: 'Done one', href: '/d', cdue: at(1, 23), start: at(-3, 0) },
    { c: 0, kind: 'participation', id: 'part', title: 'Participation', href: '/pa', cdue: at(1, 23), start: at(-3, 0) },
    { c: 0, kind: 'assignment', id: 'far', title: 'Far away', href: '/f', cdue: at(30, 23), start: at(20, 0) },
    { c: 0, kind: 'lti', id: 'nohref', title: 'Outside tool', href: null, cdue: at(1, 10), start: at(-3, 0) },
    { c: 0, kind: 'assignment', id: 'oldidx', title: 'In class, old index', href: '/o', cdue: at(1, 9), start: at(-3, 0), ns: 1 },
  ];
  const live = (o: Record<string, string> = {}) => new Map(rows.map((r) => [r.id, { dueDate: null, status: o[r.id] ?? (r.id === 'done' ? 'SUBMITTED' : 'ACTIVE') }]));
  it('what can be done now first, soonest due first; at most three', () => {
    const n = C.cardNext({ rows }, 0, live(), now, PHX)!;
    expect(n.map((x) => [x.id, x.when])).toEqual([['hw', 'today 11:58 PM'], ['dq', 'tomorrow 12:00 PM'], ['part', 'tomorrow 11:00 PM']]);
  });
  it('then what cannot be acted on yet, with why: done in class, or not open yet', () => {
    const n = C.cardNext({ rows }, 0, live({ hw: 'SUBMITTED', dq: 'SUBMITTED' }), now, PHX)!;
    expect(n.map((x) => [x.id, x.why ?? ''])).toEqual([['part', ''], ['q', ''], ['exam', 'in class Fri']]);
    const m = C.cardNext({ rows }, 0, live({ hw: 'SUBMITTED', dq: 'SUBMITTED', part: 'SUBMITTED' }), now, PHX)!;
    expect(m.map((x) => [x.id, x.why ?? ''])).toEqual([['q', ''], ['exam', 'in class Fri'], ['later', 'opens Mon']]);
  });
  it('participation posts show (never urgent); never done work (Halo’s status or a Halo+ check-off), past due, far off, or without an address', () => {
    const n = C.cardNext({ rows }, 0, live(), now, PHX, { doneIds: new Set(['hw', 'dq', 'q']) })!;
    expect(n.map((x) => x.id)).toEqual(['part', 'exam', 'later']);
    expect(n.some((x) => ['done', 'late', 'far', 'nohref'].includes(x.id))).toBe(false);
  });
  it('an item whose kind of submission the index cannot tell is left out, not guessed', () => {
    const n = C.cardNext({ rows }, 0, live(), now, PHX, { doneIds: new Set(['hw', 'dq', 'q', 'exam', 'later', 'part']) })!;
    expect(n).toEqual([]);
  });
  it('nothing at all without Halo’s answer for the class', () => {
    expect(C.cardNext({ rows }, 0, null, now, PHX)).toBeNull();
  });
});
