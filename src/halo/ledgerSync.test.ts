import { describe, expect, it } from 'vitest';
import { planLedgerSync } from './ledgerSync';
import type { ReadEntry } from './announce';

const e = (id: string, hash: string, at: string): ReadEntry => ({ id, hash, at, summary: null, count: 0 });
const r = (post_id: string, hash: string, read_at: string) => ({ post_id, hash, read_at, summary: null, action_count: 0 });

describe('the ledger mirror', () => {
  it('pulls what the account has and this device lacks, pushes the reverse, and only ever adds', () => {
    const local = new Map([['a', e('a', 'h1', '2026-09-27T10:00:00Z')], ['b', e('b', 'h1', '2026-09-27T10:00:00Z')]]);
    const remote = [r('b', 'h1', '2026-09-27T10:00:00Z'), r('c', 'h1', '2026-09-27T11:00:00Z')];
    const plan = planLedgerSync(local, remote);
    expect(plan.pull.map((x) => x.id)).toEqual(['c']);
    expect(plan.push.map((x) => x.id)).toEqual(['a']);
  });
  it('the same post read on both sides after an edit: the newer read wins', () => {
    const local = new Map([['a', e('a', 'old', '2026-09-27T10:00:00Z')]]);
    const remote = [r('a', 'new', '2026-09-27T12:00:00Z')];
    const plan = planLedgerSync(local, remote);
    expect(plan.pull.map((x) => x.hash)).toEqual(['new']);
    expect(plan.push).toEqual([]);
    const back = planLedgerSync(new Map([['a', e('a', 'newer', '2026-09-27T13:00:00Z')]]), remote);
    expect(back.pull).toEqual([]);
    expect(back.push.map((x) => x.hash)).toEqual(['newer']);
  });
  it('compares instants, not strings: Postgres says +00:00 where the browser wrote Z', () => {
    // Same post, edited and re-read on the laptop a minute after the phone read the old body.
    const local = new Map([['a', e('a', 'old', '2026-09-28T01:17:46.998Z')]]);
    const remote = [r('a', 'new', '2026-09-28T01:18:46.998+00:00')];
    expect(planLedgerSync(local, remote).pull.map((x) => x.hash)).toEqual(['new']);
    // And the reverse: the local read is newer, so the account gets it, not the other way round.
    const local2 = new Map([['a', e('a', 'newer', '2026-09-28T01:19:46.998Z')]]);
    const plan = planLedgerSync(local2, remote);
    expect(plan.pull).toEqual([]);
    expect(plan.push.map((x) => x.hash)).toEqual(['newer']);
  });
  it('nothing to do when both sides agree', () => {
    const local = new Map([['a', e('a', 'h1', '2026-09-27T10:00:00Z')]]);
    expect(planLedgerSync(local, [r('a', 'h1', '2026-09-27T10:00:00Z')])).toEqual({ pull: [], push: [] });
  });
});

describe('the reader version travels with the ledger', () => {
  it('a re-read of the same words by a newer reader wins on either side', async () => {
    const { planLedgerSync } = await import('./ledgerSync');
    const local = new Map([['p1', { id: 'p1', hash: 'h', at: '2026-09-20T00:00:00Z', summary: null, count: 1, v: 2 }]]);
    const remote = [{ post_id: 'p1', hash: 'h', read_at: '2026-09-21T00:00:00Z', summary: null, action_count: 1, reader_version: 1 }];
    expect(planLedgerSync(local, remote).push.map((e) => e.v)).toEqual([2]);
    expect(planLedgerSync(local, remote).pull).toEqual([]);
    const old = new Map([['p1', { id: 'p1', hash: 'h', at: '2026-09-22T00:00:00Z', summary: null, count: 1 }]]);
    expect(planLedgerSync(old, [{ ...remote[0], reader_version: 2 }]).pull.map((e) => e.v)).toEqual([2]);
  });
});
