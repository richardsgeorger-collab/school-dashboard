import { describe, expect, it } from 'vitest';
import { bodyHash, healEntries, readState, type ReadEntry, type StoredAnnouncement } from './announce';
import { needsRead } from './autoRead';

const post = (over: Partial<StoredAnnouncement> = {}): StoredAnnouncement => ({
  id: 'p1',
  courseId: 'c1',
  forumId: 'f1',
  title: 'Week 3',
  content: '<p>Read chapter 3.</p>',
  text: 'Read chapter 3.',
  publishedAt: '2026-09-10T15:00:00.000Z',
  modifiedAt: '2026-09-10T15:05:00.000Z',
  author: 'Dr. Awad',
  mustAcknowledge: false,
  acknowledged: false,
  resources: [],
  pulledAt: '2026-09-20T00:00:00.000Z',
  readAt: null,
  processedAt: null,
  findings: null,
  review: {},
  actionsAt: null,
  actionsModifiedAt: null,
  actionsSummary: null,
  actionCount: null,
  ...over,
});
const entry = (p: StoredAnnouncement, over: Partial<ReadEntry> = {}): ReadEntry => ({ id: p.id, hash: bodyHash(p), at: '2026-09-23T10:00:00.000Z', summary: 'Adds a reading.', count: 9, ...over });

/**
 * The Inbox once said "58 on file, 58 not yet read" while a row said "9 things added". Both facts now come from one
 * answer per post, so the header can never count a post as unread while its row shows what the read added.
 */
describe('readState', () => {
  it('a ledger entry whose words still match means read, with the count the read produced', () => {
    const p = post();
    const s = readState(p, new Map([[p.id, entry(p)]]));
    expect(s).toEqual({ read: true, count: 9, summary: 'Adds a reading.', heal: null });
  });
  it('an edited post is unread again and carries no count', () => {
    const p = post();
    const s = readState({ ...p, text: 'Read chapter 4.' }, new Map([[p.id, entry(p)]]));
    expect(s.read).toBe(false);
    expect(s.count).toBeNull();
  });
  it('a stamped post the ledger has lost, unedited since the read, is read and gets its entry back', () => {
    const p = post({ actionsAt: '2026-09-23T10:00:00.000Z', actionsModifiedAt: '2026-09-10T15:05:00.000Z', actionsSummary: 'Adds a reading.', actionCount: 9 });
    const s = readState(p, new Map());
    expect(s.read).toBe(true);
    expect(s.count).toBe(9);
    expect(s.heal).toEqual({ id: 'p1', hash: bodyHash(p), at: '2026-09-23T10:00:00.000Z', summary: 'Adds a reading.', count: 9 });
    expect(needsRead([p], new Set(['c1']), new Map())).toEqual([]);
    expect(healEntries([p, post({ id: 'p2' })], new Map())).toHaveLength(1);
  });
  it('a stamped post that Halo says was modified since the read is not trusted', () => {
    const p = post({ actionsAt: '2026-09-23T10:00:00.000Z', actionsModifiedAt: '2026-09-01T00:00:00.000Z', actionCount: 9 });
    const s = readState(p, new Map());
    expect(s.read).toBe(false);
    expect(s.count).toBeNull();
    expect(needsRead([p], new Set(['c1']), new Map())).toHaveLength(1);
  });
  it('never shows a count on a post it counts as unread, for any mix of stamps and entries', () => {
    const posts = [
      post({ id: 'a' }),
      post({ id: 'b', actionsAt: '2026-09-23T10:00:00.000Z', actionsModifiedAt: '2026-09-10T15:05:00.000Z', actionCount: 9 }),
      post({ id: 'c', actionsAt: '2026-09-23T10:00:00.000Z', actionsModifiedAt: '2026-08-01T00:00:00.000Z', actionCount: 4 }),
      post({ id: 'd', text: 'changed' }),
    ];
    const ledger = new Map([['d', entry(post({ id: 'd' }))]]);
    const states = posts.map((p) => readState(p, ledger));
    for (const s of states) if (!s.read) expect(s.count).toBeNull();
    expect(states.filter((s) => !s.read)).toHaveLength(3);
    expect(states.filter((s) => s.read && (s.count ?? 0) > 0)).toHaveLength(1);
  });
});
