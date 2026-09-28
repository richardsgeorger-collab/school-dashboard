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
  it('nothing to do when both sides agree', () => {
    const local = new Map([['a', e('a', 'h1', '2026-09-27T10:00:00Z')]]);
    expect(planLedgerSync(local, [r('a', 'h1', '2026-09-27T10:00:00Z')])).toEqual({ pull: [], push: [] });
  });
});
