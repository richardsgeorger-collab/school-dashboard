import { describe, expect, it } from 'vitest';
import { bodyHash, mergeAnnouncement, type ReadEntry, type StoredAnnouncement } from './announce';
import { needsRead, readReason } from './autoRead';
import { readGuard } from './readCost';

const incoming = (o: Record<string, unknown> = {}) =>
  ({ id: 'post-1', forumId: 'f1', title: 'Week 1 note', content: '<p>Reminder number 1.</p>', publishedAt: '2026-09-10T15:00:00.000Z', modifiedAt: '2026-09-10T15:05:00.000Z', author: 'Dr. Awad', mustAcknowledge: false, acknowledged: false, resources: [], ...o }) as never;

const save = (existing: StoredAnnouncement | null, o: Record<string, unknown> = {}) => mergeAnnouncement(incoming(o), 'c1', existing, '2026-09-24T11:00:00.000Z');
const entry = (p: StoredAnnouncement): ReadEntry => ({ id: p.id, hash: bodyHash(p), at: '2026-09-24T10:00:05.000Z', summary: 'News only.', count: 0 });
const ids = new Set(['c1']);

describe('the bug that re-read everything', () => {
  it('re-saving an identical post during a sync keeps its read stamp', () => {
    // What happened: the sync's own save built a new record without the read fields, so every post looked unread.
    const stamped = { ...save(null), actionsAt: '2026-09-24T10:00:05.000Z', actionsModifiedAt: '2026-09-10T15:05:00.000Z', actionsSummary: 'News only.', actionCount: 0 } as StoredAnnouncement;
    const resaved = save(stamped);
    expect(resaved.actionsAt).toBe('2026-09-24T10:00:05.000Z');
    expect(resaved.actionsSummary).toBe('News only.');
    expect(needsRead([resaved], ids)).toEqual([]);
  });
});

describe('three posts in three states, one sync', () => {
  const neverRead = save(null, { id: 'never', title: 'Never read' });
  const unchanged = save(null, { id: 'unchanged', title: 'Read and unchanged' });
  const editedBefore = save(null, { id: 'edited', title: 'Read then edited', content: '<p>The quiz is Friday.</p>' });
  const editedNow = save(editedBefore, { id: 'edited', title: 'Read then edited', content: '<p>The quiz is now Monday.</p>' });
  const ledger = new Map([
    ['unchanged', entry(unchanged)],
    ['edited', entry(editedBefore)],
  ]);

  it('reads exactly the never-read and the edited, and skips the unchanged', () => {
    const todo = needsRead([neverRead, unchanged, editedNow], ids, ledger);
    expect(todo.map((a) => a.id).sort()).toEqual(['edited', 'never']);
    expect(readReason(neverRead, ledger)).toBe('new');
    expect(readReason(editedNow, ledger)).toBe('edited');
  });

  it('once each read is stamped, the next sync reads nothing', () => {
    const after = new Map(ledger);
    for (const p of [neverRead, editedNow]) after.set(p.id, entry(p));
    expect(needsRead([neverRead, unchanged, editedNow], ids, after)).toEqual([]);
  });

  it('a failed read writes no entry, so it is still waiting', () => {
    expect(needsRead([neverRead], ids, ledger).map((a) => a.id)).toEqual(['never']);
  });
});

describe('content decides, not dates', () => {
  it('a modified date that changes on every fetch does not trigger a read', () => {
    const p = save(null);
    const ledger = new Map([[p.id, entry(p)]]);
    const refetched = save(p, { modifiedAt: '2026-09-24T21:00:00.000Z' });
    expect(needsRead([refetched], ids, ledger)).toEqual([]);
    const noDate = save(p, { modifiedAt: null });
    expect(needsRead([noDate], ids, ledger)).toEqual([]);
  });

  it('a real edit to the words does, whatever the date says', () => {
    const p = save(null);
    const ledger = new Map([[p.id, entry(p)]]);
    const edited = save(p, { content: '<p>Reminder number 1. Bring goggles.</p>', modifiedAt: '2026-09-10T15:05:00.000Z' });
    expect(needsRead([edited], ids, ledger)).toHaveLength(1);
  });

  it('ignores markup and spacing, which are not edits', () => {
    expect(bodyHash({ title: 'A', text: 'one  two\n three' })).toBe(bodyHash({ title: 'A', text: 'one two three' }));
    expect(bodyHash({ title: 'A', text: 'one two three' })).not.toBe(bodyHash({ title: 'A', text: 'one two four' }));
  });
});

describe('the guard before spending', () => {
  it('a normal sync reading a couple of new posts goes straight through', () => {
    expect(readGuard({ todo: 2, onFile: 56, fresh: 2, edited: 0 }).ask).toBe(false);
  });

  it('a first backlog goes straight through: 56 of 58 on file is thirty cents, not a question', () => {
    // Real data: this exact shape stopped every sync at a question nobody saw, and nothing was ever read.
    expect(readGuard({ todo: 56, onFile: 58, fresh: 56, edited: 0 }).ask).toBe(false);
    expect(readGuard({ todo: 20, onFile: 30, fresh: 0, edited: 20 }).ask).toBe(false);
  });
  it('stops only before a run that costs real money, and says why', () => {
    const g = readGuard({ todo: 200, onFile: 400, fresh: 180, edited: 20 });
    expect(g.ask).toBe(true);
    expect(g.line).toContain('180 never read');
    expect(g.line).toContain('20 changed since they were read');
  });
});
