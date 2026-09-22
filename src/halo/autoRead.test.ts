import { describe, expect, it } from 'vitest';
import type { Action } from './actions';
import { autoLine, autoResultLine, emptyOutcome, groupFailures, needsRead, planFromActions, readReason, type AutoOutcome } from './autoRead';
import type { StoredAnnouncement } from './announce';
import { mkCourse, mkItem, TZ } from './fixtures';

void TZ;
const NOW = '2026-09-21T12:00:00.000Z';
const course = mkCourse({ id: 'c1', code: 'ENG-105' });
const items = [mkItem({ id: 'i-dq', courseId: 'c1', title: 'Topic 2 DQ 1', type: 'discussion', points: 5, dueAt: '2026-09-21T06:59:00.000Z' })];

const post = (o: Partial<StoredAnnouncement> = {}): StoredAnnouncement =>
  ({ id: 'a1', courseId: 'c1', forumId: 'f', title: 'Week 3', text: 'body', publishedAt: '2026-09-20T15:00:00.000Z', modifiedAt: null, author: 'Dr. G', mustAcknowledge: false, acknowledged: false, resources: [], readAt: null, processedAt: null, findings: null, review: {}, storedAt: NOW, ...o }) as never;

const action = (o: Partial<Action> & { kind: Action['kind']; text: string }): Action => ({
  itemId: null,
  dueAt: null,
  points: null,
  gradedOn: true,
  redefinesDone: false,
  confidence: 'high',
  source: { kind: 'announcement', id: 'a1', title: 'Week 3', quote: 'the professor said so', at: '2026-09-20T15:00:00.000Z' },
  ...o,
});

const plan = (actions: Action[], opts: { items?: typeof items } = {}) =>
  planFromActions({ actions, announcement: post(), course, items: opts.items ?? items, courses: [course], now: NOW });

describe('which posts get read on a sync', () => {
  it('reads what is new and what the professor edited, and leaves the rest alone', () => {
    const fresh = post({ id: 'new' });
    const read = post({ id: 'read', actionsAt: NOW, modifiedAt: null, actionsModifiedAt: null });
    // The professor went back into an existing post and changed a date.
    const edited = post({ id: 'edited', actionsAt: NOW, modifiedAt: '2026-09-21T09:00:00.000Z', actionsModifiedAt: null });
    const elsewhere = post({ id: 'other', courseId: 'gone' });
    expect(needsRead([fresh, read, edited, elsewhere], new Set(['c1'])).map((a) => a.id)).toEqual(['new', 'edited']);
    expect(readReason(fresh)).toBe('new');
    expect(readReason(edited)).toBe('edited');
  });

  it('stops re-reading once the edit has been read', () => {
    const settled = post({ actionsAt: NOW, modifiedAt: '2026-09-21T09:00:00.000Z', actionsModifiedAt: '2026-09-21T09:00:00.000Z' });
    expect(needsRead([settled], new Set(['c1']))).toEqual([]);
  });
});

describe('what lands on the agenda by itself', () => {
  it('creates new work from a post, marked with where it came from', () => {
    const p = plan([action({ kind: 'new_work', text: 'Submit the Topic 3 reflection.', dueAt: '2026-09-25T06:59:00.000Z', points: 20 })]);
    expect(p.added).toHaveLength(1);
    const made = p.added[0];
    expect(made.title).toBe('Submit the Topic 3 reflection');
    expect(made.points).toBe(20);
    expect(made.dueAt).toBe('2026-09-25T06:59:00.000Z');
    expect(made.courseId).toBe('c1');
    // The badge and the way back to the post.
    expect(made.origin?.kind).toBe('announcement');
    expect(made.origin?.id).toBe('a1');
    expect(made.origin?.quote).toBe('the professor said so');
    expect(p.upserts).toContain(made);
  });

  it('moves a date and keeps the one it moved from, so the change is noticeable', () => {
    const p = plan([action({ kind: 'date_change', text: 'The DQ now closes Wednesday.', itemId: 'i-dq', dueAt: '2026-09-24T06:59:00.000Z' })]);
    expect(p.moved).toHaveLength(1);
    expect(p.moved[0].from).toBe('2026-09-21T06:59:00.000Z');
    const moved = p.upserts.find((i) => i.id === 'i-dq')!;
    expect(moved.dueAt).toBe('2026-09-24T06:59:00.000Z');
    expect(moved.dateChange?.from).toBe('2026-09-21T06:59:00.000Z');
    expect(moved.dateChange?.source.title).toBe('Week 3');
  });

  it('attaches parts to work that already exists', () => {
    const p = plan([action({ kind: 'requirement', text: 'Reply to two classmates.', itemId: 'i-dq' })]);
    expect(p.attached).toBe(1);
    expect(p.upserts[0].requirements?.[0].text).toBe('Reply to two classmates.');
  });

  it('never adds the same assignment twice, however many posts mention it', () => {
    const twice = [
      action({ kind: 'new_work', text: 'Submit the Topic 3 reflection.', dueAt: '2026-09-25T06:59:00.000Z' }),
      action({ kind: 'new_work', text: 'Submit the Topic 3 reflection.', dueAt: '2026-09-25T06:59:00.000Z' }),
    ];
    expect(plan(twice).added).toHaveLength(1);
    // And not again on a later sync, once it is in the planner.
    const already = [...items, plan(twice).added[0]];
    expect(plan([twice[0]], { items: already }).added).toEqual([]);
  });

  it('keeps work with no date as a class note rather than inventing one', () => {
    const p = plan([action({ kind: 'new_work', text: 'Start thinking about your final project topic.' })]);
    expect(p.added).toEqual([]);
    expect(p.noted).toBe(1);
    expect(p.courses[0].notes?.[0].text).toContain('final project');
  });
});

describe('what still waits for approval', () => {
  it('never cancels or removes anything on its own', () => {
    const p = plan([
      action({ kind: 'date_change', text: 'Topic 2 DQ 1 is cancelled.', itemId: 'i-dq', dueAt: null }),
      action({ kind: 'new_work', text: 'Nothing this week, the quiz is dropped.', dueAt: null }),
    ]);
    // A date change with no date is not a move; it falls through to approval.
    expect(p.needsApproval).toHaveLength(1);
    expect(p.needsApproval[0].action.text).toContain('cancelled');
    expect(p.moved).toEqual([]);
    expect(p.upserts.some((i) => i.id === 'i-dq' && i.dueAt !== items[0].dueAt)).toBe(false);
  });

  it('says what it did and what is still waiting', () => {
    const p = plan([
      action({ kind: 'new_work', text: 'Submit the Topic 3 reflection.', dueAt: '2026-09-25T06:59:00.000Z' }),
      action({ kind: 'date_change', text: 'The DQ now closes Wednesday.', itemId: 'i-dq', dueAt: '2026-09-24T06:59:00.000Z' }),
      action({ kind: 'date_change', text: 'Quiz 2 is cancelled.', itemId: 'i-dq', dueAt: null }),
    ]);
    expect(autoLine(p)).toBe('From your announcements: 1 new assignment added, 1 date moved. 1 removal needs your approval below.');
    expect(autoLine({ added: [], moved: [], attached: 0, noted: 0, needsApproval: [] })).toBeNull();
  });
});

describe('when the automatic read fails', () => {
  const base = { ...emptyOutcome(), todo: 3 };

  it('all reads failing never renders as a clean result', () => {
    // The real case: out of credits. What the user got was "Nothing in them asks anything of you."
    const out: AutoOutcome = { ...base, read: 0, failed: 3, failures: groupFailures(['Your Anthropic credit balance is too low.', 'Your Anthropic credit balance is too low.', 'Your Anthropic credit balance is too low.']) };
    const line = autoResultLine(out)!;
    expect(line).toBe('3 announcements could not be read. Your Anthropic credit balance is too low. I do not know what they ask, and the next sync will try again.');
    // The sentences that must never appear over a failed pass, in any form.
    expect(line).not.toMatch(/nothing/i);
    expect(line).not.toMatch(/asks anything of you/i);
    expect(line).not.toBeNull();
  });

  it('says so plainly when there is no key, rather than saying nothing at all', () => {
    const line = autoResultLine({ ...base, noKey: true })!;
    expect(line).toContain('no Anthropic key is connected');
    expect(line).toContain('the next sync reads them');
    expect(line).not.toMatch(/nothing in/i);
  });

  it('one post failing never costs the others', () => {
    const p = plan([action({ kind: 'new_work', text: 'Submit the Topic 3 reflection.', dueAt: '2026-09-25T06:59:00.000Z' })]);
    const line = autoResultLine({ ...base, read: 2, failed: 1, plan: p, failures: groupFailures(['Halo answered 500.']) })!;
    expect(line).toContain('1 new assignment added');
    expect(line).toContain('1 announcement could not be read');
    expect(line).toContain('I do not know what that one asks');
  });

  it('claims nothing was found only when every post was read', () => {
    const clean = autoResultLine({ ...base, read: 3, failed: 0 })!;
    expect(clean).toBe('Nothing in the 3 new announcements asks anything of you.');
    // One failure and that claim is gone.
    const partial = autoResultLine({ ...base, read: 2, failed: 1, failures: groupFailures(['Halo answered 500.']) })!;
    expect(partial).not.toMatch(/^Nothing in/);
    expect(partial).toBe('1 announcement could not be read, so I do not know what that one asks. Halo answered 500. The other 2 ask nothing of you.');
  });

  it('is silent only when there was nothing to read', () => {
    expect(autoResultLine(emptyOutcome())).toBeNull();
  });

  it('counts one cause across every post as one problem', () => {
    expect(groupFailures(['low balance', 'low balance', 'rate limited'])).toEqual([
      { message: 'low balance', count: 2 },
      { message: 'rate limited', count: 1 },
    ]);
  });
});
