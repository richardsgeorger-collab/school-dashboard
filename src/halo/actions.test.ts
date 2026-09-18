import { describe, expect, it } from 'vitest';
import { itemFinished, gradedOpen, isNoise, mergeRequirements, missedLine, missedRequirement, partsLine, requirementRows } from '../domain/requirements';
import type { Requirement } from '../domain/types';
import { actionsFromTool, buildActionsPrompt, routeActions } from './actions';
import { mkCourse, mkItem, TZ } from './fixtures';

const post = {
  id: 'ann-1',
  courseId: 'c1',
  forumId: 'f1',
  title: 'Week 2 reminders',
  text: 'Remember that your discussion grade includes replies: you must respond to at least two classmates by Sunday night. Also bring a printed copy of the rubric to Thursday.',
  publishedAt: '2026-09-14T15:00:00.000Z',
  modifiedAt: null,
  author: 'Dr. Guthrie',
  mustAcknowledge: false,
  acknowledged: false,
  resources: [],
  readAt: null,
  processedAt: null,
  findings: null,
  review: {},
  storedAt: '2026-09-14T15:00:00.000Z',
} as never;

const raw = {
  summary: 'Two replies are part of the discussion grade, and the rubric has to be printed for Thursday.',
  actions: [
    { kind: 'requirement', applies_to: 'i-dq', what: 'Reply to at least two classmates on the Topic 2 discussion by Sunday night.', due: '2026-09-20', time: '23:59', points: 0, graded: true, changes_what_done_means: true, quote: 'you must respond to at least two classmates by Sunday night', confidence: 'high' },
    { kind: 'requirement', applies_to: '', what: 'Bring a printed copy of the rubric to Thursday’s class.', due: '2026-09-17', time: '', points: 0, graded: true, changes_what_done_means: false, quote: 'bring a printed copy of the rubric to Thursday', confidence: 'high' },
    { kind: 'note', applies_to: '', what: 'Something with no quote at all.', due: '', time: '', points: 0, graded: false, changes_what_done_means: false, quote: '', confidence: 'low' },
  ],
};

const items = [mkItem({ id: 'i-dq', courseId: 'c1', title: 'Topic 2 DQ 1', type: 'discussion', points: 5, dueAt: '2026-09-18T06:59:00.000Z' })];

describe('reading an announcement for anything actionable', () => {
  it('keeps only what the professor is quoted saying', () => {
    const { actions, summary } = actionsFromTool(raw, post, items, TZ);
    expect(summary).toContain('printed');
    // The entry with no quote is dropped: the quote is the whole guarantee it came from the post.
    expect(actions).toHaveLength(2);
    expect(actions[0].source.quote).toBe('you must respond to at least two classmates by Sunday night');
    expect(actions[0].source.id).toBe('ann-1');
    expect(actions[0].source.title).toBe('Week 2 reminders');
  });

  it('gives a requirement its own deadline, in the student’s own zone', () => {
    const [replies, printed] = actionsFromTool(raw, post, items, TZ).actions;
    // Sunday 23:59 in Phoenix is 06:59Z the next day. Arizona has no DST.
    expect(replies.dueAt).toBe('2026-09-21T06:59:00.000Z');
    expect(replies.redefinesDone).toBe(true);
    expect(replies.gradedOn).toBe(true);
    // A bare date lands at 23:59 local the way Halo's own deadlines do.
    expect(printed.dueAt).toBe('2026-09-18T06:59:00.000Z');
  });

  it('attaches to the item the post is about, and never to an id it invented', () => {
    const { actions } = actionsFromTool(raw, post, items, TZ);
    expect(actions[0].itemId).toBe('i-dq');
    expect(actions[1].itemId).toBeNull();
    const bogus = actionsFromTool({ actions: [{ ...raw.actions[0], applies_to: 'not-a-real-id' }] }, post, items, TZ);
    expect(bogus.actions[0].itemId).toBeNull();
  });

  it('never discards a finding it cannot classify: it becomes a class note', () => {
    const odd = actionsFromTool({ actions: [{ kind: 'something_new', applies_to: '', what: 'Get the lab manual from the bookstore, not online.', due: '', time: '', points: 0, graded: true, changes_what_done_means: false, quote: 'the bookstore copy is the one we use', confidence: 'medium' }] }, post, items, TZ);
    expect(odd.actions[0].kind).toBe('note');
    const routed = routeActions(odd.actions, 'c1', '2026-09-18T12:00:00.000Z');
    expect(routed.notes).toHaveLength(1);
    expect(routed.notes[0].note.text).toContain('bookstore');
    expect(routed.notes[0].note.source.quote).toBe('the bookstore copy is the one we use');
    expect(routed.changes).toEqual([]);
  });

  it('routes parts onto existing work and only sends new rows for approval', () => {
    const { actions } = actionsFromTool(raw, post, items, TZ);
    const more = actionsFromTool({ actions: [{ kind: 'new_work', applies_to: '', what: 'Submit the safety quiz in ALEKS.', due: '2026-09-25', time: '', points: 10, graded: true, changes_what_done_means: false, quote: 'the safety quiz opens Monday', confidence: 'high' }] }, post, items, TZ);
    const routed = routeActions([...actions, ...more.actions], 'c1', '2026-09-18T12:00:00.000Z');
    expect(routed.requirements.map((r) => r.itemId)).toEqual(['i-dq']);
    expect(routed.notes).toHaveLength(1);
    expect(routed.changes.map((c) => c.kind)).toEqual(['new_work']);
  });

  it('shows the model what it already has, so it can attach rather than duplicate', () => {
    const p = buildActionsPrompt(post, mkCourse({ id: 'c1', code: 'UNV-106' }), items, TZ);
    expect(p.user).toContain('i-dq · Topic 2 DQ 1 · discussion · 5 pts');
    expect(p.user).toContain('Posted: 2026-09-14');
    expect(p.system[0].cache).toBe(true);
  });
});

describe('an assignment with parts', () => {
  const at = '2026-09-18T12:00:00.000Z';
  const req = (o: Partial<Requirement> & { id: string; text: string }): Requirement => ({ dueAt: null, done: false, doneAt: null, gradedOn: true, addedAt: at, source: { kind: 'announcement', id: 'ann-1', title: 'Week 2', quote: 'q', at }, ...o });

  it('is not finished while a graded part is open, whatever its status says', () => {
    const i = { ...items[0], status: 'done' as const, requirements: [req({ id: 'r1', text: 'Reply to two classmates', done: false })] };
    expect(itemFinished(i)).toBe(false);
    expect(gradedOpen(i)).toHaveLength(1);
    expect(itemFinished({ ...i, requirements: [{ ...i.requirements[0], done: true }] })).toBe(true);
    // Something worth knowing that is not itself graded does not hold the item open.
    expect(itemFinished({ ...i, requirements: [req({ id: 'r2', text: 'Read the sample post', gradedOn: false })] })).toBe(true);
    expect(partsLine(i)).toBe('0 of 1 part done');
  });

  it('a part with its own deadline is its own row, and one without rides the assignment', () => {
    const i = { ...items[0], requirements: [req({ id: 'r1', text: 'Reply to two classmates', dueAt: '2026-09-21T06:59:00.000Z' }), req({ id: 'r2', text: 'Use the template' })] };
    const rows = requirementRows([i], TZ);
    expect(rows.map((r) => [r.when, r.ownDate])).toEqual([
      ['2026-09-17', false],
      ['2026-09-20', true],
    ]);
    expect(rows.every((r) => r.fromAnnouncement)).toBe(true);
  });

  it('surfaces the one thing the assignment does not mention, naming where it came from', () => {
    const i = { ...items[0], requirements: [req({ id: 'r1', text: 'Reply to at least two classmates.', dueAt: '2026-09-21T06:59:00.000Z' })] };
    const row = missedRequirement([i], '2026-09-20', TZ)!;
    expect(row.req.text).toContain('two classmates');
    expect(missedLine(row, [mkCourse({ id: 'c1', code: 'UNV-106' })], '2026-09-20')).toBe(
      'UNV-106 Topic 2 DQ 1: Reply to at least two classmates. That is today, and it is not in the assignment. Your instructor posted it in "Week 2".',
    );
    // A tick, and it stops asking.
    expect(missedRequirement([{ ...i, requirements: [{ ...i.requirements[0], done: true }] }], '2026-09-20', TZ)).toBeNull();
  });

  it('a re-read adds nothing twice and never loses a tick', () => {
    const first = mergeRequirements(undefined, [req({ id: 'r1', text: 'Reply to two classmates' })]);
    const ticked = first.map((r) => ({ ...r, done: true, doneAt: at }));
    const again = mergeRequirements(ticked, [req({ id: 'r9', text: 'Reply to two classmates', dueAt: '2026-09-21T06:59:00.000Z' })]);
    expect(again).toHaveLength(1);
    expect(again[0].done).toBe(true);
    // A later post can still move the date.
    expect(again[0].dueAt).toBe('2026-09-21T06:59:00.000Z');
  });
});

describe('participation', () => {
  it('stays hidden as bare attendance and comes back when something says what earns it', () => {
    const bare = mkItem({ id: 'p1', courseId: 'c1', title: 'Week 2 Participation', type: 'participation', points: 10 });
    expect(isNoise(bare)).toBe(true);
    const explained = { ...bare, requirements: [{ id: 'r1', text: 'Post on three separate days.', dueAt: null, done: false, doneAt: null, gradedOn: true, addedAt: '2026-09-18T12:00:00.000Z', source: { kind: 'announcement' as const, id: 'a', title: 't', quote: 'post on three separate days', at: null } }] };
    expect(isNoise(explained)).toBe(false);
    // The syllabus pass explains it just as well.
    expect(isNoise({ ...bare, plan: { ...(bare.plan ?? {}), asks: 'Post on three separate days.' } as never })).toBe(false);
    // Everything else is unaffected.
    expect(isNoise(mkItem({ id: 'x', courseId: 'c1', title: 'Paper', type: 'paper' }))).toBe(false);
  });
});
