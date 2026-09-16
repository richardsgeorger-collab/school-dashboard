import { describe, expect, it } from 'vitest';
import { mkCourse, mkItem, TZ } from '../halo/fixtures';
import { computeSchedule } from '../domain/schedule';
import { DEFAULT_SETTINGS, type AppData, type Item } from '../domain/types';
import { mergeItem } from '../halo/diff';
import type { Deck, DeckPage } from '../library/db';
import type { Recording } from '../record/db';
import { jsonFromText } from '../ai/client';
import { applyPlan, defaultPlanSelection, gateKey } from './apply';
import { approxTokens, contextBlocks, gatherClassContext, type ContextLoaders } from './context';
import { diffPlan, diffSummary } from './diff';
import { detailRefs, mergeDetail, mergeMaterial, planFromCore, type ClassPlan } from './plan';
import { runClassPass, runTermPass, type Cache } from './run';
import { buildTermInput, buildTermPrompt, termFromTool } from './term';

const eng = mkCourse({ id: 'eng', code: 'ENG-105', name: 'English Composition I', termStart: '2026-08-31', termEnd: '2026-12-13' });
const chm = mkCourse({ id: 'chm', code: 'CHM-113', name: 'General Chemistry I', termStart: '2026-08-31', termEnd: '2026-12-13' });
const at = (d: string) => `${d}T23:59:00-07:00`;
const today = '2026-09-15';
const items: Item[] = [
  mkItem({ id: 'draft', courseId: 'eng', title: 'First Draft of an Op-Ed Assignment', label: 'Eng Op-Ed Draft', type: 'paper', points: 100, dueAt: at('2026-10-18'), estimatedMinutes: 100, notes: 'Write a 750-word first draft of your op-ed. Cite two sources in APA. Submit to LopesWrite.' }),
  mkItem({ id: 'final', courseId: 'eng', title: 'Final Draft of an Op-Ed Assignment (Online)', label: 'Eng Op-Ed Final', type: 'paper', points: 200, dueAt: at('2026-11-01'), estimatedMinutes: 200, notes: 'Revise the draft into a 1,000-word op-ed. Three sources. Rubric attached.' }),
  mkItem({ id: 'dq', courseId: 'eng', title: 'Topic 3 DQ 1', label: 'Eng DQ 3.1', type: 'discussion', points: 5, dueAt: at('2026-09-30'), estimatedMinutes: 25 }),
  mkItem({ id: 'set', courseId: 'eng', title: 'Topic 2 Quiz', label: 'Eng Quiz 2', type: 'quiz', points: 20, dueAt: at('2026-09-25'), estimatedMinutes: 40, startByOverride: '2026-09-23' }),
  mkItem({ id: 'done', courseId: 'eng', title: 'Class Introductions', label: 'Eng Intro', type: 'discussion', points: 0, dueAt: at('2026-09-02'), status: 'done', completedAt: at('2026-09-01') }),
  mkItem({ id: 'exam', courseId: 'chm', title: 'Exam 1', label: 'Chem Exam 1', type: 'exam', points: 100, dueAt: at('2026-10-16'), estimatedMinutes: 300 }),
];
const data: AppData = { courses: [eng, chm], items, settings: { ...DEFAULT_SETTINGS, timezone: TZ } };
const decks: Deck[] = [
  { id: 'd1', courseId: 'eng', title: 'Rhetorical Appeals', tag: 'Topic 2', date: '2026-09-09', fileName: 'appeals.pptx', kind: 'pptx', mimeType: '', bytes: 1, pages: 3, chars: 1, addedAt: '', recordingId: null, fileDeleted: false },
  { id: 'd2', courseId: 'eng', title: 'Op-Ed Rubric', tag: '', date: '2026-09-09', fileName: 'op-ed-rubric.pdf', kind: 'pdf', mimeType: '', bytes: 1, pages: 1, chars: 1, addedAt: '', recordingId: null, fileDeleted: false },
  { id: 'd3', courseId: 'chm', title: 'Stoichiometry', tag: 'Topic 3', date: '2026-09-10', fileName: 's.pptx', kind: 'pptx', mimeType: '', bytes: 1, pages: 1, chars: 1, addedAt: '', recordingId: null, fileDeleted: false },
];
const pages: Record<string, DeckPage[]> = {
  d1: [
    { deckId: 'd1', n: 1, text: 'Ethos, pathos, logos\nThe three appeals' },
    { deckId: 'd1', n: 2, text: 'Ethos\ncredibility of the speaker' },
    { deckId: 'd1', n: 3, text: 'Op-ed structure\nhook, claim, evidence, call' },
  ],
  d2: [{ deckId: 'd2', n: 1, text: 'Op-Ed Rubric\nThesis 20 pts: a clear arguable claim\nEvidence 30 pts: two credible sources\nAPA 10 pts' }],
  d3: [{ deckId: 'd3', n: 1, text: 'Mole ratios' }],
};
const recordings: Recording[] = [
  { id: 'r1', courseId: 'eng', title: 'ENG-105 lecture', startedAt: '2026-09-09T14:00:00.000Z', endedAt: null, status: 'done', durationMs: 1, bytes: 0, mimeType: '', chunkCount: 0, segmentCount: 1, audioDeleted: true, processedAt: null, review: {}, notes: { summary: ['Covered the three appeals.'], concepts: ['ethos', 'pathos'], mentions: [{ id: 'm1', quote: 'the op-ed draft is due the eighteenth', kind: 'info', title: 'Op-Ed draft', date: '2026-10-18', time: null, points: null, confidence: 'high', itemId: 'draft' }], model: 'x', createdAt: '', knowledge: { emphasized: [{ point: 'Logos carries an op-ed', quote: 'logos carries it', at: '12:30' }], examFlags: [{ point: 'Know the three appeals', quote: 'this is on the test', at: '14:02' }], dwelt: [], skipped: [], terms: [], deckId: 'd1' } } },
];
const loaders: ContextLoaders = {
  decks: async () => decks,
  pages: async (id) => pages[id] ?? [],
  recordings: async () => recordings,
  syllabus: async (courseId) => (courseId === 'eng' ? { courseId, name: 'syllabus.pdf', text: 'ENG-105 Syllabus. Late work loses 10% per day. Week 8: peer review of the op-ed draft in class.', chars: 1, addedAt: '' } : null),
};
const startByOf = (id: string) => ({ draft: '2026-10-14', final: '2026-10-27', dq: '2026-09-29', set: '2026-09-23', exam: '2026-10-10' })[id];

const rawCore = {
  items: [
    { ref: 'A1', asks: 'A 0-point intro post.', start_by: '', start_why: 'Already handed in.', minutes: 0, minutes_why: '', confidence: 'high', unsure: [], flags: [], topics: [] },
    { ref: 'A2', asks: 'A 20-question quiz on the appeals.', start_by: '2026-09-22', start_why: 'Two evenings of review.', minutes: 60, minutes_why: 'Twenty questions plus a read of the deck.', confidence: 'medium', unsure: [], flags: ['timed'], topics: ['rhetorical appeals'] },
    { ref: 'A3', asks: 'One post answering the prompt, 150 words, and two replies.', start_by: '2026-09-29', start_why: 'A post; the day before is enough.', minutes: 30, minutes_why: 'Short post and two replies.', confidence: 'high', unsure: [], flags: [], topics: ['argument'] },
    { ref: 'A4', asks: 'A 750-word first draft of your op-ed with two APA sources, through LopesWrite.', start_by: '2026-10-08', start_why: 'Ten days: pick the issue, find two sources, draft 750 words, leave a day for LopesWrite.', minutes: 240, minutes_why: '750 words with two sources is four hours for a first draft.', confidence: 'medium', unsure: [], flags: ['lopes_write'], topics: ['op-ed', 'rhetorical appeals'] },
    { ref: 'A5', asks: 'Revise the draft to 1,000 words with three sources.', start_by: '2026-11-05', start_why: 'Revision of an existing draft.', minutes: 210, minutes_why: 'Revision plus one more source.', confidence: 'medium', unsure: ['minutes'], flags: ['lopes_write', 'nonsense'], topics: ['op-ed'] },
    { ref: 'A9', asks: 'ghost', start_by: '', start_why: '', minutes: 0, minutes_why: '', confidence: 'low', unsure: [], flags: [], topics: [] },
  ],
};

const rawDetail = {
  items: [
    { ref: 'A4', milestones: ['Pick the issue', 'Find two sources', 'Outline', 'Draft 750 words', 'Check APA', 'Run LopesWrite'], prerequisites: ['Peer review of the draft happens in class in week 8.'], prerequisite_sources: ['syllabus'], prerequisite_refs: [''], feeds: 'A5' },
    { ref: 'A5', milestones: ['Read the draft feedback', 'Add a source', 'Revise', 'Proofread'], prerequisites: ['The first draft has to be done first.'], prerequisite_sources: ['Halo description'], prerequisite_refs: ['A4'], feeds: '' },
    { ref: 'A9', milestones: ['ghost'], prerequisites: [], prerequisite_sources: [], prerequisite_refs: [], feeds: '' },
  ],
  discovered: [
    { title: 'Peer review of the op-ed draft', due: '', points: 0, type: 'other', quote: 'Week 8: peer review of the op-ed draft in class.', source: 'syllabus', confidence: 'medium', why: 'In-class work not in Halo.' },
    { title: 'Reading response 1', due: '2026-09-28', points: 10, type: 'homework', quote: 'A reading response is due the Monday of week five.', source: 'syllabus', confidence: 'high', why: 'Not in the Halo list.' },
    { title: 'Op-Ed Final Draft', due: '2026-11-01', points: 200, type: 'paper', quote: 'final draft due Nov 1', source: 'syllabus', confidence: 'high', why: 'dup' },
  ],
  topics: [
    { name: 'rhetorical appeals', week: 2, builds_on: [] },
    { name: 'op-ed', week: 6, builds_on: ['rhetorical appeals', 'argument'] },
  ],
};

const rawMaterial = {
  items: [
    { ref: 'A2', sources: ['Rhetorical Appeals deck, slides 1–3'], citations: ['Halo description'] },
    { ref: 'A4', sources: ['Rhetorical Appeals deck, slide 3', 'Op-Ed Rubric'], citations: ['Halo description', 'rubric: Op-Ed Rubric'] },
    { ref: 'A9', sources: ['ghost deck'], citations: [] },
  ],
};

/** The three passes read in order, the way a real run does. */
const readAll = (ctx: Parameters<typeof planFromCore>[1]) => mergeMaterial(mergeDetail(planFromCore(rawCore, ctx, 'test-model', '2026-09-15T10:00:00.000Z'), rawDetail, ctx), rawMaterial, ctx);

describe('gathering what the app has for one class', () => {
  it('numbers the items, keeps descriptions, splits rubric files from slide outlines, and reads what the lecture stressed', async () => {
    const ctx = await gatherClassContext(eng, data, today, startByOf, loaders);
    expect(ctx.assessments.map((a) => [a.ref, a.title, a.due, a.startByNow, a.overrides.startBy])).toEqual([
      ['A1', 'Class Introductions', '2026-09-02', null, false],
      ['A2', 'Topic 2 Quiz', '2026-09-25', '2026-09-23', true],
      ['A3', 'Topic 3 DQ 1', '2026-09-30', '2026-09-29', false],
      ['A4', 'First Draft of an Op-Ed Assignment', '2026-10-18', '2026-10-14', false],
      ['A5', 'Final Draft of an Op-Ed Assignment (Online)', '2026-11-01', '2026-10-27', false],
    ]);
    expect(ctx.decks.map((d) => [d.title, d.outline])).toEqual([['Rhetorical Appeals', ['1. Ethos, pathos, logos', '2. Ethos', '3. Op-ed structure']]]);
    expect(ctx.rubrics.map((r) => r.title)).toEqual(['Op-Ed Rubric']);
    expect(ctx.lectures[0]).toMatchObject({ emphasized: ['Logos carries an op-ed'], examFlags: ['Know the three appeals'], deadlines: ['Op-Ed draft — 2026-10-18 ("the op-ed draft is due the eighteenth")'] });
    expect(ctx.syllabus).toContain('Late work');
    expect(ctx.otherClasses).toEqual([{ code: 'CHM-113', name: 'General Chemistry I' }]);
    const blocks = contextBlocks(ctx);
    expect(blocks.stable).toContain('## Rubric or handout: Op-Ed Rubric');
    expect(blocks.stable).toContain('Called exam material: Know the three appeals');
    expect(blocks.volatile).toContain('[A4] "First Draft of an Op-Ed Assignment" · paper · due 2026-10-18 11:59 PM · 100 pts');
    expect(blocks.volatile).toContain('(start set by the student)');
    expect(blocks.volatile).toContain('Description: Write a 750-word first draft');
    expect(approxTokens(ctx)).toBeGreaterThan(200);
    // The hash ignores the date so a new day alone never re-reasons a class.
    const tomorrow = await gatherClassContext(eng, data, '2026-09-16', startByOf, loaders);
    expect(tomorrow.inputHash).toBe(ctx.inputHash);
    const edited = await gatherClassContext(eng, { ...data, items: items.map((i) => (i.id === 'dq' ? { ...i, notes: 'new prompt' } : i)) }, today, startByOf, loaders);
    expect(edited.inputHash).not.toBe(ctx.inputHash);
    // What the plan writes back (minutes, an accepted start, a done mark) never makes the class look changed.
    const found = { ...items[2], id: 'found1', title: 'Reading response 1', plan: { asks: '', startBy: null, minutes: null, milestones: [], prerequisites: [], flags: { lopesWrite: false, timed: false, group: false, inPerson: false }, topics: [], feeds: null, sources: [], citations: [], model: 'm', at: '', inputHash: 'h', found: true } };
    const applied = await gatherClassContext(eng, { ...data, items: [...items.map((i) => (i.id === 'draft' ? { ...i, estimatedMinutes: 240, startByPlan: '2026-10-08', status: 'in_progress' as const, flags: { ...i.flags, lopesWrite: true }, topic: 'op-ed' } : i)), found] }, today, startByOf, loaders);
    expect(applied.inputHash).toBe(ctx.inputHash);
  });
});

describe('reading the three passes', () => {
  it('pass A maps refs, collapses one confidence per item, reads flags from plain words, and clamps a start after the due date', async () => {
    const ctx = await gatherClassContext(eng, data, today, startByOf, loaders);
    const plan = planFromCore(rawCore, ctx, 'test-model', '2026-09-15T10:00:00.000Z');
    expect(Object.keys(plan.items).sort()).toEqual(['done', 'dq', 'draft', 'final', 'set']);
    expect(plan.items.draft).toMatchObject({ startBy: { value: '2026-10-08', confidence: 'medium' }, minutes: { value: 240, confidence: 'medium' }, flags: { lopesWrite: true, timed: false }, topics: ['op-ed', 'rhetorical appeals'] });
    expect(plan.items.set.flags).toEqual({ lopesWrite: false, timed: true, group: false, inPerson: false });
    // One confidence per item, lowered for the field the model named as the shaky one.
    expect(plan.items.final.minutes).toMatchObject({ value: 210, confidence: 'low' });
    expect(plan.items.final.startBy).toMatchObject({ value: '2026-10-31', confidence: 'low' });
    expect(plan.items.final.startBy?.why).toContain('moved to the day before');
    // An empty start and a zero estimate mean "cannot say", not a date of nothing.
    expect(plan.items.done.startBy).toBeNull();
    expect(plan.items.done.minutes).toBeNull();
    expect(plan.missing).toEqual([]);
    expect(plan.inputHash).toBe(ctx.inputHash);
    expect(planFromCore({ items: rawCore.items.slice(0, 2) }, ctx, 'm').missing).toEqual(['A3', 'A4', 'A5']);
    // Nothing from B or C is invented by A.
    expect(plan.items.draft.milestones).toEqual([]);
    expect(plan.items.draft.sources).toEqual([]);
  });
  it('pass B asks only about work with parts, and lands milestones, prerequisites, found work, and the topic map', async () => {
    const ctx = await gatherClassContext(eng, data, today, startByOf, loaders);
    const core = planFromCore(rawCore, ctx, 'm');
    // The two papers, heaviest first. The quiz, the post, and the done intro are not worth a second call.
    expect(detailRefs(core, ctx)).toEqual(['A5', 'A4']);
    const plan = mergeDetail(core, rawDetail, ctx);
    expect(plan.items.draft.milestones.length).toBe(6);
    expect(plan.items.draft.feeds).toBe('final');
    expect(plan.items.final.prerequisites).toEqual([{ text: 'The first draft has to be done first.', source: 'Halo description', itemId: 'draft' }]);
    expect(plan.items.draft.prerequisites).toEqual([{ text: 'Peer review of the draft happens in class in week 8.', source: 'syllabus', itemId: null }]);
    // The final draft the syllabus repeats is already in Halo; the reading response is not. A quote with no number is a guess.
    expect(plan.discovered.map((d) => [d.title, d.due, d.confidence])).toEqual([
      ['Peer review of the op-ed draft', null, 'medium'],
      ['Reading response 1', '2026-09-28', 'low'],
    ]);
    expect(plan.topics[1]).toEqual({ name: 'op-ed', week: 6, buildsOn: ['rhetorical appeals', 'argument'] });
  });
  it('pass C works out what each named source is and where it opens, and skips names that are not on file', async () => {
    const ctx = await gatherClassContext(eng, data, today, startByOf, loaders);
    const plan = readAll(ctx);
    expect(plan.items.draft.sources).toEqual([
      { kind: 'slide', label: 'Rhetorical Appeals deck, slide 3', href: '#/library?v=slides&deck=d1' },
      { kind: 'rubric', label: 'Op-Ed Rubric', href: '#/library?v=slides&deck=d2' },
    ]);
    expect(plan.items.draft.citations).toEqual(['Halo description', 'rubric: Op-Ed Rubric']);
    expect(plan.items.set.sources[0]).toMatchObject({ kind: 'slide', href: '#/library?v=slides&deck=d1' });
    expect(plan.items.dq.sources).toEqual([]);
  });
});

describe('the diff and what applying it writes', () => {
  const setup = async () => {
    const ctx = await gatherClassContext(eng, data, today, startByOf, loaders);
    return { ctx, plan: readAll(ctx) };
  };
  it('proposes starts, minutes, steps, gates, and flags; leaves overrides, done items, and declined fields alone', async () => {
    const { plan } = await setup();
    const diff = diffPlan(eng, items, plan, null, startByOf);
    expect(diff.startBy.map((c) => [c.itemId, c.from, c.to])).toEqual([
      ['draft', '2026-10-14', '2026-10-08'],
      ['final', '2026-10-27', '2026-10-31'],
    ]);
    // The final's 210 is within noise of its 200; the quiz's 60 is not.
    expect(diff.minutes.map((c) => [c.itemId, c.from, c.to])).toEqual([
      ['set', 40, 60],
      ['draft', 100, 240],
    ]);
    expect(diff.steps.map((s) => [s.itemId, s.steps.length])).toEqual([
      ['draft', 6],
      ['final', 4],
    ]);
    expect(diff.gates.map((g) => [g.from, g.to])).toEqual([['draft', 'final']]);
    expect(diff.flags).toEqual([
      { itemId: 'set', label: 'Eng Quiz 2', flags: ['timed'] },
      { itemId: 'draft', label: 'Eng Op-Ed Draft', flags: ['lopesWrite'] },
      { itemId: 'final', label: 'Eng Op-Ed Final', flags: ['lopesWrite'] },
    ]);
    expect(diff.skipped).toEqual([{ itemId: 'set', label: 'Eng Quiz 2', what: 'startBy', why: 'you set it' }]);
    expect(diff.discovered.map((d) => d.title)).toEqual(['Reading response 1']);
    // The done intro and the small post change nothing visible; they only gain their plan.
    expect(diff.quiet).toBe(2);
    expect(diff.total).toBe(11);
    expect(diffSummary(diff, eng, Object.keys(plan.items).length)).toBe('The AI read 5 ENG-105 items: 1 earlier start, 1 later start, 2 effort estimates, milestones for 2, 1 prerequisite, 3 flags, and 1 thing found outside Halo. 2 only gain what they ask for and where to study.');
  });
  it('the term pass wins on start-by when it spoke, with the class reason kept', async () => {
    const { plan } = await setup();
    const term = { starts: { draft: { value: '2026-10-05', why: 'CHM-113 Exam 1 lands Oct 16.', confidence: 'medium' as const } }, weeks: [], chains: [], model: 'm', at: '', inputHash: 'x' };
    const diff = diffPlan(eng, items, plan, term, startByOf);
    expect(diff.startBy[0]).toMatchObject({ itemId: 'draft', to: '2026-10-05', why: 'CHM-113 Exam 1 lands Oct 16. (class pass said 2026-10-08: Ten days: pick the issue, find two sources, draft 750 words, leave a day for LopesWrite.)' });
  });
  it('writes what was checked, remembers what was not, never touches notes, status, or logged time, and adds a found item once', async () => {
    const { plan } = await setup();
    const diff = diffPlan(eng, items, plan, null, startByOf);
    const sel = defaultPlanSelection(diff);
    sel.startBy.delete('final');
    sel.discovered.add(0);
    const now = '2026-09-15T12:00:00.000Z';
    const out = applyPlan(items, eng, plan, diff, sel, { now, tz: TZ });
    const by = new Map(out.items.map((i) => [i.id, i]));
    expect(by.get('draft')).toMatchObject({ startByPlan: '2026-10-08', estimatedMinutes: 240, estimateOverridden: false, flags: { lopesWrite: true }, blocks: ['final'], topic: 'op-ed', notes: 'Write a 750-word first draft of your op-ed. Cite two sources in APA. Submit to LopesWrite.', status: 'todo' });
    expect(by.get('draft')?.steps?.map((s) => s.label)).toEqual(['Pick the issue', 'Find two sources', 'Outline', 'Draft 750 words', 'Check APA', 'Run LopesWrite']);
    expect(by.get('draft')?.plan?.sources[0].href).toBe('#/library?v=slides&deck=d1');
    expect(by.get('final')).toMatchObject({ planDeclined: ['startBy'], estimatedMinutes: 200 });
    expect(by.get('final')?.startByPlan).toBeUndefined();
    expect(by.get('set')).toMatchObject({ startByOverride: '2026-09-23', flags: { timed: true } });
    expect(by.get('done')).toMatchObject({ status: 'done', completedAt: at('2026-09-01') });
    expect(out.added.map((i) => [i.title, i.dueAt, i.points, i.source])).toEqual([['Reading response 1', '2026-09-28T23:59:00-07:00', 10, 'parsed']]);
    expect(out.added[0].notes).toBe('Found in the syllabus, not in Halo: "A reading response is due the Monday of week five."');
    expect(out.declined).toBe(1);
    // Re-running the same plan proposes nothing new: the declined start stays declined, the found item exists.
    const again = diffPlan(eng, out.items, plan, null, startByOf);
    expect(again.startBy).toEqual([]);
    expect(again.skipped.some((s) => s.itemId === 'final' && s.why === 'declined before')).toBe(true);
    const twice = applyPlan(out.items, eng, plan, again, defaultPlanSelection(again), { now, tz: TZ });
    expect(twice.added).toEqual([]);
    expect(twice.items.filter((i) => i.title === 'Reading response 1').length).toBe(1);
  });
  it('the scheduler shows an accepted AI start-by, and a sync keeps an AI estimate only for a class that runs on it', () => {
    const planned = items.map((i) => (i.id === 'draft' ? { ...i, startByPlan: '2026-10-08', plan: { asks: '', startBy: null, minutes: { value: 240, why: '', confidence: 'medium' as const }, milestones: [], prerequisites: [], flags: { lopesWrite: false, timed: false, group: false, inPerson: false }, topics: [], feeds: null, sources: [], citations: [], model: 'm', at: '', inputHash: 'h' }, estimatedMinutes: 240 } : i));
    const sched = computeSchedule(planned, data.settings, today, { start: '2026-08-31', end: '2026-12-13' }, '2026-09-15T16:00:00.000Z');
    expect(sched.byItem.draft.startBy).toBe('2026-10-08');
    expect(sched.byItem.set.startBy).toBe('2026-09-23');
    const next = { ...planned[0], dueAt: at('2026-10-19') };
    expect(mergeItem(planned[0], next, eng, 'now').estimatedMinutes).toBe(100);
    expect(mergeItem(planned[0], next, { ...eng, ingest: 'ai' }, 'now').estimatedMinutes).toBe(240);
  });
});

describe('running the passes', () => {
  const cacheStore = () => {
    const m = new Map<string, unknown>();
    const cache: Cache = { get: async <T,>(k: string) => (m.get(k) as T) ?? null, put: async (k, v) => void m.set(k, v) };
    return { cache, m };
  };
  const reply = (name: string, input: unknown) => new Response(JSON.stringify({ id: 'msg', type: 'message', role: 'assistant', model: 'test-model', content: [{ type: 'tool_use', id: 'tu', name, input }], stop_reason: 'tool_use', usage: { input_tokens: 1200, output_tokens: 300, cache_read_input_tokens: 800 } }), { status: 200, headers: { 'content-type': 'application/json' } });
  const answer = (input: unknown) => ({ class_core: rawCore, class_detail: rawDetail, class_material: rawMaterial })[String((input as { tool_choice?: { name?: string } }).tool_choice?.name ?? '')];
  /** A fetch that answers whichever tool was asked for, and remembers the requests. */
  const fakeApi = (fail?: string) => {
    const sent: { tool: string; system: { text: string; cached: boolean }[]; user: string }[] = [];
    const fetch = (async (_url: unknown, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { tool_choice?: { name?: string }; system: { text: string; cache_control?: unknown }[]; messages: { content: string }[] };
      const tool = String(body.tool_choice?.name ?? '');
      sent.push({ tool, system: body.system.map((b) => ({ text: b.text, cached: !!b.cache_control })), user: String(body.messages[0].content) });
      if (tool === fail) return new Response(JSON.stringify({ type: 'error', error: { type: 'invalid_request_error', message: 'The compiled grammar is too large' } }), { status: 400, headers: { 'content-type': 'application/json' } });
      return reply(tool, answer(body));
    }) as unknown as typeof globalThis.fetch;
    return { fetch, sent };
  };
  it('runs three passes over one cached prefix, caches the plan, and only re-reasons when forced or when the class changed', async () => {
    const { cache } = cacheStore();
    const { fetch, sent } = fakeApi();
    const steps: string[] = [];
    const deps = { apiKey: 'k', fetch, loaders, cache };
    const first = await runClassPass(eng, data, today, startByOf, deps, { onStep: (s) => steps.push(s) });
    expect(first.cached).toBe(false);
    expect(steps).toEqual(['core', 'detail', 'material']);
    expect(sent.map((r) => r.tool)).toEqual(['class_core', 'class_detail', 'class_material']);
    // The rules change per pass, so they come last: what is cached is the same prefix every time.
    expect(sent.map((r) => r.system.map((b) => b.cached))).toEqual([[false, true, false], [false, true, false], [false, true, false]]);
    expect(new Set(sent.map((r) => r.system.slice(0, 2).map((b) => b.text).join('|'))).size).toBe(1);
    expect(sent[1].user).toContain('Break these down: A5, A4');
    expect(first.plan.model).toBe('claude-sonnet-4-6');
    expect(Object.keys(first.plan.items).length).toBe(5);
    expect(first.plan.items.draft.milestones.length).toBe(6);
    expect(first.plan.items.draft.sources.length).toBe(2);
    expect(first.plan.incomplete).toEqual([]);
    expect(first.cost).toMatchObject({ calls: 3, input: 3600, output: 900, cacheRead: 2400 });
    const second = await runClassPass(eng, data, today, startByOf, deps);
    expect(second.cached).toBe(true);
    expect(second.cost.calls).toBe(0);
    expect(sent.length).toBe(3);
    await runClassPass(eng, data, today, startByOf, deps, { force: true });
    expect(sent.length).toBe(6);
    await runClassPass(eng, { ...data, items: items.map((i) => (i.id === 'dq' ? { ...i, points: 10 } : i)) }, today, startByOf, deps);
    expect(sent.length).toBe(9);
  });
  it('reads the answer out of plain text when a forced tool call comes back as text', async () => {
    const { cache } = cacheStore();
    const fetch = (async (_url: unknown, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { tool_choice?: { name?: string } };
      const input = ({ class_core: rawCore, class_detail: rawDetail, class_material: rawMaterial } as Record<string, unknown>)[String(body.tool_choice?.name ?? '')];
      return new Response(JSON.stringify({ id: 'm', type: 'message', role: 'assistant', model: 'test-model', content: [{ type: 'text', text: `Here you go:\n\n\`\`\`json\n${JSON.stringify(input)}\n\`\`\`` }], stop_reason: 'end_turn', usage: { input_tokens: 10, output_tokens: 5 } }), { status: 200, headers: { 'content-type': 'application/json' } });
    }) as unknown as typeof globalThis.fetch;
    const run = await runClassPass(eng, data, today, startByOf, { apiKey: 'k', fetch, loaders, cache });
    expect(Object.keys(run.plan.items).length).toBe(5);
    expect(run.plan.items.draft.milestones.length).toBe(6);
    expect(jsonFromText('no json here')).toBeNull();
    expect(jsonFromText('{"a":1}')).toEqual({ a: 1 });
  });
  it('keeps what pass A read when a later pass fails, and says in plain words what is thinner', async () => {
    const { cache } = cacheStore();
    const { fetch } = fakeApi('class_detail');
    const run = await runClassPass(eng, data, today, startByOf, { apiKey: 'k', fetch, loaders, cache });
    expect(Object.keys(run.plan.items).length).toBe(5);
    expect(run.plan.items.draft.minutes?.value).toBe(240);
    expect(run.plan.items.draft.milestones).toEqual([]);
    expect(run.plan.items.draft.sources.length).toBe(2);
    expect(run.plan.incomplete).toEqual(['milestones and prerequisites']);
    // A first-pass failure is the whole pass failing: nothing is cached and nothing is half-written.
    const { fetch: f2 } = fakeApi('class_core');
    await expect(runClassPass(eng, data, today, startByOf, { apiKey: 'k', fetch: f2, loaders, cache: cacheStore().cache })).rejects.toThrow();
  });
  it('the term pass sees every class, skips fixed items, clamps starts, and orders weeks', async () => {
    const { cache } = cacheStore();
    const plans: Record<string, ClassPlan | null> = { eng: readAll(await gatherClassContext(eng, data, today, startByOf, loaders)), chm: null };
    const input = buildTermInput(data, plans, today, startByOf);
    expect(input.items.map((i) => [i.ref, i.code, i.minutes, i.fixed, i.feeds])).toEqual([
      ['T1', 'ENG-105', 60, true, null],
      ['T2', 'ENG-105', 30, false, null],
      ['T3', 'CHM-113', 300, false, null],
      ['T4', 'ENG-105', 240, false, 'T5'],
      ['T5', 'ENG-105', 210, false, null],
    ]);
    const prompt = buildTermPrompt(input);
    expect(prompt.user).toContain('[T4] ENG-105 · "First Draft of an Op-Ed Assignment" · paper · due 2026-10-18 · 100 pts · 240 min · not started · planner start now 2026-10-14 · class pass: start 2026-10-08');
    const raw = { starts: [{ ref: 'T4', start_by: '2026-10-05', why: 'CHM-113 Exam 1 the same week.', confidence: 'medium' }, { ref: 'T1', start_by: '2026-09-20', why: 'fixed anyway', confidence: 'high' }, { ref: 'T3', start_by: '2026-10-20', why: 'after due', confidence: 'high' }], weeks: [{ week_start: '2026-10-14', load: 'brutal', why: 'Exam 1 and the op-ed draft' }, { week_start: '2026-09-01', load: 'light', why: '' }, { week_start: '2026-10-13', load: 'heavy', why: 'dup' }], chains: [{ from: 'T4', to: 'T5', why: 'draft feeds final' }, { from: 'T9', to: 'T5', why: 'ghost' }] };
    const fetch = (async () => reply('term_plan', raw)) as unknown as typeof globalThis.fetch;
    const run = await runTermPass(data, plans, today, startByOf, { apiKey: 'k', fetch, loaders, cache });
    expect(run.cached).toBe(false);
    expect(run.term.starts).toEqual({ draft: { value: '2026-10-05', why: 'CHM-113 Exam 1 the same week.', confidence: 'medium' }, exam: { value: '2026-10-15', why: 'after due', confidence: 'low' } });
    // Weeks start on Sunday by default, so the dates snap and the duplicate week is dropped.
    expect(run.term.weeks).toEqual([
      { start: '2026-08-30', load: 'light', why: '' },
      { start: '2026-10-11', load: 'brutal', why: 'Exam 1 and the op-ed draft' },
    ]);
    expect(run.term.chains).toEqual([{ from: 'draft', to: 'final', why: 'draft feeds final' }]);
    expect((await runTermPass(data, plans, today, startByOf, { apiKey: 'k', fetch, loaders, cache })).cached).toBe(true);
    expect(termFromTool({}, input, 'm').starts).toEqual({});
  });
  it('a gate never becomes a date change on the item it gates', async () => {
    const plan = readAll(await gatherClassContext(eng, data, today, startByOf, loaders));
    const diff = diffPlan(eng, items, plan, null, startByOf);
    const sel = defaultPlanSelection(diff);
    expect(sel.gates.has(gateKey('draft', 'final'))).toBe(true);
    const out = applyPlan(items, eng, plan, diff, { ...sel, startBy: new Set(), minutes: new Set(), steps: new Set(), flags: new Set(), discovered: new Set() }, { now: 'n', tz: TZ });
    const final = out.items.find((i) => i.id === 'final')!;
    expect(final.dueAt).toBe(at('2026-11-01'));
    expect(final.startByPlan).toBeUndefined();
    expect(out.items.find((i) => i.id === 'draft')?.blocks).toEqual(['final']);
  });
});
